-- Reminder retry state (FR-7..FR-9). last_reminder_sent_at keeps its column
-- name but narrows to a success-only marker: existing non-null rows stay
-- "done" and are never retried, which is exactly the no-backfill decision.
alter table public.appointments
  add column if not exists reminder_attempt_count integer not null default 0,
  add column if not exists last_reminder_attempt_at timestamptz,
  add column if not exists reminder_failed_at timestamptz;

comment on column public.appointments.last_reminder_sent_at is
  'Set only when a reminder was delivered on at least one channel. Non-null = never retry.';
comment on column public.appointments.reminder_attempt_count is
  'Reminder attempts made by send-appointment-reminders. Capped at 3 (MAX_REMINDER_ATTEMPTS).';
comment on column public.appointments.reminder_failed_at is
  'Set when reminder attempts were exhausted without a successful channel. Terminal.';

-- The reminders job scans per tenant, ordered by scheduled_start, over the
-- small set of appointments still awaiting a reminder. now() is not
-- immutable so it cannot appear in the predicate; the static part of the
-- eligibility check does the pruning.
create index if not exists idx_appointments_reminder_due
  on public.appointments (tenant_id, scheduled_start)
  where status = 'scheduled'
    and last_reminder_sent_at is null
    and reminder_failed_at is null;
