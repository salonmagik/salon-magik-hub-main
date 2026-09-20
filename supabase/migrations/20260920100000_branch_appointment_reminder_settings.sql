-- Appointment reminder preferences can be inherited by every branch or
-- overridden for one branch. The tenant row (location_id IS NULL) remains the
-- apply-to-all default created by the existing tenant trigger.

alter table public.notification_settings
  drop constraint if exists notification_settings_tenant_id_key;

alter table public.notification_settings
  add column if not exists location_id uuid references public.locations(id) on delete cascade,
  add column if not exists reminder_extra_minutes_before integer;

alter table public.notification_settings
  drop constraint if exists notification_settings_reminder_extra_minutes_before_check;

alter table public.notification_settings
  add constraint notification_settings_reminder_extra_minutes_before_check
  check (reminder_extra_minutes_before is null or reminder_extra_minutes_before >= 31);

create unique index if not exists notification_settings_tenant_default_key
  on public.notification_settings (tenant_id)
  where location_id is null;

create unique index if not exists notification_settings_tenant_location_key
  on public.notification_settings (tenant_id, location_id)
  where location_id is not null;

comment on column public.notification_settings.location_id is
  'Null applies to every branch; a location id is a branch-specific override.';

comment on column public.notification_settings.reminder_extra_minutes_before is
  'Optional third reminder offset. The standard 24-hour and 30-minute reminders are always available when reminders are enabled.';

-- Resolve the effective settings for each appointment location. A branch row
-- wins over the tenant-wide row, and the extra offset is included alongside
-- the two standard offsets.
create or replace function public.get_due_appointment_reminders(p_now timestamptz default now())
returns table (
  appointment_id uuid,
  tenant_id uuid,
  customer_id uuid,
  scheduled_start timestamptz,
  offset_minutes integer,
  attempt_count integer,
  email_enabled boolean,
  sms_enabled boolean,
  customer_name text,
  customer_email text,
  customer_phone text,
  tenant_name text,
  tenant_sms_sender_name text
)
language sql
stable
set search_path = public
as $$
  with effective_settings as (
    select
      a.id,
      a.tenant_id,
      a.customer_id,
      a.scheduled_start,
      coalesce(ns.email_appointment_reminders, true) as email_appointment_reminders,
      coalesce(ns.sms_appointment_reminders, false) as sms_appointment_reminders,
      coalesce(ns.reminder_hours_before, 24) as reminder_hours_before,
      ns.reminder_extra_minutes_before
    from public.appointments a
    left join lateral (
      select
        s.email_appointment_reminders,
        s.sms_appointment_reminders,
        s.reminder_hours_before,
        s.reminder_extra_minutes_before
      from public.notification_settings s
      where s.tenant_id = a.tenant_id
        and (s.location_id = a.location_id or s.location_id is null)
      order by case when s.location_id = a.location_id then 0 else 1 end,
               s.updated_at desc
      limit 1
    ) ns on true
    where a.status = 'scheduled'
      and a.scheduled_start > p_now
      and (coalesce(ns.email_appointment_reminders, true) or coalesce(ns.sms_appointment_reminders, false))
  ),
  reminder_offsets as (
    select
      e.*,
      offsets.offset_minutes
    from effective_settings e
    cross join lateral (
      select distinct unnest(
        array_remove(
          array[
            coalesce(e.reminder_hours_before, 24) * 60,
            30,
            e.reminder_extra_minutes_before
          ]::integer[],
          null
        )
      )::integer as offset_minutes
    ) offsets
    where e.scheduled_start <= p_now + make_interval(mins => offsets.offset_minutes)
  )
  select
    r.id,
    r.tenant_id,
    r.customer_id,
    r.scheduled_start,
    r.offset_minutes,
    coalesce(d.attempt_count, 0),
    r.email_appointment_reminders and c.email is not null,
    r.sms_appointment_reminders and c.phone is not null,
    c.full_name,
    c.email,
    c.phone,
    t.name,
    t.sms_sender_name
  from reminder_offsets r
  join public.tenants t on t.id = r.tenant_id
  left join public.customers c on c.id = r.customer_id
  left join public.appointment_reminder_sends d
    on d.appointment_id = r.id and d.offset_minutes = r.offset_minutes
  where (d.id is null
         or (d.sent_at is null and d.failed_at is null and d.attempt_count < 3))
    and (d.last_attempt_at is null or d.last_attempt_at < p_now - interval '9 minutes')
  order by r.scheduled_start, r.offset_minutes;
$$;

revoke all on function public.get_due_appointment_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.get_due_appointment_reminders(timestamptz) to service_role;
