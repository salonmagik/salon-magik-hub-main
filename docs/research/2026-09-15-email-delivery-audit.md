# Original Request

> Audit every outbound email path on the platform. Reported symptoms from the user (2026-09-15): the
> daily digest never sends, and email reminders do not work. Treat those as the entry point, not the
> scope — investigate every outbound email the platform sends (Resend transactional sends,
> scheduled/cron-driven sends, booking receipts, invitations, notification emails) and establish, per
> path, whether it actually reaches a recipient today. Separate "never fires at all" (scheduler/cron/
> trigger not wired or not running) from "fires but delivery fails" (Resend config, domain/sender
> verification, errors swallowed). Confirm live where you can rather than from source alone. The goal
> is both diagnosis and repair... Anything that turns out to be a missing capability rather than a
> breakage must be written up and flagged... and filed as its own backlog item.

Note: this session's role is research-only (Sleek Researcher). Diagnosis is complete; repair is
explicitly out of scope for this role and is handed off per the routing rules below.

---

# Summary

There are ~30 Supabase Edge Functions that send outbound email via the Resend HTTP API. Four are
cron-driven (`send-daily-digest`, `send-appointment-reminders`, `send-birthday-messages`,
`send-trial-expiry-reminders`); the rest fire on request (bookings, invitations, invoices, OTPs,
manual/bulk messaging, campaigns).

One concrete, source-verifiable defect explains both reported symptoms and a broader class of silent
failures: the shared `sendResendEmail` helper (`supabase/functions/_shared/salon-notifications.ts`)
swallows Resend API errors — it only `console.error`s on a non-OK response, never throws, never writes
to `message_logs`, and its callers never check whether anything was sent. `send-daily-digest` uses this
helper exclusively, so a Resend failure there is invisible: the function always returns
`{ success: true, processed: N }` regardless of whether any email actually left Resend.

`send-appointment-reminders` has an analogous swallow-and-continue bug: it `fetch()`s
`send-appointment-notification` to deliver the actual email but never checks the response status, so a
500 from the notification function (bad customer data, expired custom template, Resend rejection, etc.)
is logged to `console.error` only, `emailsSent++` never happens, but `errors` isn't incremented either
in that branch and no `message_logs` row records the failure — an owner has no way to see that reminders
are silently failing.

Both cron jobs (`send-daily-digest`, `send-appointment-reminders`) *are* correctly registered in
migrations with `pg_cron` + `pg_net`, contradicting a plausible "cron never wired" hypothesis for the
digest — a comment in the digest's own scheduling migration explicitly says that gap existed before and
this migration fixed it. However, I could not confirm live whether the `pg_cron` jobs are actually
present/enabled in the production database, or whether the required Vault secrets
(`daily_digest_function_url`, `daily_digest_secret`, `appointment_reminders_function_url`,
`appointment_reminders_secret`) were ever created — those are applied out-of-band per the migrations'
own comments, not via migration SQL, and I have no live database or Supabase Management API access from
this environment (see Unknowns). If those secrets were never created, `net.http_post`'s `url :=` would
resolve to `NULL` and the job would silently no-op forever — a "never fires" failure mode that looks
identical to "fires but the email helper swallowed the error" from the outside, which is exactly why the
user's two reported symptoms need live confirmation to disambiguate.

I could not obtain Supabase project/database access from this environment (no `.env`, no linked
project, `supabase link` rejected for privilege reasons against the only projects visible to the CLI
login — which are an unrelated org's projects, not Salon Magik's). All findings below are static/source
analysis; the "confirm live" instruction could not be executed and is recorded as an unresolved runtime
unknown.

---

# Current Behaviour

## Outbound email inventory

All outbound email goes through the Resend HTTP API (`https://api.resend.com/emails`), either directly
or via the shared `sendResendEmail` helper. No other email provider is used anywhere in the codebase.

**Cron-driven (scheduled via `pg_cron` + `pg_net`, see Execution Flow):**

| Function | Schedule | Send path | Failure handling |
|---|---|---|---|
| `send-daily-digest` | `0 7 * * *` (daily 07:00 UTC) | `sendResendEmail` (shared, swallows errors) | **Silent** — logs only, no throw, no `message_logs` |
| `send-appointment-reminders` | `*/30 * * * *` | calls `send-appointment-notification` via `fetch()`, response not checked | **Silent for email leg** — SMS leg has proper `message_logs` success/failure rows; email leg has none |
| `send-birthday-messages` | (own migration, `20260722000001`) | direct Resend call, `throw`s on `!response.ok`, writes `message_logs` | Correct |
| `send-trial-expiry-reminders` | (own migration, `20260726000013`) | direct Resend call, `throw`s on `!response.ok` | Correct |

