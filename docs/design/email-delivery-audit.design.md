# Implementation Design — email-delivery-audit

Status: design complete, not implemented
Author: Principal (2026-09-15)
Worktree: `salon-magik-hub-worktrees/second-owner-foundation` (`feat/second-owner-foundation`)

---

# 1. References

- Planning Brief: `docs/prd/email-delivery-audit.prd.md`
- Technical Brief: `docs/research/2026-09-15-email-delivery-audit.md`
- Backlog item: `docs/backlog-open-followups.md` → `## email-delivery-audit`

The "what" (symptoms, scope, acceptance criteria) and the "as-is" (per-path inventory, execution
flow) live in those two documents and are not restated here.

---

# 2. Two corrections to the Technical Brief

## C-1 — `_shared/receipts.ts` does **not** share the silent-swallow defect

The brief's Affected Surfaces table lists `_shared/receipts.ts` among the paths sharing the
`sendResendEmail` defect. It does not: `receipts.ts` defines its **own local** `sendResendEmail`
(`supabase/functions/_shared/receipts.ts:200`) which already returns `{ sent: boolean; error?: string }`
and already reports provider rejection, missing API key and network exceptions to its callers. It is a
different function that happens to share a name.

What it genuinely lacks is a `message_logs` row — it reports failure but records nothing. That is a
real FR-1 gap, but it sits outside the Planning Brief's Scope §1 boundary ("all paths that today use
the shared sender, plus the appointment-reminder email leg"), and its sends are platform-billing email
whose tenant context differs from the operational paths. It is filed as a backlog item (§17, GAP-2),
not fixed here.

**Consequence:** there are **8** shared-helper call sites, not 9 — `send-daily-digest`,
`create-public-booking` (×3), `client-cancel-booking`, `process-salon-withdrawal`,
`create-payout-destination`, `_shared/check-low-balance.ts`, `_shared/payment-webhook-processor.ts`.
Counting the three distinct sends inside `create-public-booking` separately gives 10 send points across
8 files. All are covered.

## C-2 — `send-appointment-notification` already writes `last_reminder_sent_at`

`supabase/functions/send-appointment-notification/index.ts:320` sets `last_reminder_sent_at` itself
when `action === "reminder"` and the Resend call succeeded. So there are two writers of that column
today, and the callee's write is already success-gated. This materially simplifies AD-9: the callee's
write is the accurate per-channel success signal and is kept; only the *caller's* unconditional write
is wrong.

`send-appointment-notification` also already writes a `sent` row to `message_logs` on success
(`:306`) — but it `throw`s before reaching that insert on failure, so no failed row is ever written.
That is the exact gap AD-11 closes.

---

# 3. Scope

Per the Planning Brief. Concretely, this design changes:

- `supabase/functions/_shared/salon-notifications.ts` — the shared sender
- 8 call-site files (10 send points) that use it
- `supabase/functions/send-appointment-reminders/index.ts` — response checking + retry
- `supabase/functions/send-appointment-notification/index.ts` — failure logging
- two migrations (appointment retry columns + index; comms-usage counter correction)
- one verification runbook doc

## Adjacent defect folded into this work

**`get_backoffice_comms_usage()` counts failed messages as sent.** Its `reminders_sent_30d` and
`birthday_sent_30d` counters filter on `initiated_by`/`template_type` only, with no `status` filter
(`supabase/migrations/20260805140000_comms_credits_backoffice.sql:63-64`), so an SMS reminder that
failed is already counted as a reminder sent.

It qualifies on all three tests: it is a defect (a counter named `sent` counting failures, not a
policy choice); it is not an existing backlog item (checked `docs/backlog-open-followups.md`); and it
is in code this design touches — this work starts writing **failed** email rows with
`template_type = 'appointment_reminder'` and `initiated_by = 'system'`, which would roughly double the
inflation and make the counter actively misleading. Fixing it is a precondition for this change, not a
detour. See AD-5 and §8 migration 2.

---

# 4. Architecture Decisions

## AD-1 — `sendResendEmail` returns a result; it does not throw

New signature:

```ts
export interface EmailSendResult {
  sent: boolean;
  /** Provider message id, when the send succeeded. */
  messageId?: string;
  /** Classified, human-readable reason. Absent when sent. */
  error?: string;
  /** Machine-readable class, for grouping. Absent when sent. */
  errorKind?: EmailFailureKind;
}
```

**Reasoning.** Every one of the 8 call sites fires email *after* the operation it accompanies has
already committed — a withdrawal that moved money, a public booking that took payment, a payout
destination that was saved. Two of them (`create-payout-destination`,
`process-salon-withdrawal`) say so in their own comments: "A Resend outage must never fail the request
that already succeeded." Making the sender throw would convert an email outage into failed withdrawals
and failed bookings. A returned result gives the caller the information (FR-3) without changing the
blast radius.

