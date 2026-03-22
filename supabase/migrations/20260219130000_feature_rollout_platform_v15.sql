create table if not exists public.platform_features (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('planned', 'active', 'deprecated')),
  app_scope text not null default 'platform',
  default_enabled boolean not null default false,
  owner_team text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_platform_features_updated_at on public.platform_features;
create trigger update_platform_features_updated_at
before update on public.platform_features
for each row execute function public.update_updated_at_column();

alter table public.platform_features enable row level security;

drop policy if exists "Backoffice can read platform features" on public.platform_features;
create policy "Backoffice can read platform features"
on public.platform_features
for select
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
  )
);

drop policy if exists "Super admins can manage platform features" on public.platform_features;
create policy "Super admins can manage platform features"
on public.platform_features
for all
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
);

insert into public.platform_features (feature_key, display_name, description, app_scope, default_enabled, status)
values
  ('waitlist_enabled', 'Waitlist Mode', 'Controls whether signups are routed through waitlist mode.', 'marketing', true, 'active'),
  ('other_countries_interest_enabled', 'Other Countries Interest CTA', 'Controls visibility of expansion interest capture on marketing.', 'marketing', false, 'active')
on conflict (feature_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  app_scope = excluded.app_scope,
  default_enabled = excluded.default_enabled,
  status = excluded.status;

alter table public.feature_flags
add column if not exists feature_id uuid references public.platform_features(id);

create index if not exists idx_feature_flags_feature_id on public.feature_flags(feature_id);

update public.feature_flags ff
set feature_id = pf.id
from public.platform_features pf
where ff.feature_id is null
  and lower(ff.name) = lower(pf.feature_key);

create table if not exists public.feature_flag_rules (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.platform_features(id) on delete cascade,
  environment text not null check (environment in ('dev', 'staging', 'prod')),
  app_name text not null,
  version_range text,
  country_codes text[],
  target_tenant_ids uuid[],
  target_user_ids uuid[],
  percentage_rollout int check (percentage_rollout is null or (percentage_rollout >= 0 and percentage_rollout <= 100)),
  priority int not null default 100,
  schedule_start timestamptz,
  schedule_end timestamptz,
  is_enabled boolean not null default false,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feature_flag_rules_feature_id on public.feature_flag_rules(feature_id);
create index if not exists idx_feature_flag_rules_environment_app on public.feature_flag_rules(environment, app_name);

drop trigger if exists update_feature_flag_rules_updated_at on public.feature_flag_rules;
create trigger update_feature_flag_rules_updated_at
before update on public.feature_flag_rules
for each row execute function public.update_updated_at_column();

alter table public.feature_flag_rules enable row level security;

drop policy if exists "Backoffice can read feature flag rules" on public.feature_flag_rules;
create policy "Backoffice can read feature flag rules"
on public.feature_flag_rules
for select
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
  )
);

drop policy if exists "Super admins can manage feature flag rules" on public.feature_flag_rules;
create policy "Super admins can manage feature flag rules"
on public.feature_flag_rules
for all
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
);

create or replace function public.semver_matches_range(p_version text, p_range text)
returns boolean
language plpgsql
immutable
as $$
declare
  version_parts int[];
  token text;
  op text;
  raw_version text;
  compare_parts int[];