**Request-driven, checked for the same pattern:** `send-welcome-email`, `send-invoice`,
`send-booking-approval-email`, `send-bulk-message`, `send-manual-message`, `send-reactivation-campaign`,
`send-sales-promo-email`, `send-trial-extension-notice`, `send-waitlist-invitation`,
`send-appointment-notification` — all of these check `response.ok` and either `throw` (surfacing a
500 to the caller) or otherwise report failure; most also write a `message_logs` row. None of these
exhibit the digest's silent-swallow pattern.

**Also routed through the same swallow-prone `sendResendEmail` helper** (so share the same defect,
beyond just the digest): `process-salon-withdrawal`, `create-public-booking`, `create-payout-destination`,
`client-cancel-booking`, `_shared/receipts.ts`, `_shared/payment-webhook-processor.ts`,
`_shared/check-low-balance.ts`. These cover new-booking notifications, cancellation notifications,
low-balance alerts, payout notifications, and payment-webhook receipts to salon owners/managers — i.e.
most of the platform's *operational* (non-transactional-to-customer) email surface.

## `send-daily-digest` (entry point symptom #1)

- Auth: either an `x-daily-digest-secret` header matching `DAILY_DIGEST_SECRET` (the cron path), or a
  Bearer JWT plus tenant owner/manager role check (manual/UI-triggered path).
- Reads `notification_settings.digest_frequency` (`daily`/`weekly`/`monthly`, default `off` since
  migration `20260906170000_digest_frequency.sql`, 2026-09-06) — a tenant that never explicitly opted in
  gets `off` and is correctly skipped; this is intended behaviour, not a bug.
- For each opted-in tenant whose frequency matches today (`shouldSendToday`), aggregates
  appointments/payments/outstanding/new-customers for the period, renders a template
  (platform template > tenant custom template > hardcoded default, in that priority), and calls
  `sendResendEmail` per recipient (owners/managers from `getSalonRecipients`).
- `sendResendEmail` returns `undefined` unconditionally; the caller never inspects a result. Function
  always responds `{ success: true, processed }` even if every Resend call inside failed.
- No `message_logs` rows are written for digest sends at all (unlike appointment notifications), so
  there's no audit trail to check delivery even indirectly.

## `send-appointment-reminders` (entry point symptom #2)

- Auth: `x-reminders-secret` header matching `APPOINTMENT_REMINDERS_SECRET` env var, sent by the cron job
  (`config.toml` sets `verify_jwt = false` for this function, so the gateway doesn't block the
  header-less-Authorization cron request — a past bug on this exact point is documented in the function's
  own top-of-file comment, and is now fixed in `config.toml`).
- Every 30 minutes, for each tenant's `notification_settings`, finds appointments whose reminder window
  has opened and `last_reminder_sent_at IS NULL`.
- Email leg: `fetch()`s `send-appointment-notification` with `{ appointmentId, action: "reminder" }`,
  using the service-role key as Bearer auth. The fetch's response is never awaited-and-checked — only a
  thrown/rejected fetch is caught (network-level failure), not a non-2xx HTTP response from the callee.
  `emailsSent++` happens unconditionally after the fetch resolves, whether or not the callee actually
  sent an email.
- `send-appointment-notification` itself (the function actually calling Resend) does correctly `throw`
  on a Resend failure and returns 500 — but the caller ignores that status code entirely.
- SMS leg, by contrast, correctly checks success/failure and writes `message_logs` either way.
- `last_reminder_sent_at` is set unconditionally after attempting both channels, "so we don't retry
  endlessly on a bad phone/email" (per the file's own comment) — this means a reminder that failed to
  send (silently, per the above) will **never be retried**, not even on the next cron run.

---

# Affected Surfaces

This is a diagnostic audit of existing outbound email paths, not a contract change — no external
consumers of an API/type/schema are being modified. Per-path disposition instead of a consumer list:

| Path | Never fires vs. fires-but-fails | Verified how |
|---|---|---|
| `send-daily-digest` | Confirmed code defect: failures are silently swallowed (fires-but-fails class). Whether the cron itself is actually running/scheduled in prod is unconfirmed (could not verify live) — if it isn't, this is also a "never fires" case. | Source: `_shared/salon-notifications.ts`, `send-daily-digest/index.ts` |
| `send-appointment-reminders` (email leg only) | Confirmed code defect: response status of the downstream call is never checked, so failures are silent and unretried (fires-but-fails class). SMS leg is not affected. | Source: `send-appointment-reminders/index.ts` |
| `send-birthday-messages`, `send-trial-expiry-reminders` | No swallow pattern found; error handling and logging look correct. Cron registration present in migrations. Live schedule/secret presence unconfirmed. | Source: migrations + function code |
| `process-salon-withdrawal`, `create-public-booking`, `create-payout-destination`, `client-cancel-booking`, `_shared/receipts.ts`, `_shared/payment-webhook-processor.ts`, `_shared/check-low-balance.ts` | Share the same silent-swallow defect via `sendResendEmail`, not previously reported by the user but structurally identical — flagged here since the audit's scope is "every outbound email path," not just the two reported symptoms. | Source: grep for `sendResendEmail` call sites |
| All other request-driven senders checked (`send-welcome-email`, `send-invoice`, `send-booking-approval-email`, `send-bulk-message`, `send-manual-message`, `send-reactivation-campaign`, `send-sales-promo-email`, `send-trial-extension-notice`, `send-waitlist-invitation`, `send-appointment-notification`) | No swallow pattern found — check `response.ok` and either throw or record failure. | Source read of each file |
| RESEND_API_KEY validity / domain-sender verification in the live Resend account | Unconfirmed — no live access (see Unknowns). This is the other half of "fires but delivery fails" and cannot be ruled in or out from source. | N/A — runtime-only |

---

# Existing Implementation & Placement

**Existing implementation:** the capability being audited (outbound email) already exists broadly and
is not being built here — this is a defect/diagnosis pass over existing code, not new functionality.
The one place where behaviour needs correcting rather than extending is the shared `sendResendEmail`
helper in `supabase/functions/_shared/salon-notifications.ts`, which several functions already depend
on and any fix should live there rather than being duplicated per-caller. The reminder-email fetch
inside `send-appointment-reminders/index.ts` needs its own fix (checking the fetched response), since it
doesn't call the shared helper at all.

**Correct home:** this is a Supabase Edge Functions concern; there is no separate shared/upstream
package in this monorepo for backend email logic (the workspace's `packages/` directory is
frontend-only, per `pnpm-workspace.yaml` and the apps under `apps/`). Fixes belong in
`supabase/functions/_shared/salon-notifications.ts` (the swallow bug, shared by 9 call sites) and
`supabase/functions/send-appointment-reminders/index.ts` (the unchecked-fetch bug, local to that
function). No project-level instructions file (`CLAUDE.md`/`AGENTS.md`) exists at the repo root to
consult for a placement rule; none was found elsewhere in the repo either.

**Prior memory notes:** no notes file was found alongside `docs/research/` for a prior email-related
investigation (only `send-co-owner-invitation`/`co-owner-invite`-adjacent history is present in this
directory, unrelated to email delivery).

---

# Execution Flow

```
pg_cron ('send-daily-digest', 0 7 * * *)
    ↓ (pg_net.http_post, url/secret from Vault — not confirmed present in prod)
send-daily-digest (edge function)
    ↓ per opted-in tenant, per owner/manager recipient
sendResendEmail() [_shared/salon-notifications.ts]
    ↓ fetch → api.resend.com/emails
    ↓ on !response.ok: console.error only — no throw, no message_logs, caller unaware
send-daily-digest always responds { success: true }
```

```
pg_cron ('send-appointment-reminders', */30 * * * *)
    ↓ (pg_net.http_post, url/secret from Vault — not confirmed present in prod)
send-appointment-reminders (edge function)
    ↓ per due appointment with email reminders enabled
fetch(send-appointment-notification, { action: "reminder" })   ← response status never checked
    ↓
send-appointment-notification (edge function)
    ↓ fetch → api.resend.com/emails
    ↓ on !response.ok: throws, returns 500 — but caller above never sees it
last_reminder_sent_at set regardless → no retry, ever, for a failed send
```

---

# Relevant Files

- `supabase/functions/send-daily-digest/index.ts` — digest logic, auth, per-tenant aggregation, calls the swallow-prone shared sender
- `supabase/functions/send-appointment-reminders/index.ts` — cron entry point for reminders; unchecked fetch to the notification function; SMS leg contrast
- `supabase/functions/send-appointment-notification/index.ts` — actual Resend call for appointment lifecycle emails including reminders; correctly throws on failure
- `supabase/functions/_shared/salon-notifications.ts` — shared `sendResendEmail` helper; the confirmed silent-failure defect; also `getSalonRecipients`
- `supabase/migrations/20260806000000_schedule_daily_digest.sql` — digest cron registration, Vault-secret dependency, comment confirming this was previously never wired
- `supabase/migrations/20260704000001_schedule_appointment_reminders.sql` — reminders cron registration, same Vault-secret pattern
- `supabase/migrations/20260906170000_digest_frequency.sql` — recent (2026-09-06) migration replacing the old boolean opt-in with `digest_frequency`, default `off`
- `supabase/migrations/20260202235626_2e938aca-...sql` — original `notification_settings` table definition (defaults for `email_appointment_reminders`, `reminder_hours_before`)
- `supabase/config.toml` — confirms `verify_jwt = false` is already set for both cron-invoked functions (rules out the gateway-401 failure mode previously fixed and documented in-code)
- `supabase/functions/send-welcome-email/index.ts`, `send-invoice/index.ts`, `send-booking-approval-email/index.ts`, `send-bulk-message/index.ts`, `send-manual-message/index.ts`, `send-reactivation-campaign/index.ts`, `send-sales-promo-email/index.ts`, `send-trial-extension-notice/index.ts`, `send-waitlist-invitation/index.ts`, `send-birthday-messages/index.ts`, `send-trial-expiry-reminders/index.ts` — checked for the same silent-swallow pattern; none found
- `docs/backlog-open-followups.md` — already contains an `email-delivery-audit` item (status: in-progress) matching this exact request, raised 2026-09-15

