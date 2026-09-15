-- notification-settings-missing-per-tenant (AD-3): per-offset reminder
-- dispatch state, replacing the single last_reminder_sent_at column as the
-- eligibility key. Migration 20260915100000 must run first — the legacy
-- backfill below joins every appointment's tenant to its settings row.

create table if not exists public.appointment_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offset_minutes integer not null check (offset_minutes >= 0),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, offset_minutes)
);

alter table public.appointment_reminder_sends enable row level security;

-- Read-only for tenant users (support/debugging, and the surface any future
-- "why didn't my customer get a reminder" UI would use). Writes are
-- service-role only: no insert/update/delete policy is defined.
create policy "Users can read tenant reminder sends" on public.appointment_reminder_sends
  for select using (tenant_id in (select get_user_tenant_ids(auth.uid())));

comment on table public.appointment_reminder_sends is
  'Per-offset appointment reminder dispatch state (AD-3). Superseded appointments.last_reminder_sent_at as the eligibility key.';

-- Backfill out of the legacy columns, so an appointment already reminded
-- under the old single-send model is not reminded again at its long
-- offset. It *will* become eligible for the new 30-minute offset, which is
-- the intended new behaviour.
insert into public.appointment_reminder_sends
  (appointment_id, tenant_id, offset_minutes, attempt_count, last_attempt_at, sent_at, failed_at)
select a.id, a.tenant_id,
       coalesce(ns.reminder_hours_before, 24) * 60,
       coalesce(a.reminder_attempt_count, 0),
       a.last_reminder_attempt_at,
       a.last_reminder_sent_at,
       a.reminder_failed_at
from public.appointments a
join public.notification_settings ns on ns.tenant_id = a.tenant_id
where a.last_reminder_sent_at is not null or a.reminder_failed_at is not null
on conflict (appointment_id, offset_minutes) do nothing;

-- Index swap: last_reminder_sent_at/reminder_failed_at stop being written
-- (AD-8), so a predicate over them would freeze against stale state.
drop index if exists public.idx_appointments_reminder_due;
create index if not exists idx_appointments_reminder_scan
  on public.appointments (tenant_id, scheduled_start)
  where status = 'scheduled';

comment on column public.appointments.last_reminder_sent_at is
  'Deprecated 2026-09-15 — superseded by appointment_reminder_sends. Read-only historical value; nothing writes this.';
comment on column public.appointments.reminder_attempt_count is
  'Deprecated 2026-09-15 — superseded by appointment_reminder_sends. Read-only historical value; nothing writes this.';
comment on column public.appointments.last_reminder_attempt_at is
  'Deprecated 2026-09-15 — superseded by appointment_reminder_sends. Read-only historical value; nothing writes this.';
comment on column public.appointments.reminder_failed_at is
  'Deprecated 2026-09-15 — superseded by appointment_reminder_sends. Read-only historical value; nothing writes this.';