begin
  if p_range is null or btrim(p_range) = '' then
    return true;
  end if;
  if p_version is null or btrim(p_version) = '' then
    return false;
  end if;

  version_parts := string_to_array(regexp_replace(p_version, '[^0-9\.]', '', 'g'), '.')::int[];
  while array_length(version_parts, 1) < 3 loop
    version_parts := version_parts || 0;
  end loop;

  foreach token in array string_to_array(regexp_replace(p_range, '\s+', ' ', 'g'), ' ')
  loop
    if token = '' then
      continue;
    end if;

    if token like '>=%' then
      op := '>=';
      raw_version := substring(token from 3);
    elsif token like '<=%' then
      op := '<=';
      raw_version := substring(token from 3);
    elsif token like '>%' then
      op := '>';
      raw_version := substring(token from 2);
    elsif token like '<%' then
      op := '<';
      raw_version := substring(token from 2);
    elsif token like '=%' then
      op := '=';
      raw_version := substring(token from 2);
    else
      op := '=';
      raw_version := token;
    end if;

    compare_parts := string_to_array(regexp_replace(raw_version, '[^0-9\.]', '', 'g'), '.')::int[];
    while array_length(compare_parts, 1) < 3 loop
      compare_parts := compare_parts || 0;
    end loop;

    if op = '>=' and version_parts < compare_parts then
      return false;
    elsif op = '<=' and version_parts > compare_parts then
      return false;
    elsif op = '>' and version_parts <= compare_parts then
      return false;
    elsif op = '<' and version_parts >= compare_parts then
      return false;
    elsif op = '=' and version_parts <> compare_parts then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

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
    where r.environment = p_environment
      and r.app_name = p_app_name
      and (r.schedule_start is null or r.schedule_start <= now())
      and (r.schedule_end is null or r.schedule_end >= now())
      and (r.version_range is null or public.semver_matches_range(p_version, r.version_range))
      and (r.country_codes is null or (p_country_code is not null and upper(p_country_code) = any(r.country_codes)))
      and (r.target_tenant_ids is null or (p_tenant_id is not null and p_tenant_id = any(r.target_tenant_ids)))
      and (r.target_user_ids is null or (p_user_id is not null and p_user_id = any(r.target_user_ids)))
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

create table if not exists public.market_countries (
  country_code text primary key,
  country_name text not null,
  is_selectable boolean not null default false,
  legal_status text not null default 'planned' check (legal_status in ('planned', 'legal_approved', 'active', 'paused')),
  go_live_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_market_countries_updated_at on public.market_countries;
create trigger update_market_countries_updated_at
before update on public.market_countries
for each row execute function public.update_updated_at_column();

create table if not exists public.market_country_currency (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.market_countries(country_code) on delete cascade,
  currency_code text not null,
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country_code, currency_code)
);

create unique index if not exists idx_market_country_currency_default
on public.market_country_currency(country_code)
where is_default = true;

drop trigger if exists update_market_country_currency_updated_at on public.market_country_currency;
create trigger update_market_country_currency_updated_at
before update on public.market_country_currency
for each row execute function public.update_updated_at_column();

alter table public.market_countries enable row level security;
alter table public.market_country_currency enable row level security;

drop policy if exists "Backoffice can read market countries" on public.market_countries;
create policy "Backoffice can read market countries"
on public.market_countries
for select
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
  )
);

drop policy if exists "Super admins can manage market countries" on public.market_countries;
create policy "Super admins can manage market countries"
on public.market_countries
for all
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
);

drop policy if exists "Backoffice can read market currency rules" on public.market_country_currency;
create policy "Backoffice can read market currency rules"
on public.market_country_currency
for select
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
  )
);

drop policy if exists "Super admins can manage market currency rules" on public.market_country_currency;
create policy "Super admins can manage market currency rules"
on public.market_country_currency
for all
using (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid()
      and bu.is_active = true
      and bu.role = 'super_admin'
  )
);

insert into public.market_countries (country_code, country_name, is_selectable, legal_status, go_live_at)
values
  ('GH', 'Ghana', true, 'active', now()),
  ('NG', 'Nigeria', true, 'active', now())
on conflict (country_code) do update
set
  country_name = excluded.country_name,
  is_selectable = excluded.is_selectable,
  legal_status = excluded.legal_status;

insert into public.market_country_currency (country_code, currency_code, is_default, is_enabled)
values
  ('GH', 'GHS', true, true),
  ('GH', 'USD', false, true),
  ('NG', 'NGN', true, true),
  ('NG', 'USD', false, true)
on conflict (country_code, currency_code) do update
set
  is_enabled = excluded.is_enabled;
