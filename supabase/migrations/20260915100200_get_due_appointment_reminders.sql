-- notification-settings-missing-per-tenant (AD-4): one platform-wide RPC
-- replacing the per-tenant query loop. `3` (attempt cap) and `9 minutes`
-- (attempt cooldown) mirror MAX_REMINDER_ATTEMPTS and the overlap guard in
-- supabase/functions/send-appointment-reminders/reminder-state.ts (AD-7);
-- a mismatch is caught by the integration tests, not by inspection.

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
  with tenant_offsets as (
    select ns.tenant_id,
           ns.email_appointment_reminders,
           ns.sms_appointment_reminders,
           o.offset_minutes
    from notification_settings ns
    cross join lateral (
      select distinct unnest(array[ns.reminder_hours_before * 60, 30])::int as offset_minutes
    ) o
    where ns.email_appointment_reminders or ns.sms_appointment_reminders
  )
  select a.id, a.tenant_id, a.customer_id, a.scheduled_start,
         tof.offset_minutes, coalesce(d.attempt_count, 0),
         tof.email_appointment_reminders and c.email is not null,
         tof.sms_appointment_reminders and c.phone is not null,
         c.full_name, c.email, c.phone,
         t.name, t.sms_sender_name
  from tenant_offsets tof
  join appointments a
    on a.tenant_id = tof.tenant_id
   and a.status = 'scheduled'
   and a.scheduled_start > p_now
   and a.scheduled_start <= p_now + make_interval(mins => tof.offset_minutes)
  join tenants t on t.id = a.tenant_id
  left join customers c on c.id = a.customer_id
  left join appointment_reminder_sends d
    on d.appointment_id = a.id and d.offset_minutes = tof.offset_minutes
  where (d.id is null
         or (d.sent_at is null and d.failed_at is null and d.attempt_count < 3))
    and (d.last_attempt_at is null or d.last_attempt_at < p_now - interval '9 minutes')
  order by a.scheduled_start, tof.offset_minutes;
$$;

revoke all on function public.get_due_appointment_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.get_due_appointment_reminders(timestamptz) to service_role;

comment on function public.get_due_appointment_reminders(timestamptz) is
  'Platform-wide due-reminder work items (AD-4). Service-role only: returns customer PII.';