**Rejected:** throwing on failure. Rejected for the reason above.
**Rejected:** returning `boolean`. Loses the provider reason, which FR-2 requires.

## AD-2 — The delivery record is written inside the shared sender, not at each call site

`sendResendEmail` gains a **required** `log` parameter and writes the `message_logs` row itself — one
row per recipient address, `sent` or `failed`, before returning.

```ts
export interface EmailLogContext {
  supabase: SupabaseLike;        // service-role client, bypasses RLS
  tenantId: string;
  templateType: EmailTemplateType;
  customerId?: string | null;    // when the recipient is a customer
  initiatedBy?: "system" | "salon";  // default "system"
}
```

**Reasoning.** Eight call sites × "remember to log both branches" is exactly the discipline that
failed the first time. Centralising it means FR-1 holds for every current and future caller by
construction. Making `log` **required** (not optional) is deliberate: `deno check` then fails on any
call site that hasn't been updated, so coverage is compiler-enforced rather than review-enforced.

One row **per recipient address**, not per request: the helper sends a single Resend request to `to[]`
of N addresses, but a per-address row is what makes "did *this owner* get it" answerable (FR-1, FR-4).
On a failed request all N addresses get a `failed` row with the same reason.

**Rejected:** a `logEmailDelivery()` helper called by each caller. Same coverage risk as today.
**Rejected:** optional `log`. Silently reintroduces unlogged paths.

## AD-3 — Failure classification

```ts
export type EmailFailureKind =
  | "config"     // RESEND_API_KEY absent/empty
  | "auth"       // Resend 401/403
  | "recipient"  // Resend 422 / invalid address
  | "provider"   // any other non-2xx from Resend
  | "network";   // fetch threw
```

`error_message` is written as `` `${errorKind}: ${detail}` ``, detail truncated to 1000 characters.
This satisfies FR-2's four distinguishable causes. "Template failure" in FR-2 is not a provider
outcome — templates are rendered before the send and a render fault surfaces as a `provider` 422 on
malformed HTML, or as a caller-side exception; no separate kind is invented for it.

The `config` case is the important one for this run: it is precisely the failure mode that has been
invisible, and it now produces a `failed` row rather than an early `return`.

## AD-4 — `message_logs` is the delivery record; no new table

It already exists with tenant scoping, per-tenant RLS SELECT, `status`/`error_message`/`provider`/
`recipient`/`template_type` columns, and is the pattern the SMS leg already follows
(`send-appointment-reminders/index.ts:157`). The Planning Brief's own assumption says the same. NFR
"data protection" is satisfied by not populating `content` for these paths — recipient address,
subject and message type only, matching SMS.

**Rejected:** a new `email_delivery_log` table. Duplicates an existing concept and orphans the
backoffice tooling that already reads `message_logs`.

## AD-5 — `initiated_by = "system"`, `credits_used = 0`, and a counter correction

All 10 send points are platform-initiated operational email, never salon-initiated messaging. They are
written with `initiated_by = "system"` and `credits_used = 0`, matching the SMS reminder row.

Consequences, all verified against `get_backoffice_comms_usage()` and `get_tenant_message_log()`:

- `email_sent_30d`, `delivered_30d`, `failed_30d` filter `initiated_by = 'salon'` → **unaffected**.
- `get_tenant_message_log()` filters `initiated_by = 'salon'` → **unaffected**; the backoffice
  drill-down does not start showing system email.
- `reminders_sent_30d` filters `initiated_by = 'system' AND template_type = 'appointment_reminder'`
  with **no status filter** → would now count failed email rows *and* start counting the email channel
  alongside SMS. Corrected per §3 by adding `status in ('sent','delivered')`; the same fix is applied
  to `birthday_sent_30d`. Post-fix the counter means "reminder messages successfully delivered,
  across channels" — a per-appointment reminder with both channels on counts 2. That is a genuine
  semantic change to a backoffice number and is called out in §13.

No credit ledger is touched: nothing debits on `message_logs` insert (no triggers exist on the table),
and `credits_used = 0` keeps these rows out of any usage sum.

## AD-6 — A fixed `template_type` taxonomy, as a shared union

`message_logs.template_type` is free text with no CHECK constraint, so no migration is needed — but
free text across 10 call sites produces unqueryable drift. A union type exported from
`_shared/salon-notifications.ts`:

```ts
export type EmailTemplateType =
  | "daily_digest"
  | "booking_confirmation_customer"
  | "booking_gift_recipient"
  | "booking_notification_salon"
  | "booking_cancelled_salon"
  | "low_balance_alert"
  | "payout_destination_changed"
  | "withdrawal_requested"
  | "payment_alert";
```

