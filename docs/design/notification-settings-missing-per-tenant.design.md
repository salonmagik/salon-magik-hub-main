# Implementation Design — notification-settings-missing-per-tenant

Status: approved for implementation
Date: 2026-09-15
Author: principal (autonomous mode)

---

## References

- Backlog item: `docs/backlog-open-followups.md` → `## notification-settings-missing-per-tenant`
  (present on `feat/second-owner-foundation`, commit `f8d8fdde`; **not** on `main`). Evidence, the
  two candidate fix shapes and the settled UX decisions live there and are not restated here.
- Prior design this builds directly on: `docs/design/email-delivery-audit.design.md`
  (branch `feat/second-owner-foundation`, commit `6ed6189`) — AD-7 eligibility predicate, AD-8
  single state update, AD-9 window start, AD-10 callee-side logging.
- Prior implementer report: `.claudespace/.../reports/email-delivery-audit-implementer-report.md`

### Baseline branch (read this first)

`main` does **not** contain the email-delivery-audit work. The retry columns
(`reminder_attempt_count`, `last_reminder_attempt_at`, `reminder_failed_at`),
`reminder-state.ts`, and migration `20260915090000_appointment_reminder_retry.sql` exist only on
`feat/second-owner-foundation` (PR #131). **Implementation branches off
`feat/second-owner-foundation`, not `main`.** Building on `main` would silently re-introduce the
single-send behaviour this design replaces and collide with PR #131 on the same files.

### Scope note — folded-in defect

One adjacent defect is fixed here rather than deferred, per the fold-in test:
`send-appointment-notification/index.ts:338-343` writes `last_reminder_sent_at` on **every**
`action: "reminder"` call, including the manual "Send reminder" button in the dashboard
(`useAppointments.tsx:517`). Today that means one manual reminder permanently cancels every
automated reminder for that appointment. It is a defect (not a policy choice), it is not its own
backlog item, and it is in a file this design already changes.

---

## Architecture Decisions

### AD-1 — Guarantee a settings row per tenant (trigger + backfill), not a left-join at read time

**Decision.** Backfill a default `notification_settings` row for every existing tenant and add an
`AFTER INSERT` trigger on `public.tenants` that creates one for every new tenant. Both cron
functions keep reading `notification_settings` directly.

**Reasoning.** The repository already has exactly this pattern, one table over:
`20260221120006_create_salon_wallet_trigger.sql` (trigger function + trigger + backfill +
`ON CONFLICT DO NOTHING`). Reusing it keeps one source of truth for defaults — the column
`DEFAULT`s already encode the settled UX verbatim (`email_appointment_reminders true`,
`sms_appointment_reminders false`, `digest_frequency 'off'`, `reminder_hours_before 24`) — and it
fixes every present and future consumer of the table at once, not just the two jobs we happen to
know about.

**Rejected: iterate `tenants` and left-join settings with in-code defaults.** The backlog names
this as the alternative and correctly notes it survives a missed backfill. Rejected because it
duplicates the default set into (at minimum) the reminders job, the digest job and
`useNotificationSettings.tsx`, where it will drift; the column `DEFAULT`s would become decorative;
and the "newly created tenant silently excluded" failure it guards against is exactly what the
trigger eliminates. The trigger closes the same hole with less surface.

**Residual risk accepted:** a tenant row inserted by a path that suppresses triggers (`COPY ...
FREEZE`, a direct restore) would still miss its row. Covered by the invariant check in Verification.

### AD-2 — No new settings column; effective offsets are derived as `[reminder_hours_before*60, 30]`

**Decision.** A tenant's reminder offsets are computed, in one place (the SQL RPC of AD-4), as
`distinct unnest(array[reminder_hours_before * 60, 30])`. No `reminder_offsets` array column is
added, and `reminder_hours_before` is neither changed, migrated, nor re-defaulted.

**Reasoning.** The requirement is "two default reminders — the salon's configured lead time and a
30-minute nudge — leaving any salon's existing `reminder_hours_before` untouched". Derivation
expresses exactly that and nothing more. The settings UI
(`useNotificationSettings.tsx` + the Settings page control) keeps writing the single integer it
already writes, so it needs no change and cannot drift.

**Rejected: `reminder_offsets_minutes integer[]` on `notification_settings`** (the backlog's own
suggestion). It is the more expressive model, but it forces a choice between two bad outcomes:
either the settings UI is rebuilt to manage a list (scope nobody asked for, and a new UX surface
on a bug fix), or the UI keeps writing `reminder_hours_before` while the job reads the array — a
dual-write where a salon's edit silently stops taking effect. Deriving keeps one writable field
and one reader. Making the 30-minute offset individually configurable is recorded as a deferral
(OQ-1), not built.

**Consequence, explicitly accepted:** the one dev tenant with `reminder_hours_before = 2` keeps
`2` and gets offsets `[120, 30]`. The backlog asks whether that `2` is an artifact — under
"leave existing values untouched" the answer is that it stays as configured; the salon can change
it on the settings page. Nothing in this pass rewrites it.

### AD-3 — Per-offset state in a new `appointment_reminder_sends` table

**Decision.** One row per `(appointment_id, offset_minutes)`, carrying `attempt_count`,
`last_attempt_at`, `sent_at`, `failed_at`. Eligibility, the 3-attempt cap and the terminal-failure
marker all move from the appointment row to this row. The four per-appointment reminder columns on
`appointments` are retained but deprecated (AD-8).

**Reasoning.** Per-offset state is unavoidable: `last_reminder_sent_at is null` as the eligibility
key is precisely what makes a second offset impossible. A child table (rather than per-offset
columns) keeps the offset set open — changing `reminder_hours_before` changes which offsets exist
for a tenant, which columns cannot express — and keeps the retry semantics from
`reminder-state.ts` intact by simply rebinding them from appointment to dispatch. Row volume is
2 per upcoming appointment, created lazily only when an offset first becomes due.

**Rejected: a JSONB map on `appointments`.** No unique constraint, no partial index, no
row-level concurrency, and every read/modify/write is a full-document rewrite.

### AD-4 — One SQL RPC (`get_due_appointment_reminders`) replaces the per-tenant query loop

**Decision.** Add a `stable` SQL function returning the due `(appointment, offset)` work items for
the whole platform in one call, joined to customer contact details, tenant SMS sender and the
tenant's channel toggles. The edge function calls it once per run and loops over the result.

**Reasoning.** Two forces converge here. (a) "No dispatch row exists for this offset yet" is an
anti-join; PostgREST cannot express it, so keeping the query in TS would mean fetching candidates
and filtering in application code — the exact shape the performance rules forbid. (b) The current
loop is N+1 by construction (one appointments query plus one tenants query per tenant, every run)
and this change triples the cron cadence (AD-6), so the per-run cost must come down, not up. One
query per run, driven by indexes, does both. The eligibility predicate also becomes a single
SQL object that can be tested directly against a database.

**Rejected: keep the per-tenant loop and add a second query for dispatch rows.** 3N queries per
run at 6 runs/hour, with the anti-join still done in memory.

### AD-5 — Collapse: at most one reminder message per appointment per run

**Decision.** When more than one offset for the same appointment is due in the same run (e.g. a
booking created 20 minutes before its start, where both the 24h window and the 30m window are
already open), send **one** message and mark every due offset in that group with the same outcome.

**Reasoning.** Without this, such a booking receives two identical emails seconds apart. This is
an anti-duplicate rule, not a throttle — it never withholds a reminder a customer would otherwise
receive, so it does not touch the settled "no throttle or suppression window" decision.

**Rejected: suppress an offset whose window opened before the appointment was created**
("you can't be reminded before you booked"). It is defensible, but it *withholds* a send, which is
the thing the settled decisions say not to do. Not built.

### AD-6 — Cron cadence to every 10 minutes; window rule stays `scheduled_start <= now + offset`

**Decision.** Re-schedule `send-appointment-reminders` from `*/30 * * * *` to `*/10 * * * *`.
Eligibility stays "the window is open and the appointment has not started":
`scheduled_start > now AND scheduled_start <= now + offset_minutes`.

**Reasoning.** The 30-minute offset is not *missed* at a 30-minute cadence — any future
appointment eventually lands inside `(now, now+30m]` at some tick — but the delivered lead time is
uniform over 0–30 minutes, so a "30-minute reminder" can legitimately arrive 1 minute before the
appointment, which is useless to the customer. A 10-minute cadence bounds the lead time to
20–30 minutes. The cost is 3× invocations of a function whose steady state is one indexed query
returning zero rows. A fire-once-inside-window rule is already what the dispatch table gives us
(AD-3), so no additional cadence logic is needed.

Note `20260704000001_schedule_appointment_reminders.sql` guards with `if not exists`, so the new
migration must call `cron.schedule` unconditionally (pg_cron upserts by jobname) rather than
copying that guard — otherwise the schedule change is a no-op on every existing environment.

### AD-7 — 9-minute attempt cooldown as the overlap guard

**Decision.** The RPC additionally requires `d.last_attempt_at is null or d.last_attempt_at <
p_now - interval '9 minutes'`, and the edge function claims work (increments `attempt_count`,
sets `last_attempt_at`) **before** sending, then records the outcome after.

**Reasoning.** pg_cron fires `net.http_post` asynchronously, so a slow run can overlap the next
tick; nothing today prevents two concurrent runs from picking up the same appointment and
double-sending. Claim-before-send plus a cooldown just under the cadence makes an overlapping run
see zero eligible rows without introducing a lease table or advisory locks. It also means a crash
mid-send costs one attempt out of three rather than looping forever, and it spaces retries onto
the following tick instead of hammering within one.

### AD-8 — Deprecate, don't drop, the per-appointment reminder columns

**Decision.** `last_reminder_sent_at`, `reminder_attempt_count`, `last_reminder_attempt_at` and
`reminder_failed_at` stay on `appointments`. Nothing writes them after this change; their comments
are updated to say so. They are backfilled *out of* (not into) — see Database Changes. Dropping
them is a follow-up (OQ-2).

**Reasoning.** They are referenced by generated types in `packages/supabase-client/dist` and by
PR #131's own migration comments. Dropping them in the same pass that introduces the replacement
makes the change irreversible and the review harder, for no runtime benefit. Deprecate now, drop
once the new path has run in production for a cycle.

### AD-9 — `send-daily-digest` needs no code change

**Decision.** The digest is fixed entirely by AD-1. No change to
`supabase/functions/send-daily-digest/index.ts`.

**Reasoning.** The digest already filters `.neq("digest_frequency", "off")` and the column default
is `'off'`, so backfilled rows are correctly inert — which is the settled decision ("digest stays
opt-in"). A tenant that turns the digest on gets a row either way (the UI inserts one today when
none exists). The missing row was never the digest's user-visible bug; it is fixed for
correctness and consistency, and the digest's behaviour is unchanged. Stating this explicitly so
the absence of a digest change is read as a decision, not an omission.

### AD-10 — The one-time owner notice reuses the existing notifications bell

**Decision.** The "appointment reminders are now on" notice is one row per tenant in
`public.notifications` (`type = 'system'`, `entity_type = 'notification_settings'`), inserted by
the backfill migration. `NotificationsPanel.handleNotificationClick` gains one branch routing that
notice to `/salon/settings?tab=notifications`.

**Reasoning.** The bell, its unread state, its realtime subscription, its RLS and its
"mark as read" affordance all already exist, and the destination route is already used verbatim by
`handleViewSettings` in the same file. A bespoke dismissible banner would need new state, new
persistence for "dismissed", and a new component. One row and one `if` is the whole feature.

---

## Components

| Component | Change |
|---|---|
| `supabase/migrations/<ts>_notification_settings_per_tenant.sql` | new — trigger fn + trigger + backfill + one-time notice rows |
| `supabase/migrations/<ts>_appointment_reminder_offsets.sql` | new — `appointment_reminder_sends`, RLS, indexes, backfill from legacy columns, column deprecation comments, index swap |
| `supabase/migrations/<ts>_get_due_appointment_reminders.sql` | new — the RPC (AD-4), grants |
| `supabase/migrations/<ts>_reschedule_appointment_reminders_10min.sql` | new — `cron.schedule` to `*/10 * * * *` (AD-6) |
| `supabase/functions/send-appointment-reminders/index.ts` | rewrite of the work-selection half: one RPC call, group by appointment, claim → send → settle |
| `supabase/functions/send-appointment-reminders/reminder-state.ts` | rebind `nextReminderState` from appointment to dispatch (field rename only; truth table unchanged) |
| `supabase/functions/send-appointment-reminders/reminder-state.test.ts` | extend for per-offset + collapse |
| `supabase/functions/send-appointment-notification/index.ts` | remove the `action === "reminder"` write to `last_reminder_sent_at` (folded-in defect) |
| `apps/salon-admin/src/components/notifications/NotificationsPanel.tsx` | one routing branch for the system notice (AD-10) |
| `packages/supabase-client` types | regenerate for the new table + RPC |

**Explicitly unchanged:** `send-daily-digest/index.ts` (AD-9),
`apps/salon-admin/src/hooks/useNotificationSettings.tsx` — its in-memory `defaultSettings` fallback
already matches the column defaults exactly, so once rows exist the insert branch simply stops
being reached. No frontend settings change.

---

## Data Flow

**Tenant creation.** `INSERT INTO tenants` → `AFTER INSERT` trigger →
`INSERT INTO notification_settings (tenant_id) ... ON CONFLICT DO NOTHING`. All other values come
from column defaults, so the settled UX is expressed once, in the schema.

**A reminder run (every 10 minutes).**

1. pg_cron → `net.http_post` → edge function, authenticated by `x-reminders-secret` (unchanged).
2. Function calls `get_due_appointment_reminders(now())` — one round trip. Each returned row is a
   work item: appointment + offset + contact details + channel toggles + current `attempt_count`.
3. Work items are grouped by `appointment_id` (AD-5). Each group becomes one send.
4. **Claim:** upsert an `appointment_reminder_sends` row for every offset in the group with
   `attempt_count = attempt_count + 1`, `last_attempt_at = now`.
5. **Send:** in-memory re-check that `scheduled_start > Date.now()` (a slow run may have crossed
   it); then the email leg (`POST send-appointment-notification`, `action: "reminder"`, success =
   `response.ok`) and the SMS leg (`sendArkeselSMS` + `message_logs` row) exactly as today.
6. **Settle:** `nextReminderState` decides the outcome once for the group; every offset row in the
   group is updated with the same `sent_at` / `failed_at`.
7. Response: `{ ok, emailsSent, smsSent, errors, exhausted }` — shape unchanged, so any existing
   monitoring keeps working.

**Owner notice.** Migration inserts one `notifications` row per tenant → bell shows unread → click
→ `/salon/settings?tab=notifications`.

---

## API Changes

None (no HTTP contract changes). One new database RPC, service-role only:

```
get_due_appointment_reminders(p_now timestamptz default now())
  -> setof (appointment_id, tenant_id, customer_id, scheduled_start, offset_minutes,
            attempt_count, email_enabled, sms_enabled,
            customer_name, customer_email, customer_phone,
            tenant_name, tenant_sms_sender_name)
```

`EXECUTE` granted to `service_role` only; revoked from `public`, `anon`, `authenticated`.
`SECURITY INVOKER` — the only caller is the service role, which already bypasses RLS, so there is
no reason to take on a definer escalation.

---

## Database Changes

### Migration 1 — settings row per tenant

```sql
create or replace function public.create_notification_settings_for_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- Backfill. Every other column takes its DEFAULT, which is where the settled
-- UX lives: email reminders on, SMS off, digest off, 24h lead time.
insert into public.notification_settings (tenant_id)
select t.id from public.tenants t
where not exists (select 1 from public.notification_settings ns where ns.tenant_id = t.id)
on conflict (tenant_id) do nothing;

-- One-time owner notice (AD-10), only for tenants that did not already have
-- a row — a salon that had configured its settings is not being changed and
-- must not be told it was.
insert into public.notifications (tenant_id, type, title, description, entity_type)
select t.id, 'system',
       'Appointment reminders are now on',
       'Your customers now get an email reminder before their appointment. Review or turn this off in Notification settings.',
       'notification_settings'
from public.tenants t
where <tenant was backfilled by this migration>;
```

Implementation note: capture the backfilled ids with a CTE
(`insert ... returning tenant_id`) and drive the notice insert from it, so re-running the migration
cannot produce a second notice.

### Migration 2 — per-offset dispatch state

```sql
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
```

**Backfill out of the legacy columns** — so an appointment already reminded under the old
single-send model is not reminded again at its long offset:

```sql
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
```

Migration 1 must run first — the join above depends on every tenant having a settings row.

**Index swap.** The existing `idx_appointments_reminder_due` has
`last_reminder_sent_at is null and reminder_failed_at is null` in its predicate; those columns stop
being written, so the index would freeze against stale state:

```sql
drop index if exists public.idx_appointments_reminder_due;
create index if not exists idx_appointments_reminder_scan
  on public.appointments (tenant_id, scheduled_start)
  where status = 'scheduled';
```

**Deprecation comments** on the four `appointments` columns: "Deprecated 2026-09-15 — superseded by
appointment_reminder_sends. Read-only historical value; nothing writes this."

### Migration 3 — the RPC

```sql
create or replace function public.get_due_appointment_reminders(p_now timestamptz default now())
returns table (...)
language sql stable
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
         tof.sms_appointment_reminders   and c.phone is not null,
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
```

`3` and `9 minutes` are the SQL-side halves of `MAX_REMINDER_ATTEMPTS` and the cooldown; both are
commented in the migration as mirroring `reminder-state.ts`, and the mismatch is caught by an
integration test rather than by inspection.

### Migration 4 — cadence

`cron.schedule('send-appointment-reminders', '*/10 * * * *', $job$ ...same body... $job$);`
called unconditionally (pg_cron upserts by jobname). Body copied verbatim from
`20260704000001` — same vault secrets, same header.

All four applied with `supabase db push` against local, then dev. Never `db reset`, never pointed
at prod.

---

## Validation

- `offset_minutes >= 0` (check constraint). A tenant with `reminder_hours_before = 0` yields offsets
  `{0, 30}`; the `scheduled_start > p_now` predicate makes offset 0 permanently ineligible, which is
  the correct reading of "remind 0 hours before".
- `distinct` in the offsets lateral collapses a tenant whose `reminder_hours_before * 60 = 30`
  (not currently reachable — the column is an integer number of hours — but the model shouldn't
  depend on that).
- `unique (appointment_id, offset_minutes)` is the idempotency boundary; every write to the table
  goes through it as an upsert.
- Edge function rejects on missing/incorrect `x-reminders-secret` (unchanged).

---

## Error Handling

- **RPC fails** → log, return 500 with `{ error }`, no state written. Next tick retries; no attempt
  is consumed.
- **Email leg fails** (`!response.ok` or throw) → `emailOk = false`, `errors++`. The callee already
  writes the classified `failed` `message_logs` row (AD-10 of the prior design); this caller does
  not duplicate it.
- **SMS leg fails** → `smsOk = false`, `errors++`, `failed` `message_logs` row written here as today.
- **Both legs fail / no channel available** → `nextReminderState` governs: attempt counted,
  retried next tick after the cooldown, terminal `failed_at` at 3 attempts, immediate `failed_at`
  when no channel was enabled at all.
- **Claim upsert fails** → skip the group, `errors++`. Nothing was sent and nothing was consumed.
- **Settle update fails after a successful send** → `errors++` and log. The claim already counted
  the attempt, so the worst case is one duplicate on a later tick rather than an unbounded loop —
  strictly better than the current behaviour, where a failed settle re-sent forever.
- One failing tenant/appointment never aborts the run: every group is individually try/caught.

---

## Security Considerations

- The RPC is service-role only and `SECURITY INVOKER`; no new privilege path. It returns customer
  PII (name/email/phone), which is exactly why it is not exposed to `authenticated`.
- `appointment_reminder_sends` has RLS on with a tenant-scoped **select-only** policy; inserts and
  updates are service-role. It holds no PII — appointment/tenant ids and timestamps only.
- The trigger function is `SECURITY DEFINER` (it must insert on behalf of whoever creates a tenant)
  with `set search_path = public`, matching `create_salon_wallet_for_tenant`. It writes one row
  keyed by `new.id` and takes no user input.
- Cron auth is unchanged: the shared secret from Vault, checked in-function.
- No new secrets, no new vault entries, no change to any function URL.

---

## Performance Considerations

- **Per run: one RPC call**, down from `2N + 1` queries for N tenants. This is what pays for the 3×
  cadence increase.
- **Access paths.** The driving scan is `idx_appointments_reminder_scan (tenant_id,
  scheduled_start) where status = 'scheduled'`, bounded above by `p_now + offset` (≤ the tenant's
  lead time, typically 24h) and below by `p_now` — it never touches historical appointments. The
  anti-join probes `appointment_reminder_sends` on its unique `(appointment_id, offset_minutes)`
  index. `customers` and `tenants` are primary-key lookups.
- **No N+1 in the function.** Everything the send needs — customer contact, tenant name, SMS sender,
  channel toggles, attempt count — arrives in the RPC row. The old per-tenant `tenants` lookup
  inside the loop is deleted.
- **Writes per group: 2** (claim upsert, settle update), each hitting the unique index, regardless
  of how many offsets are due.
- **Row growth:** ≤ 2 rows per appointment that reaches a reminder window, created lazily. No
  backfill for future appointments. A pruning job for rows on long-past appointments is a
  follow-up, not needed at current volume (single-digit tenants).
- **Steady state is cheap:** with no due work, the run is one index scan returning zero rows.

---

## Compatibility

- **Backward compatible at every contract.** HTTP response shape of the reminders function is
  unchanged. No column is dropped, no column type changes, no existing column is rewritten.
- **`reminder_hours_before` is untouched** — not migrated, not re-defaulted, still the field the
  settings UI writes. A salon's configured value keeps governing its long offset.
- **Already-reminded appointments** are protected by the Migration 2 backfill: they carry a
  `sent_at` dispatch row for their long offset and will not be re-reminded. They *will* receive the
  new 30-minute reminder, which is the intended new behaviour.
- **Manual reminders**: after the folded-in fix, a dashboard "Send reminder" no longer writes any
  scheduled state, so it neither cancels nor consumes an automated reminder. It is still logged in
  `message_logs` exactly as before.
- **Deprecation:** the four `appointments` reminder columns become read-only historical values with
  comments saying so; dropping them is OQ-2.
- **Rollback:** revert the cron migration to `*/30`, and the function to the PR #131 version. The
  dispatch table and settings rows can stay — the old code ignores the former and is fixed by the
  latter.

---

## Edge Cases

1. **Both offsets due in one run** (booking made <30 min before start) → AD-5 collapse: one message,
   both offsets marked.
2. **Appointment starts mid-run** → in-memory `scheduled_start > Date.now()` re-check skips the send;
   the claim has been consumed, but the RPC will never return the row again anyway.
3. **Appointment rescheduled later** → `scheduled_start` moves; a dispatch row already marked `sent`
   for an offset stays sent, so the customer is not re-reminded for that offset at the new time.
   Flagged as OQ-3 — a rescheduled appointment arguably deserves a fresh reminder cycle, but that is
   a product call, not a defect in this design.
4. **Appointment cancelled/completed** → `status <> 'scheduled'` drops it from the RPC immediately;
   dispatch rows are inert.
5. **Appointment deleted** → `on delete cascade` removes dispatch rows.
6. **Customer has neither email nor phone** → `email_enabled` and `sms_enabled` both false →
   `anyChannelEnabled` false → terminal `failed_at` on the first pass (existing `reminder-state.ts`
   behaviour, unchanged), so it is not retried three times for nothing.
7. **Tenant turns all reminder channels off** → excluded by the RPC's `where` clause; no rows, no
   attempts consumed.
8. **Tenant turns reminders back on mid-window** → the appointment becomes eligible again on the
   next tick provided its offset row is not already `sent`/`failed`.
9. **Salon changes `reminder_hours_before` while appointments are pending** → the offset set changes;
   the old offset's dispatch row is orphaned (harmless), the new offset gets its own row.
10. **Overlapping cron runs** → the 9-minute cooldown (AD-7) makes the second run see zero rows.
11. **Tenant created during the backfill** → trigger handles it; `ON CONFLICT DO NOTHING` makes the
    backfill and the trigger safe against each other in either order.
12. **Migration re-run** → every statement is `if not exists` / `on conflict do nothing`; the notice
    insert is driven by the backfill's `RETURNING`, so no duplicate notices.
13. **Tenant that already had a settings row** → no backfill, no notice, no behaviour change.

---

## Tests Required

**Unit (Deno, `deno test`)** — `reminder-state.test.ts`, extending the existing 80-line suite:

- existing truth table still passes with dispatch-shaped fields (success, all-fail, no-channel,
  exhaustion at 3);
- collapse: two due offsets for one appointment produce one send and two identical outcomes;
- a group whose appointment has already started is skipped before any send.

**Integration (against local Supabase, URL/keys overridden in-shell — do not edit
`supabase/functions/.env`, which points at dev)**:

- tenant insert → `notification_settings` row exists with the settled defaults;
- backfill → `count(tenants) = count(notification_settings)`;
- backfill → exactly one `notifications` row per previously-row-less tenant, none for the
  already-configured tenant;
- RPC returns both offsets for an appointment 25h out at the right ticks and neither for a
  cancelled one;
- RPC excludes an offset with `sent_at` set, one with `failed_at` set, one at `attempt_count = 3`,
  and one attempted 2 minutes ago (cooldown);
- RPC never returns an appointment whose `scheduled_start <= p_now`;
- legacy backfill: an appointment with `last_reminder_sent_at` set gets a `sent` long-offset row and
  is not returned for that offset, but *is* returned for offset 30;
- the tenant with `reminder_hours_before = 2` yields offsets `{120, 30}`, not `{1440, 30}`.

**End-to-end (dev project, after `supabase db push` + function deploy)**:

- invoke `send-appointment-reminders` manually with the secret header; assert `emailsSent > 0` for
  the two known dev appointments whose tenants previously had no settings row — this is the exact
  symptom in the report and is the acceptance signal;
- invoke again immediately; assert `emailsSent = 0` (cooldown + dispatch state, no duplicate);
- `message_logs` shows one `sent` `appointment_reminder` row per reminder, no `failed` rows;
- after the 30-minute window opens for one of them, a second distinct reminder is sent;
- digest behaviour unchanged: `send-daily-digest` still skips every `off` tenant.

**Frontend (`vitest`)**: a `type: 'system'`, `entity_type: 'notification_settings'` notification
routes to `/salon/settings?tab=notifications` on click.

---

## Verification

```bash
# migrations — local first, then dev. never db reset, never prod.
supabase db push                       # local stack
supabase db push --linked              # dev project only

# unit tests
deno test --allow-all supabase/functions/send-appointment-reminders/
deno test --allow-all supabase/functions/_shared/

# app
npm run lint
npm run test

# regenerate types after migrations 2 and 3
supabase gen types typescript --local > packages/supabase-client/src/supabase/types.ts
```

Post-deploy SQL invariants (dev):

```sql
-- must be 0
select count(*) from tenants t
where not exists (select 1 from notification_settings ns where ns.tenant_id = t.id);

-- cadence actually changed
select jobname, schedule from cron.job where jobname = 'send-appointment-reminders';

-- work the job would do right now
select * from get_due_appointment_reminders(now());
```

---

## Implementation Order

1. **Branch from `feat/second-owner-foundation`** (not `main`). Confirm
   `supabase/migrations/20260915090000_appointment_reminder_retry.sql` and `reminder-state.ts` are
   present before starting.
2. Migration 1 (trigger + backfill + one-time notices). `supabase db push` locally; assert the
   invariant query returns 0 and one notice per backfilled tenant.
3. Migration 2 (`appointment_reminder_sends`, RLS, legacy backfill, index swap, deprecation
   comments). Push; assert already-reminded appointments have a `sent` long-offset row.
4. Migration 3 (RPC + grants). Push; exercise `select * from get_due_appointment_reminders(...)`
   against seeded fixtures covering every eligibility case above.
5. Regenerate `packages/supabase-client` types.
6. `reminder-state.ts`: rename fields to dispatch shape, add the collapse helper. Update and extend
   `reminder-state.test.ts`. Green before touching `index.ts`.
7. `send-appointment-reminders/index.ts`: replace the settings-loop + per-tenant queries with the
   single RPC call, group by appointment, claim → send → settle. Keep the response shape and both
   channel legs as-is.
8. `send-appointment-notification/index.ts`: delete the `action === "reminder"` write to
   `last_reminder_sent_at` (folded-in defect). Verify no other caller depends on it.
9. Migration 4 (cron cadence `*/10`). Push; confirm via `cron.job`.
10. `NotificationsPanel.tsx`: routing branch for the system notice. Add the vitest case.
11. Full verification block above; then the dev end-to-end sequence.
12. Update `docs/backlog-open-followups.md` — mark the item implemented, and file OQ-1..OQ-4 as
    their own backlog entries with `status: open`.

---

## Open Questions

All four are recorded in the run's deferral ledger.

- **OQ-1 — Per-tenant configurability of the 30-minute offset.** *(deferred)* AD-2 derives offsets
  rather than storing them, so a salon cannot currently disable the 30-minute nudge independently
  of its long reminder (it can still disable all reminders per channel). If salons ask for it, the
  migration path is a `reminder_offsets_minutes integer[]` column backfilled from the derivation,
  plus a settings-page control. Not built.

- **OQ-2 — Drop the deprecated `appointments` reminder columns.** *(deferred)* `last_reminder_sent_at`,
  `reminder_attempt_count`, `last_reminder_attempt_at`, `reminder_failed_at` become write-dead here
  (AD-8). Drop them once the dispatch table has run a full cycle in production, together with a
  types regeneration.

- **OQ-3 — Should rescheduling an appointment reset its reminder cycle?** *(unresolved — product)*
  Today (and under this design) a reminder already sent for an offset is not re-sent when the
  appointment moves. Arguably a customer whose 3pm booking moves to Friday should be reminded again.
  This is a product decision, not an engineering one, and it is out of the reported bug's scope.

- **OQ-4 — Pruning `appointment_reminder_sends`.** *(deferred)* Rows accumulate at ≤2 per
  appointment with no retention policy. Irrelevant at current volume; worth a periodic delete of
  rows whose appointment started more than ~90 days ago before the table gets large.

**Decided autonomously in this design** (autonomous mode; each is reversible and recorded above
with its reasoning): AD-2 (derive offsets, no new settings column — against the backlog's tentative
suggestion of an array column), AD-5 (collapse rather than a created_at suppression rule), AD-6
(10-minute cadence), AD-8 (deprecate rather than drop), AD-9 (digest needs no code change), and the
fold-in of the manual-reminder defect.
