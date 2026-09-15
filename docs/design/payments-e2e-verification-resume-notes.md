# Notes — payments-e2e-verification-resume

- Built: the destructive-overwrite fix that motivated this pass (`payments-e2e.verdict.md`, never
  auto-generated, inlined by `render-results.ts`), the REF-decomposition manifest fix (removed 6
  phantom cells, added 18 real sub-cells), a runtime-enforced evidence contract (AD-R2), the AD-R4
  Tier A split, 5 new Tier B cells, and a real Tier A run against the dev project with live
  `sk_test_` credentials. Design: `docs/design/payments-e2e-verification-resume.design.md`. Review:
  `.claudespace/s/0739740e-5540-4c70-a82e-ba8a55417027/reports/payments-e2e-verification-resume-review.md`.

- **Net evidence movement:** 32 pass / 28 fail / 26 n/a / 16 not-run → 54 pass / 8 fail / 38 n/a / 8
  not-run (108 manifest cells, up from 102 — REF decomposition removed 6 phantoms and added 18 real
  sub-cells). Independently recomputed from the raw manifest + evidence files in review, not just
  trusted from the report.

- **Non-obvious find, not anticipated by the design:** Paystack's `/transaction/initialize` rejects
  any `.test`-TLD customer email outright, regardless of credentials — this had been silently
  blocking every Paystack-calling cell in the *prior* run, making its NO-GO look more
  credential-blocked than it actually was. Fixed by switching fixture emails to the RFC
  2606-reserved `example.com`. This is what unblocked `PAY-BOOK-OK-*` and `PAY-TRANSPORT-*` for real.

- **Disclosed, deliberate gap — not hidden:** `REF-a` (refund-via-paystack's own initiating call) and
  the payout transfer-initiation cells (`W-DUP-REQ`, `W-FLOOR`, `W-OTP`) are correctly gated on the
  Tier A precondition but never actually call Paystack in this pass — `paystack-test-client.ts`'s
  `createRefund`/`fetchTransfer`/etc. remain unwired anywhere in the harness. Recorded honestly as
  `not-run` (never `fail`, since AD-R2 requires before/after state that doesn't exist for something
  never attempted), stated plainly in the verdict, and filed as its own backlog item
  (`payments-e2e-tier-a-initiation-calls`).

- **Confirmed for a third time:** `complete_transaction_refund` (C-3) does not debit the salon
  wallet — now confirmed against both the local stack and the dev project's real RPC, not just a
  static code read. This is the primary reason the fresh verdict is still NO-GO on the payout path.

- **Review found:** `transport.integration.test.ts`'s file header comment ("NOT EXECUTED in this
  pass") is now stale — the Tier A dev-project run it predates actually succeeded (confirmed via the
  evidence file's most-recent-per-cell records, all 8 `PAY-TRANSPORT-*` cells `pass`). Cosmetic,
  flagged OPTIONAL, not fixed in review (not reviewer's job to edit implementation files).

- **Review found:** `supabase/functions/.env` (gitignored) was left pointed at the dev project after
  this pass's Tier A run rather than reset to local, which broke the local-stack workflow for other
  suites until manually overridden — this is what caused this review's AD7 repro gate
  (`backoffice-add-tenant-co-owner`, an unrelated already-passed feature) to fail on first attempt.
  Root-caused to a stale PostgREST-adjacent env pointer, not a regression; confirmed passing once
  pointed at local. Worth a reminder to reset `.env` to local before the next local integration run.

- Follow-up (tracked in the backlog, not this pass's scope): `payments-e2e-tier-a-initiation-calls`
  (wire the actual Paystack-initiating calls), `payout-refund-wallet-not-debited` (fix C-3),
  `duplicate-webhook-not-idempotent` (fix BOOK/CPT/MSG double-recording on redelivery).