`appointment_reminder` is not in this union — it belongs to `send-appointment-notification`, which
already uses its own `templateType` and is not a caller of the shared helper.

## AD-7 — Appointment reminder retry state: three new columns, `last_reminder_sent_at` becomes success-only

| Column | Meaning |
|---|---|
| `last_reminder_sent_at` (existing) | **Success** marker. Non-null ⇒ a reminder was delivered on at least one channel. Never retried. |
| `reminder_attempt_count` (new, `int not null default 0`) | Total attempts made by the reminders job. |
| `last_reminder_attempt_at` (new, `timestamptz`) | When the most recent attempt ran. |
| `reminder_failed_at` (new, `timestamptz`) | Terminal: attempts exhausted. Never retried. |

Eligibility predicate:

```
status = 'scheduled'
AND last_reminder_sent_at IS NULL
AND reminder_failed_at IS NULL
AND reminder_attempt_count < 3
AND scheduled_start BETWEEN now() AND now() + reminder_hours_before
```

**Reasoning.** Redefining the existing column rather than adding a fourth state column means existing
rows need no backfill and keep their current meaning-in-effect: every appointment already marked is
treated as done and is never retried — which is exactly the Planning Brief's "no retroactive resend"
decision, obtained for free rather than by a special case.

FR-8 (no duplicate successful reminder) follows directly: retry is gated on
`last_reminder_sent_at IS NULL`, and that column is set the moment any channel succeeds.

**Rejected:** per-channel success columns (`email_reminder_sent_at`, `sms_reminder_sent_at`). FR-7
defines success as "at least one channel", so per-channel state buys nothing and adds two columns and
a partial-retry policy the brief does not ask for.
**Rejected:** a separate `appointment_reminder_attempts` table. One row per appointment, bounded at 3
— a table is more machinery than the question needs, and `message_logs` already carries the per-attempt
audit trail.

## AD-8 — Attempt accounting is the reminders job's alone; the callee keeps its success write

`send-appointment-notification` keeps writing `last_reminder_sent_at` on success (C-2). The reminders
job additionally performs **one** update per appointment after both channel attempts:

- any channel succeeded → `last_reminder_sent_at = now`, `last_reminder_attempt_at = now`,
  `reminder_attempt_count = prev + 1`
- all enabled channels failed → `last_reminder_attempt_at = now`,
  `reminder_attempt_count = prev + 1`, and if `prev + 1 >= 3` also `reminder_failed_at = now`

The overlap on `last_reminder_sent_at` is idempotent (same value, same meaning, same run). Writing the
whole state in one update keeps the callee's write from being clobbered by a later partial update, and
`prev` comes from the row already selected — no read-modify-write race, because the job is a single
30-minute cron with no concurrent runner. `MAX_REMINDER_ATTEMPTS = 3` is a module constant.

## AD-9 — The reminder window starts at `now`, not `now - 30min`

Today `windowStart = now - 30 minutes` (a buffer against a late cron). FR-9 forbids sending after the
appointment start time, so the buffer goes and `windowStart = now`.

The buffer only ever admitted appointments that had **already started** — an appointment still in the
future is caught by the window regardless of how late the cron fires, because the window's far edge is
`now + reminder_hours_before`. So removing it costs nothing except the behaviour FR-9 explicitly
prohibits.

## AD-10 — Failed-send logging for the appointment email leg lives in the callee

The `failed` `message_logs` row for a reminder email is written inside
`send-appointment-notification`, wrapping the Resend call, then rethrowing. The reminders job only
checks `response.ok`.

**Reasoning.** The callee has the tenant, customer, recipient address, subject and `templateType` in
hand and already writes the `sent` row two lines later — the failure row belongs beside its success
row. It also fixes the same gap for the function's *other* actions (confirmation, cancellation,
reschedule), which the caller-side alternative would not. And logging in both places would double-count
every reminder in `message_logs`.

**Rejected:** logging the failure in `send-appointment-reminders`. It only has the HTTP status, not
the reason, and would produce duplicate rows on the success path.

## AD-11 — The digest reports per-recipient outcomes; HTTP stays 200

Response becomes:

```json
{ "success": false, "processed": 12, "emailsSent": 27, "emailsFailed": 3,
  "failures": [{ "tenantId": "...", "recipient": "o@x.com", "error": "auth: ..." }] }
```

`success` is `emailsFailed === 0`. HTTP status stays 200 — there is **no** application consumer of
this endpoint (grepped repo-wide: only `README.md` and `config.toml` reference it; the cron calls it
via `net.http_post` and ignores the body), so the shape change is free, and keeping 200 avoids
`pg_net` recording a transport-level error for what is a partial outcome. `failures` is capped at the
first 50 entries so a whole-platform Resend outage cannot produce a multi-megabyte response body.

