-- notification-settings-missing-per-tenant (AD-1, AD-10): guarantee a
-- notification_settings row per tenant via trigger + backfill, and notify
-- owners of backfilled tenants that reminders are now on. Column DEFAULTs
-- already encode the settled UX (email reminders on, SMS off, digest off,
-- 24h lead time), so no default is repeated here.

create or replace function public.create_notification_settings_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trigger_create_notification_settings on public.tenants;
create trigger trigger_create_notification_settings
  after insert on public.tenants
  for each row execute function public.create_notification_settings_for_tenant();

comment on function public.create_notification_settings_for_tenant() is
  'Automatically creates a notification_settings row (with column defaults) when a new tenant is created.';
comment on trigger trigger_create_notification_settings on public.tenants is
  'Trigger that calls create_notification_settings_for_tenant() after tenant INSERT.';

-- Backfill every tenant missing a settings row, and remember which ones
-- were backfilled so the one-time owner notice below is driven from that
-- set — a re-run of this migration must not produce a second notice.
with backfilled as (
  insert into public.notification_settings (tenant_id)
  select t.id from public.tenants t
  where not exists (select 1 from public.notification_settings ns where ns.tenant_id = t.id)
  on conflict (tenant_id) do nothing
  returning tenant_id
)
insert into public.notifications (tenant_id, type, title, description, entity_type)
select tenant_id, 'system',
       'Appointment reminders are now on',
       'Your customers now get an email reminder before their appointment. Review or turn this off in Notification settings.',
       'notification_settings'
from backfilled;
