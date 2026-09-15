# Notes — email-delivery-audit

- Built: `sendResendEmail` now returns a classified result and writes a `message_logs` row on both
  branches; all 9 call sites (10 send points) across 8 files act on it; the digest reports
  per-recipient outcomes; the reminders job retries a failed send up to 3 attempts, bounded to never
  fire past appointment start; `get_backoffice_comms_usage()` no longer counts failed reminders as
  sent.
- Verified independently in review (`docs/design/email-delivery-audit.design.md`, this session):
  9/9 and 8/8 new unit tests pass; both migrations applied to the shared local stack and produce the
  expected columns/index/function body; all 9 call sites confirmed to pass `log:`; the ~22-27 `deno
  check` errors and the `CancelSubscriptionDialog` Vitest timeout are pre-existing (reproduced against
  `HEAD~1` in isolation) and unrelated to this diff.
- Non-obvious: `classifyResendFailure` is duplicated inline in `send-appointment-notification/index.ts`
  rather than imported from `_shared/salon-notifications.ts`, because that function doesn't call the
  shared `sendResendEmail` (it has its own direct Resend call). Not exported/shared — flagged as
  OPTIONAL, not worth a refactor for one call site.
- Deferred by design, not by omission: live production verification (FR-11–FR-13) needs Resend/Vault
  account access nobody in this pipeline holds — captured as
  `docs/email-delivery-verification-runbook.md` for whoever runs it next. Four capability gaps found
  along the way were filed as their own backlog items rather than built here (see
  `docs/backlog-open-followups.md`: `email-delivery-visibility`, `receipts-email-delivery-logging`,
  `cron-run-failure-alerting`, `email-bounce-tracking`).