Per-recipient and per-tenant `try/catch` so one bad tenant cannot abort the run (NFR reliability, and
the "one tenant's send fails → remaining tenants still processed" acceptance criterion).

## AD-12 — Live verification is a committed runbook executed by the user, not new code

`docs/email-delivery-verification-runbook.md`: exact SQL and `curl` commands for every FR-11 check,
plus a results table to fill in with what was checked / when / result. FR-12 corrections that need
account or DNS access are stated as the specific action required.

**Reasoning.** The pipeline holds no production credentials (Technical Brief, Unknowns). A runbook is
executable by the person who does hold them, is reviewable, and survives the run as the written record
FR-11 demands.

**Rejected:** a `verify-email-config` edge function. That is a new capability, which the original
request requires be filed rather than built, and it would need deploying to the very environment whose
health is in question.

## AD-13 — Correct home

`supabase/functions/_shared/salon-notifications.ts` and the two edge functions. There is no shared or
upstream package for backend email logic — `packages/` is frontend-only per `pnpm-workspace.yaml`, and
the Technical Brief's Existing Implementation & Placement section reaches the same conclusion. The
capability already exists and is **extended**, not rebuilt: one helper changes signature, no parallel
sender is introduced, and the existing `message_logs` + SMS-leg pattern is the model. No frontend
change: the brief's Affected Surfaces table lists no consumer outside `supabase/functions`, and the
grep in AD-11 confirms neither function is called from `apps/`.

---

# 5. Components

| Component | Change |
|---|---|
| `_shared/salon-notifications.ts` | `sendResendEmail` returns `EmailSendResult`, takes required `log` context, writes `message_logs` on both branches, classifies failures. New exported types `EmailSendResult`, `EmailFailureKind`, `EmailLogContext`, `EmailTemplateType`. |
| `send-daily-digest/index.ts` | Captures results; per-tenant and per-recipient `try/catch`; new response shape. |
| `create-public-booking/index.ts` | 3 send points: pass `log` context, capture result, `console.warn` on failure (booking must not fail). |
| `client-cancel-booking/index.ts` | Pass `log` context, capture result. |
| `process-salon-withdrawal/index.ts` | Pass `log` context, capture result. |
| `create-payout-destination/index.ts` | Pass `log` context, capture result. |
| `_shared/check-low-balance.ts` | Pass `log` context, capture result. |
| `_shared/payment-webhook-processor.ts` | Pass `log` context, capture result. |
| `send-appointment-reminders/index.ts` | Check `response.ok`; new eligibility predicate; single end-of-appointment state update; new `reminder-state.ts` helper. |
| `send-appointment-reminders/reminder-state.ts` (new) | Pure `nextReminderState()` — the retry decision, unit-testable without a database. |
| `send-appointment-notification/index.ts` | `failed` `message_logs` row on Resend failure, then rethrow. |
| Migration: appointments retry columns + partial index | New. |
| Migration: `get_backoffice_comms_usage()` status filter | New (folded-in defect). |
| `docs/email-delivery-verification-runbook.md` (new) | FR-11 to FR-13 record. |

---

# 6. Data Flow

**Shared sender (all 10 send points)**

```
caller (has supabase service client + tenantId)
  → sendResendEmail({ ...email, log: { supabase, tenantId, templateType, customerId? } })
      ├─ to[] empty            → return { sent:false, error:"recipient: no recipients" }   [no row: nothing attempted]
      ├─ no API key            → insert failed row(s) "config: RESEND_API_KEY not configured"
      │                          → return { sent:false, errorKind:"config" }
      ├─ fetch throws          → insert failed row(s) "network: <msg>"      → { sent:false }
      ├─ !response.ok          → insert failed row(s) "<kind>: <body>"      → { sent:false }
      └─ ok                    → insert sent row(s) (sent_at=now, messageId) → { sent:true, messageId }
  ← caller inspects .sent; logs/aggregates; never aborts the committed operation
```

**Digest run**

```
pg_cron 0 7 * * *  →  send-daily-digest
  per tenant (try/catch):  frequency gate → shouldSendToday → recipients → aggregate → render
    per recipient (try/catch):  sendResendEmail → emailsSent++ | emailsFailed++ + failures.push
  → 200 { success: emailsFailed === 0, processed, emailsSent, emailsFailed, failures }
```

**Reminder run**

```
pg_cron */30 * * * *  →  send-appointment-reminders
  per tenant: select eligible appointments (AD-7 predicate, now → now+H)
    per appointment:
      email leg (if enabled + customer.email):
        fetch send-appointment-notification
          → callee sends via Resend
              ├─ ok  → message_logs 'sent'  + sets last_reminder_sent_at → 200
              └─ bad → message_logs 'failed' + rethrow                   → 500
          → caller checks response.ok → emailOk true/false (emailsSent++ | errors++)
      sms leg (unchanged): arkesel → message_logs sent|failed → smsOk
      nextReminderState({ prev, emailOk, smsOk, anyChannelEnabled }) → single UPDATE
  → 200 { ok, emailsSent, smsSent, errors, exhausted }
```

