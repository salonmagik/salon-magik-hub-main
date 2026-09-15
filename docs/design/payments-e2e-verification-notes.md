# Notes — payments-e2e-verification

- Built: the full Tier B harness (`supabase/functions/_shared/payments-e2e/`), a committed
  102-cell test plan (`docs/test-plans/payments-e2e.{test-plan.md,cells.json}`), 72 real evidence
  records against the local stack (`payments-e2e.evidence.jsonl`), and a rendered, hand-completed
  verdict (`payments-e2e.results.md`). Design: `docs/design/payments-e2e-verification.design.md`.
  Review: `.claudespace/s/0739740e-5540-4c70-a82e-ba8a55417027/reports/payments-e2e-verification-review.md`.

- **Verdict this pass produced:** payout path NO-GO, `subaccount-split-cleanup` unblocked (its
  narrower question is answered — untouched by anything found), beta launch not unblocked. Two
  confirmed live defects: duplicate `charge.success` delivery is not idempotent for
  `BOOK`/`CPT`/`MSG`, and `complete_transaction_refund` never debits the salon wallet (C-3). Both
  filed as their own backlog items.

- **Why Tier A and ~40% of cells are `not-run`:** no `PAYSTACK_SECRET_KEY_GH`/`_NG` test-mode
  credential exists anywhere in this environment (verified independently in review — checked env,
  every `.env*` file, and `supabase/functions/.env*`; none exist). Every cell needing to actually
  call Paystack (session creation, in-product refunds, transfer initiation, all of Tier A) is
  blocked on the user supplying those keys plus DEV project access. This is a genuine external
  blocker, not a scope shortcut — re-running once supplied needs no code changes, only execution
  (see `docs/test-plans/payments-e2e.test-plan.md`'s Verification section).

- **Gap found in review, not disclosed as a deviation by the implementer:** the evidence schema
  (`evidence.ts`) supports `before`/`after` row snapshots and `external_references` per AD-7, but no
  cell in any suite actually populates them — every evidence record carries only a free-text `note`.
  This weakens (without invalidating — I independently re-ran the suites and got identical pass/fail
  counts) the audit trail AD-7 was designed to guarantee. Worth fixing before the next execution pass
  (Tier A) adds more records on top of this same gap.

- **Real footgun found in review:** `render-results.ts` unconditionally overwrites the entire
  `results.md`, including the hand-written Verdict section, with `_TODO_` placeholders on every run
  — confirmed by re-running it live and then reverting the change. The file's own header comment
  ("Re-run the harness and this script to update") and the design's Verification section both invite
  exactly this re-run once Tier A credentials arrive, which will silently destroy the current verdict
  with no backup. Needs a preserve-existing-verdict fix (or a separate file) before that re-run
  happens for real.

- **Also not-run, but not credential-blocked — implementer's own admission, not a review finding:**
  `CPT-FAIL`, `SPT-ABD-C`, `INV-ABD-C`, `SUB-ABD-C`, `CPT-REF`, `INV-REF` are applicable matrix cells
  (per the design's own §14.2 table) that were never attempted in any form, credential-blocked or
  otherwise — the implementer's report names this as running out of scope/time, not as blocked. None
  of them would change the verdict (already the most conservative NO-GO/not-unblocked), but they're
  real remaining work before this backlog item is fully executed.

- Jira tickets for the two confirmed defects were not filed — no Jira/MCP tool access in this or the
  implementer's session (confirmed absent from this review's own tool list too). Backlog items were
  filed instead, each pointing at the exact evidence. A human needs to create the tickets.

- Follow-up (external, user-owned): supply `PAYSTACK_SECRET_KEY_GH`/`PAYSTACK_SECRET_KEY_NG`
  (`sk_test_...`) plus DEV Supabase project access, then re-run per the test plan's Verification
  section to close out Tier A and the remaining not-run cells above.
