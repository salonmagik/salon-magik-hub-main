# Notes — notification-settings-missing-per-tenant

- Built: a trigger + backfill guaranteeing every tenant has a `notification_settings` row, a new
  `appointment_reminder_sends` table carrying per-offset reminder dispatch state, a platform-wide
  `get_due_appointment_reminders` RPC, a 10-minute cron cadence, and the AD-10 one-time owner notice
  via the existing notifications bell. Design: `docs/design/notification-settings-missing-per-tenant.design.md`.
  Review: `.claudespace/s/0739740e-5540-4c70-a82e-ba8a55417027/reports/notification-settings-missing-per-tenant-review.md`.

- **Round 1 finding, since fixed:** the settle step in `send-appointment-reminders/index.ts` was
  overwriting `attempt_count` on every offset row in a collapsed group (AD-5) with a single
  group-derived value, discarding the correct per-row value the claim step had just written. Since
  the long offset (e.g. 24h) routinely accumulates attempts well before the 30-minute offset ever
  enters its own window, this silently jumped the less-attempted offset toward its 3-attempt cap
  early — a reminder could be dropped after fewer than 3 real attempts of its own, contradicting
  AD-3's explicit per-offset independence and AD-5's "never withholds a reminder" reasoning. Fixed
  in `bc80513` by simply not writing `attempt_count` in the settle update at all (only `sent_at`/
  `failed_at`, per the design's Data Flow step 6 — attempt_count was already correct from the claim
  step). Caught by review, not by the original unit test suite: `reminder-state.test.ts`'s
  "collapse" case only exercised offsets with identical (zero) prior attempt counts, which can't
  expose divergent-history corruption. The fix added a real integration test
  (`index.integration.test.ts`) that seeds divergent attempt histories and drives the actual
  deployed edge function against a live local stack — the only way to catch this class of bug, since
  it lived in the database write, not the pure state-transition logic.

- **Known, deliberately deferred gap:** the dev-project migration push, edge function deploy, and
  dev end-to-end verification (design's Implementation Order step 11, dev half) were never
  completed. The environment's auto-mode classifier denies `supabase link`/`db push --linked`
  against the dev project ref as a "Production Deploy" action, even though the ref
  (`yqahjtsizbqwxdbjzsli`) is dev, not prod. Needs the user to either grant explicit permission for a
  session to run it, or run `supabase db push --linked` + the function deploy themselves. Until
  then, the two dev appointments cited in the design's own evidence keep receiving zero reminders —
  this fix has not reached the dev database yet, only local.

- **Surfaced but correctly out of scope, not fixed:** AD-8 deprecates `last_reminder_sent_at`
  ("nothing writes them after this change"), but `AppointmentsPage.tsx`'s manual "Send reminder"
  cooldown UI still reads that column to rate-limit the button for 30 minutes. Since nothing writes
  it anymore, that cooldown is now permanently inert. This is a direct, disclosed consequence of an
  already-approved AD, not new scope the implementation missed — left as a human product/engineering
  call on whether it needs a small follow-up (e.g. wiring the cooldown to
  `appointment_reminder_sends`, or a client-side debounce).

- Four `open`-status backlog items were filed from this design's Open Questions (OQ-1..OQ-4):
  `reminder-30min-offset-not-configurable`, `drop-deprecated-appointment-reminder-columns`,
  `reschedule-reminder-cycle-reset`, `appointment-reminder-sends-pruning`. No `[gap: authority]`
  escalations in this run's deferral ledger for this slug.