---

# 7. API Changes

No HTTP contract is added or removed. Two response bodies change, neither with an application
consumer (AD-11):

- `send-daily-digest`: `{ success, processed }` → `{ success, processed, emailsSent, emailsFailed, failures[] }`
- `send-appointment-reminders`: `{ ok, emailsSent, smsSent, errors }` → adds `exhausted` (count of
  appointments that hit attempt 3 this run)

Internal TypeScript contract change: `sendResendEmail` gains a required `log` argument and a return
value. This is the compile-time gate from AD-2.

---

# 8. Database Changes

## Migration 1 — `supabase/migrations/20260915090000_appointment_reminder_retry.sql`

```sql
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
```

No backfill. Defaults are correct for every existing row: `reminder_attempt_count = 0` and
`reminder_failed_at = null` on an already-reminded row are irrelevant because
`last_reminder_sent_at IS NOT NULL` already excludes it.

## Migration 2 — `supabase/migrations/20260915090100_comms_usage_status_filter.sql`

Folded-in defect (§3, AD-5). `create or replace function public.get_backoffice_comms_usage()` with
the body unchanged from `20260805140000_comms_credits_backoffice.sql` except:

```sql
      count(*) filter (where ml.initiated_by = 'system'
                         and ml.template_type = 'appointment_reminder'
                         and ml.status in ('sent', 'delivered'))::integer as reminders_sent_30d,
      count(*) filter (where ml.initiated_by = 'system'
                         and ml.template_type = 'birthday_message'
                         and ml.status in ('sent', 'delivered'))::integer as birthday_sent_30d,
```

Re-issue the `grant execute ... to authenticated` after the replace.

No index is added for `message_logs`: the existing per-tenant lookups in this function already scan
`ml.tenant_id` + `ml.created_at` inside a lateral, and this change only tightens a `filter` clause
inside an already-executed aggregate.

## Not changed

- `message_logs` schema — every column needed already exists (`provider`, `initiated_by`,
  `error_message`, `credits_used`, `status`). `provider = 'resend'` is already permitted by
  `message_logs_provider_check`; `channel = 'email'` by `message_logs_channel_check`.
- RLS — edge functions use the service-role client and bypass RLS on insert; the existing tenant-scoped
  SELECT policy is what makes the records queryable per tenant (FR-4).

---

# 9. Validation

- `log.tenantId` must be a non-empty string; the helper `console.error`s and skips the row (but still
  returns the true send result) rather than throwing on a malformed context — a missing tenant id must
  not turn into a failed withdrawal.
- `to[]` is filtered to non-empty, trimmed strings before the send; an all-empty list short-circuits to
  `{ sent: false, error: "recipient: no recipients" }` with no row written.
- `recipient` on each row is the individual address, never the joined list.
- `error_message` is truncated to 1000 characters.
- `reminder_attempt_count` is clamped: `Math.min(prev + 1, MAX_REMINDER_ATTEMPTS)`.
- The reminders job skips an appointment whose `scheduled_start` has passed between the query and the
  send (re-checked in memory), satisfying FR-9 even across a slow run.

---

# 10. Error Handling

| Condition | Behaviour |
|---|---|
| Resend non-2xx | `failed` row with classified reason; `{ sent:false }`; caller continues. |
| `fetch` throws | `failed` row `network: …`; `{ sent:false }`; caller continues. |
| `RESEND_API_KEY` absent | `failed` row `config: …`; `{ sent:false }`. Previously a silent `return`. |
| `message_logs` insert fails | `console.error`, do **not** throw, do **not** alter the returned send result. Logging must never mask or invert the actual delivery outcome. |
| One recipient fails in the digest | Counted in `emailsFailed`, run continues to the next recipient. |
| One tenant throws in the digest | Caught, counted, run continues to the next tenant. |
| `send-appointment-notification` returns 500 | `emailOk = false`, `errors++`; the callee has already written the `failed` row. |
| Reminder appointment update fails | `console.error` + `errors++`; the appointment stays eligible and is retried next run (attempt not counted — safe, bounded by the 3-attempt cap once the write succeeds). |

---

# 11. Security Considerations

- No new endpoint, no auth change. Both cron functions keep their shared-secret checks and
  `verify_jwt = false`.
- `message_logs` rows carry recipient address, subject and message type only — never body content
  (`content` stays null for these paths), matching the SMS rows and the NFR on data protection.