---

# Relevant Components

- Edge Functions (Deno, Supabase) — all outbound email senders
- `pg_cron` + `pg_net` (Postgres extensions) — scheduling for digest, reminders, birthday messages, trial expiry
- Supabase Vault — holds cron job URLs/secrets out-of-band (not in migration SQL)
- `notification_settings` table — per-tenant opt-in/config for digest frequency and reminder toggles
- `message_logs` table — delivery audit trail; inconsistently populated (present for SMS reminders and most email sends, absent for digest and for the reminder email leg)
- Resend (external) — sole email delivery provider platform-wide

---

# Existing Constraints

- `digest_frequency` defaults to `off`; a tenant must explicitly opt in (migration `20260906170000`, 2026-09-06). Not a bug — this narrows who *should* be receiving digests today, independent of the delivery defect.
- `email_appointment_reminders` defaults to `true`, `reminder_hours_before` defaults to `24` (original `notification_settings` migration) — most tenants should be receiving reminders by default.
- `last_reminder_sent_at` is a one-shot idempotency gate with no distinction between "successfully sent" and "attempted" — a silently-failed send permanently marks the appointment as reminded.
- Both cron jobs' actual URL/secret values live in Supabase Vault, set via `supabase db query`/`vault.create_secret` outside of migration SQL — migrations only register the `pg_cron` job assuming those secrets already exist.
- `send-daily-digest` and `send-appointment-reminders` both have `verify_jwt = false` in `config.toml`, with in-function shared-secret checks as the real auth boundary.

---

# Existing Behaviour

- Manual/UI-triggered digest sends (with `tenantId` in the request body, authenticated via JWT + role check) bypass the `shouldSendToday` day-of-week/month gating, so an owner testing a weekly/monthly digest gets one immediately regardless of the real calendar day — this is intentional per an in-code comment and should be preserved.
- SMS appointment reminders correctly log both success and failure to `message_logs` with `provider: "arkesel_sms"`; this is the pattern the email leg should be brought in line with, not a new design.

---

# Unknowns

- Q: Are the `pg_cron` jobs `send-daily-digest` and `send-appointment-reminders` actually present and enabled in the production Postgres instance, and do the required Vault secrets (`daily_digest_function_url`, `daily_digest_secret`, `appointment_reminders_function_url`, `appointment_reminders_secret`) exist with correct values? -> A: Could not verify — no live database/Management API access from this environment (`supabase link` failed with an insufficient-privileges error against the only Supabase org visible to the current CLI login, which is unrelated to this project; no `.env`/service-role credentials are present in the repo, by design). `[engineering - unresolved: runtime-only]`
- Q: Is `RESEND_API_KEY` valid and is the sending domain (`RESEND_FROM_EMAIL`, default `noreply@salonmagik.com`) verified in the live Resend account? A misconfiguration here would explain "fires but fails" independently of the code defects found. -> A: Could not verify — same access limitation. `[engineering - unresolved: runtime-only]`
- Q: Given the confirmed `sendResendEmail` silent-swallow defect, are digest/reminder emails actually failing at Resend today, or would they succeed once the swallow bug is fixed (i.e. is the swallow bug the *entire* explanation, or is there also a live config/secret problem underneath it)? -> A: Cannot be determined from source alone; requires either live log/Resend-dashboard access or a monitored test send after a fix lands. `[engineering - unresolved: runtime-only]`

Recording these now.

---

# Routing

This is a well-scoped engineering defect-fix task (not a new user-facing feature, no product/UX
ambiguity in scope) with confirmed source-level defects but with `[engineering - unresolved: runtime-only]`
unknowns that are not the sole cause of a single defect (they bear on multiple paths and on whether
live infra is even the problem) — so the analyst fast-path doesn't cleanly apply, and this hands off to
**planner** so the runtime verification and fix work get a Planning Brief before principal designs the
implementation. The scope also includes a real product question the user's own framing raises
("missing capability" gaps must be flagged, not built) which is exactly the kind of decision a Planning
Brief exists to carry forward.
