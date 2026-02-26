-- WARNING: DESTRUCTIVE
-- Full product reset for test environments.
-- Removes tenant/app/backoffice runtime data and all auth users,
-- while preserving core seeded configuration tables.
--
-- Run in Supabase SQL Editor as an admin role.

begin;

-- 0) Preserve config/seed tables that should survive reset.
-- Add/remove from this list if your environment needs different behavior.
create temporary table _reset_exclusions (table_name text primary key) on commit drop;
insert into _reset_exclusions (table_name) values
  ('backoffice_allowed_domains'),
  ('backoffice_page_keys'),
  ('backoffice_permission_keys'),
  ('market_countries'),
  ('market_country_currency'),
  ('platform_features'),
  ('plans'),
  ('platform_settings');

-- 1) Truncate all public runtime tables except exclusions.
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not in (select table_name from _reset_exclusions)
    order by tablename
  loop
    execute format('truncate table public.%I cascade', r.tablename);
  end loop;
end $$;

-- 2) Reset marketing master toggles to OFF (deterministic baseline).
update public.platform_features
set
  master_enabled = false,
  default_enabled = false,
  updated_at = now()
where lower(feature_key) in ('waitlist_enabled', 'other_countries_interest_enabled');

-- Remove any stale feature_flag rows for marketing toggles.
delete from public.feature_flags
where lower(name) in ('waitlist_enabled', 'other_countries_interest_enabled')
   or feature_id in (
     select id
     from public.platform_features
     where lower(feature_key) in ('waitlist_enabled', 'other_countries_interest_enabled')
   );

-- 3) Reset super-admin seed marker.
delete from public.platform_settings
where key = 'super_admin_seeded';

-- 4) Remove all application profiles and auth users.
-- (Supabase SQL editor blocks direct storage object deletes; clear buckets separately.)
delete from public.profiles;
delete from auth.users;

commit;

-- Manual post-step (Dashboard / Storage API):
-- Empty buckets used for runtime uploads, e.g.:
-- - sales-agent-kyc-docs
-- - any catalog import / media buckets used in your env