- `error_message` stores the provider's response body. Resend error bodies do not echo the API key;
  the classification prefix is added by us. The truncation cap bounds any accidental verbosity.
- Rows are tenant-scoped and readable only through the existing per-tenant RLS SELECT policy.
- The verification runbook must never have secret **values** pasted into it — it records presence and
  validity only (`select name from vault.decrypted_secrets`, never `decrypted_secret`).

---

# 12. Performance Considerations

- **One extra insert per recipient per email.** These are low-volume operational sends (a daily digest
  to a handful of owners; one row per booking/withdrawal event). Insert cost is negligible against the
  Resend round-trip that precedes it, and the row is written after the send, not before, so it never
  delays delivery.
- **Rows are inserted in one batched `insert()` per send** (an array of N recipient rows), not N
  round-trips.
- **Reminder query**: unchanged shape — filtered and bounded in SQL by tenant, status and
  `scheduled_start` range; never loads the appointments table into memory. The new partial index
  `idx_appointments_reminder_due` keeps it on the small eligible set even as the table grows; without
  it the added `reminder_failed_at is null` / `reminder_attempt_count < 3` predicates would push the
  planner onto the broader `idx_appointments_scheduled_start`.
- **No N+1 introduced.** The per-appointment `UPDATE` replaces an existing per-appointment `UPDATE`
  (same count, more columns). The per-tenant `tenants` lookup already exists and is keyed by id.
- **Retry cost** is bounded at 3 attempts per appointment and only for sends that genuinely failed
  (NFR cost).
- `failures[]` in the digest response is capped at 50 entries.

---

# 13. Compatibility

**Backward compatible**

- Who receives what, when, with what content: unchanged. No template, recipient-selection or opt-in
  semantics are touched.
- Successful sends behave identically; only the return value and an added audit row are new.
- Existing appointments with `last_reminder_sent_at` set are permanently excluded from retry — no
  burst of late reminders (Planning Brief, Out of Scope).
- Both migrations are additive/idempotent and safe to re-run.

**Behaviour changes to note**

1. `send-daily-digest` response body gains fields and `success` can now be `false`. No application
   consumer exists (AD-11).
2. Reminders no longer go out for appointments whose start time has passed (AD-9) — previously a
   ≤30-minute-late reminder was possible.
3. `get_backoffice_comms_usage().reminders_sent_30d` will **drop** (failed SMS reminders stop counting)
   and then **rise** (successful email reminders start counting). Its meaning becomes "reminder
   messages successfully delivered, across channels" — a two-channel appointment counts 2. Backoffice
   readers of that number should be told; no UI change is needed.
4. `message_logs` gains system-initiated email rows. Verified not to affect
   `get_tenant_message_log()` or the salon-initiated credit rollups (AD-5).

**No deprecation.** Nothing is removed. `last_reminder_sent_at` keeps its name and narrows its
meaning, documented in a column comment.

---

# 14. Edge Cases

- **Digest run where every send fails** → `success:false`, one `failed` row per recipient, `processed`
  still counts tenants attempted.
- **Tenant with `digest_frequency = 'off'`** → skipped before any send; no row, no failure. Unchanged.
- **Manual/UI digest trigger with `tenantId`** → still bypasses `shouldSendToday` (intentional,
  per the in-code comment); now also returns per-recipient outcomes, which makes it a usable manual
  test path for FR-13.
- **Owner deactivated mid-run** → `getSalonRecipients` already filters `is_active`; no row.
- **Appointment with email enabled but no customer email** → email leg skipped entirely; if SMS is also
  unavailable, `anyChannelEnabled` is false and the appointment is marked `reminder_failed_at` on the
  first pass rather than burning three empty attempts.
- **Email succeeds, SMS fails** → `last_reminder_sent_at` set, no retry, SMS `failed` row retained.
- **Email fails, SMS succeeds** → same: marked sent, no retry, email `failed` row retained (FR-7).
- **Both fail 3×** → `reminder_failed_at` set on the third; never retried; three `failed` rows tell the
  story.
- **Appointment cancelled between attempts** → `status <> 'scheduled'` drops it from the predicate; it
  simply stops being eligible.
- **Appointment rescheduled further out between attempts** → re-enters the window later with its
  attempt count preserved; the cap is per appointment, not per window. Acceptable: three failures
  already indicate a bad recipient.
- **Appointment starts mid-run** → in-memory re-check skips it (§9).
- **Resend accepts but never delivers** (bounce/spam) → recorded as `sent`. Bounce-webhook tracking is
  outside this scope and is GAP-3.
- **`message_logs` insert fails while the send succeeded** → caller still sees `sent:true`; the send is
  never misreported to protect an audit row.
- **Multiple owners in one `to[]`** (digest sends per-recipient; `payment-webhook-processor` and
  `client-cancel-booking` send to a joined list) → N rows, one per address, all sharing the outcome.

