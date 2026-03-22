alter table public.feature_flag_rules
  add column if not exists target_tenant_ids uuid[],
  add column if not exists target_user_ids uuid[],
  add column if not exists percentage_rollout int check (percentage_rollout is null or (percentage_rollout >= 0 and percentage_rollout <= 100));

create or replace function public.evaluate_feature_flag(
  p_feature_key text,
  p_environment text,
  p_app_name text,
  p_version text default null,
  p_country_code text default null,
  p_tenant_id uuid default null,
  p_user_id uuid default null
)
returns table (
  enabled boolean,
  matched_rule_id uuid,
  matched_priority int,
  matched_reason text
)
language sql
stable
as $$
  with feature as (
    select pf.id, pf.default_enabled
    from public.platform_features pf
    where lower(pf.feature_key) = lower(p_feature_key)
      and pf.status <> 'deprecated'
    limit 1
  ),
  context as (
    select
      coalesce(
        p_user_id::text,
        p_tenant_id::text,
        coalesce(p_environment, '') || ':' || coalesce(p_app_name, '')
      ) as rollout_subject
  ),
  candidates as (
    select
      r.id,
      r.is_enabled,
      r.priority,
      r.reason,
      (
        case when p_user_id is not null and r.target_user_ids is not null and p_user_id = any(r.target_user_ids) then 64 else 0 end +
        case when p_tenant_id is not null and r.target_tenant_ids is not null and p_tenant_id = any(r.target_tenant_ids) then 32 else 0 end +
        case when p_country_code is not null and r.country_codes is not null and upper(p_country_code) = any(r.country_codes) then 16 else 0 end +
        case when r.version_range is not null then 8 else 0 end +
        case when r.environment = p_environment and r.app_name = p_app_name then 4 else 0 end
      ) as specificity
    from public.feature_flag_rules r
    join feature f on f.id = r.feature_id
    cross join context c
    where r.environment = p_environment
      and r.app_name = p_app_name
      and (r.schedule_start is null or r.schedule_start <= now())
      and (r.schedule_end is null or r.schedule_end >= now())
      and (r.version_range is null or public.semver_matches_range(p_version, r.version_range))
      and (r.country_codes is null or (p_country_code is not null and upper(p_country_code) = any(r.country_codes)))
      and (r.target_tenant_ids is null or (p_tenant_id is not null and p_tenant_id = any(r.target_tenant_ids)))
      and (r.target_user_ids is null or (p_user_id is not null and p_user_id = any(r.target_user_ids)))
      and (
        r.percentage_rollout is null
        or r.percentage_rollout >= 100
        or abs(hashtext(c.rollout_subject)) % 100 < r.percentage_rollout
      )
  ),
  winner as (
    select c.*
    from candidates c
    order by c.specificity desc, c.priority desc, c.id desc
    limit 1
  )
  select
    coalesce(w.is_enabled, f.default_enabled, false) as enabled,
    w.id as matched_rule_id,
    w.priority as matched_priority,
    coalesce(w.reason, case when w.id is null then 'default' else null end) as matched_reason
  from feature f
  left join winner w on true

  union all

  select false, null::uuid, null::int, 'feature_not_found'
  where not exists (select 1 from feature);
$$;

drop policy if exists "Public can read selectable market countries" on public.market_countries;
create policy "Public can read selectable market countries"
on public.market_countries
for select
using (
  is_selectable = true
  and legal_status in ('active', 'legal_approved')
);

drop policy if exists "Public can read enabled market currencies" on public.market_country_currency;
create policy "Public can read enabled market currencies"
on public.market_country_currency
for select
using (
  is_enabled = true
  and exists (
    select 1
    from public.market_countries mc
    where mc.country_code = market_country_currency.country_code
      and mc.is_selectable = true
      and mc.legal_status in ('active', 'legal_approved')
  )
);
