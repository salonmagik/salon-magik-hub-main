-- Enforce one master-toggle row per feature and make evaluator honor master toggle first.

-- Keep most recently updated master row per feature before adding unique index.
with ranked_flags as (
  select
    id,
    row_number() over (
      partition by feature_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_num
  from public.feature_flags
  where feature_id is not null
)
delete from public.feature_flags ff
using ranked_flags rf
where ff.id = rf.id
  and rf.row_num > 1;

create unique index if not exists idx_feature_flags_feature_id_unique
  on public.feature_flags(feature_id)
  where feature_id is not null;

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
  master_flag as (
    select ff.id, ff.is_enabled
    from public.feature_flags ff
    join feature f on f.id = ff.feature_id
    order by ff.updated_at desc nulls last, ff.created_at desc nulls last, ff.id desc
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
    where coalesce((select mf.is_enabled from master_flag mf), false) = true
    order by c.specificity desc, c.priority desc, c.id desc
    limit 1
  )
  select
    case
      when coalesce((select mf.is_enabled from master_flag mf), false) = false then false
      else coalesce(w.is_enabled, f.default_enabled, false)
    end as enabled,
    w.id as matched_rule_id,
    w.priority as matched_priority,
    case
      when coalesce((select mf.is_enabled from master_flag mf), false) = false then 'master_disabled'
      when w.id is not null then coalesce(w.reason, 'rule_match')
      else 'default_fallback'
    end as matched_reason
  from feature f
  left join winner w on true

  union all

  select false, null::uuid, null::int, 'feature_not_found'
  where not exists (select 1 from feature);
$$;