---

# 15. Tests Required

## Unit — `supabase/functions/_shared/salon-notifications.test.ts` (new)

Stub `globalThis.fetch` and pass a fake `SupabaseLike` that records inserts.

- success → `{ sent:true, messageId }`, one `sent` row per recipient, `credits_used:0`,
  `initiated_by:'system'`, `provider:'resend'`, `channel:'email'`, `content` absent
- Resend 422 → `{ sent:false, errorKind:'recipient' }`, one `failed` row per recipient with reason
- Resend 401 → `errorKind:'auth'`
- Resend 500 → `errorKind:'provider'`
- fetch rejects → `errorKind:'network'`
- missing API key → `errorKind:'config'` **and a row is written** (the regression this whole work exists
  to prevent)
- empty/whitespace `to[]` → `{ sent:false }`, **no** row
- `message_logs` insert throws while the send succeeded → still `{ sent:true }`
- `error_message` truncated at 1000 chars

## Unit — `supabase/functions/send-appointment-reminders/reminder-state.test.ts` (new)

`nextReminderState()` truth table: email-only success; SMS-only success; both success; both fail at
attempts 0→1 and 1→2 (no `reminder_failed_at`); fail at 2→3 (sets `reminder_failed_at`); no channel
enabled → immediate `reminder_failed_at`; count never exceeds 3.

## Integration — against a local/staging stack

- Digest with a deliberately invalid `RESEND_API_KEY`: response `success:false`, `failed` rows present,
  every tenant still processed.
- Digest with a valid key: email arrives, `sent` rows present, `success:true`.
- Reminder where `send-appointment-notification` returns 500: appointment **not** marked,
  `reminder_attempt_count = 1`, `failed` row written by the callee.
- Same appointment across three runs: attempts 1→2→3, then `reminder_failed_at` set and a fourth run
  ignores it.
- Reminder that succeeds: `last_reminder_sent_at` set, `sent` row, subsequent runs send nothing.
- Appointment whose start has passed: no attempt, no row.

## Regression

- `deno check` on all 10 touched functions (this is the AD-2 coverage gate).
- `get_backoffice_comms_usage()` before/after on seeded data: failed SMS reminders no longer counted.
- `npm run lint` / `npm run test` — frontend untouched, expected unaffected.

## End-to-end (FR-13, requires production access)

Per the runbook: trigger one digest and one reminder, confirm real inbox arrival and matching
`message_logs` rows.

---

# 16. Verification

Run from the worktree root (`salon-magik-hub-worktrees/second-owner-foundation`):

