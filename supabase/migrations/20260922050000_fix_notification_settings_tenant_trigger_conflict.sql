-- 20260920100000_branch_appointment_reminder_settings.sql dropped the plain
-- unique constraint on notification_settings(tenant_id) and replaced it with
-- a partial index (where location_id is null) to support per-branch
-- overrides, but never updated this trigger's ON CONFLICT target to match.
-- Since ON CONFLICT (tenant_id) DO NOTHING requires an exact (non-partial)
-- constraint/index on those columns, every tenant INSERT since that
-- migration shipped has failed outright with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification" — blocking
-- all new signups.
create or replace function public.create_notification_settings_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) where location_id is null do nothing;
  return new;
end;
$$;