```bash
# New unit tests (deno is on PATH at /opt/homebrew/bin/deno)
deno test --allow-net supabase/functions/_shared/salon-notifications.test.ts
deno test --allow-net supabase/functions/send-appointment-reminders/reminder-state.test.ts

# Existing shared tests still pass
deno test --allow-net supabase/functions/_shared/

# The AD-2 coverage gate: every caller must supply the log context or this fails
deno check supabase/functions/_shared/salon-notifications.ts \
           supabase/functions/_shared/check-low-balance.ts \
           supabase/functions/_shared/payment-webhook-processor.ts \
           supabase/functions/send-daily-digest/index.ts \
           supabase/functions/send-appointment-reminders/index.ts \
           supabase/functions/send-appointment-notification/index.ts \
           supabase/functions/create-public-booking/index.ts \
           supabase/functions/client-cancel-booking/index.ts \
           supabase/functions/create-payout-destination/index.ts \
           supabase/functions/process-salon-withdrawal/index.ts

# No unlogged shared send survives: every call site passes `log:`
grep -rn -A3 "sendResendEmail({" supabase/functions | grep -c "log:"
# expect 10

# The old swallow signature is gone — no bare `console.error("Failed to send email"` path
grep -rn "Failed to send email" supabase/functions/_shared/salon-notifications.ts
# expect: no match

# Migrations apply cleanly
supabase db reset --local   # or: supabase db push --linked, per the branch-promotion workflow

# Frontend unaffected
npm run lint
npm run test
```

Production verification (FR-11 to FR-13) is the runbook, executed by the user — see step 8 below.

---

# 17. Gaps to file (FR-10) — not built here

Append to `docs/backlog-open-followups.md`, one section each, `status: open`:

- **GAP-1 `email-delivery-visibility`** — Owners have no way to see that an email to them or their
  customers failed. This work records failures; nothing surfaces them. Needs a view (Settings →
  Notifications, or the messaging log) and/or an in-app notification when a tenant's sends start
  failing. Explicitly deferred by the Planning Brief's Out of Scope.
- **GAP-2 `receipts-email-delivery-logging`** — `_shared/receipts.ts` reports send failures to its
  callers but writes no `message_logs` row, so subscription-billing email (cancellation confirmation,
  dunning, payment-failed) is undiagnosable. See C-1. Should adopt the same `log` context.
- **GAP-3 `cron-run-failure-alerting`** — Nothing watches `cron.job_run_details`. If a Vault secret is
  missing or wrong, `net.http_post(url := NULL)` fails and the job is a permanent silent no-op — the
  exact failure mode this run could not rule out from source. Needs a periodic check or an alert on
  consecutive failed runs.
- **GAP-4 `email-bounce-tracking`** — Resend accepting a message is not delivery. No bounce/complaint
  webhook is consumed, so `status` never advances past `sent` to `delivered`/`failed`. The `delivered`
  status value already exists in the schema and is unused for email.

Per the project's standing rule, each gets its own Jira ticket under an epic when filed.

---

# 18. Implementation Order

1. **`_shared/salon-notifications.ts`** — add `EmailSendResult`, `EmailFailureKind`,
   `EmailLogContext`, `EmailTemplateType`; rewrite `sendResendEmail` per AD-1/2/3. Nothing else
   compiles until step 2, by design.
2. **Update all 8 call-site files (10 send points)** — pass `log`, capture the result, log a warning on
   failure. No caller changes its own success/failure semantics except the digest (step 4).
   `deno check` on all of them is the gate that step 1's coverage is complete.
3. **Unit tests** for the shared sender (§15).
4. **`send-daily-digest/index.ts`** — per-tenant and per-recipient `try/catch`, counters, new response
   shape (AD-11).
5. **Migration 1** — appointment retry columns + partial index (§8).
6. **`send-appointment-notification/index.ts`** — `failed` row on Resend failure, then rethrow (AD-10).
7. **`send-appointment-reminders/index.ts` + `reminder-state.ts`** — check `response.ok`, new
   eligibility predicate, `nextReminderState()`, single end-of-appointment update, `windowStart = now`
   (AD-7/8/9). Plus its unit tests.
8. **Migration 2** — `get_backoffice_comms_usage()` status filter (folded-in defect, §3).
9. **`docs/email-delivery-verification-runbook.md`** — write the runbook with the FR-11 checks and an
   empty results table:
   - `select jobname, schedule, active from cron.job where jobname in ('send-daily-digest','send-appointment-reminders');`
   - `select jobid, status, return_message, start_time from cron.job_run_details where start_time > now() - interval '7 days' order by start_time desc limit 50;`
   - `select name, created_at from vault.decrypted_secrets where name in ('daily_digest_function_url','daily_digest_secret','appointment_reminders_function_url','appointment_reminders_secret');` — **names only, never values**
   - `curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains` — key validity and `status: "verified"` on the sending domain
   - `select tenant_id, digest_frequency from notification_settings where tenant_id = '<reporting tenant>';` — may alone explain symptom #1
   - post-deploy: trigger a digest manually with `tenantId`, trigger a reminder, confirm inbox arrival
     and matching `message_logs` rows (FR-13)
10. **File the four gaps** (§17) in `docs/backlog-open-followups.md`, and update the
    `email-delivery-audit` item's status.
11. **Ship via the branch-promotion workflow** — development-only → main → release. No direct
    production deploy.

Steps 1–4 and 5–8 are independently shippable; 9–10 are documentation and can land with either.

---

# 19. Open Questions

1. **Q: Is the Resend sending domain verified and the API key valid in production? -> A: Unresolved —
   requires Resend account access nobody in the pipeline holds.** Step 9's `curl` answers it in one
   command; if the domain is unverified, remediation needs DNS records only the user can add, and no
   code change in this design will make email arrive until then.
2. **Q: Do the four Vault secrets exist in production with correct values? -> A: Unresolved — requires
   production database access.** If they were never created, both cron jobs have been no-ops since
   registration and this fix produces zero email. Step 9's `cron.job_run_details` query distinguishes
   "never ran" from "ran and failed" definitively.
3. **Q: Is the reporting owner's `digest_frequency` anything other than `off`? -> A: Unresolved —
   requires production database access.** If `off`, symptom #1 is expected behaviour and the digest
   half of the report closes on that answer alone.
4. **Q: Should `reminders_sent_30d` count per message (email + SMS = 2 for one appointment) or per
   appointment? -> A: Per message (decided autonomously).** The counter sits beside `sms_sent_30d` and
   `email_sent_30d`, which are both per-message, and it is fed by `message_logs` rows which are
   per-message. A per-appointment count would need a `distinct` over a column `message_logs` does not
   carry for the email leg today. Recorded in §13 as a backoffice-visible semantic change.

Questions 1–3 are the Planning Brief's own open questions, unchanged: they do not block implementation
(steps 1–8), only the verification half (steps 9 onward).
