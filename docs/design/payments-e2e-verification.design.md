# Implementation Design — payments-e2e-verification

Status: implemented (Tier B harness + execution, reviewed and passed 2026-09-15). Tier A execution remains blocked on the user supplying real Paystack test-mode credentials — see `docs/backlog-open-followups.md` → `payments-e2e-verification` for the exact remaining gap.

Backlog item: `docs/backlog-open-followups.md` → `## payments-e2e-verification: End-to-end payments verification before beta` (status: in-progress, checkpoint, gating `subaccount-split-cleanup`)

---

# 1. References

- Planning Brief: `docs/prd/payments-e2e-verification.prd.md`
- Technical Brief: `docs/research/2026-09-14-payments-e2e-verification.md`
- Backlog items: `docs/backlog-open-followups.md:46-70` (`subaccount-split-cleanup`, `payments-e2e-verification`)
- Integration-test precedent this design reuses: `supabase/functions/backoffice-add-tenant-co-owner/index.integration.test.ts`

This document does not restate the problem, the as-is payment path, the scenario list, or the acceptance criteria — those are in the two briefs above. It covers only *how* the plan is built, how it is executed, and how the verdict is produced.

---

# 2. Corrections to the Technical Brief

The brief is accurate on everything it examined, but it did not look at refunds, and both it and the PRD therefore treat the refund capability as unknown. All three facts below were verified by direct reading of source in this worktree, and each changes a matrix cell.

**C-1. An in-product refund path exists.** `apps/salon-admin/src/components/dialogs/RequestRefundDialog.tsx:143` invokes `supabase/functions/refund-via-paystack/index.ts`, which calls Paystack `POST /refund` with the currency-resolved key (`getPaystackKeyForCurrency`) and then records the refund through the `complete_transaction_refund` RPC. A second, narrower path exists for cancellations: `supabase/functions/refund-cancelled-appointment/index.ts`. PRD assumption *"Does a refund capability exist? → Unknown"* is therefore superseded: the refund cells are **real pass/fail tests of an existing feature**, not an open-ended "record what a salon can do" finding.

**C-2. The webhook processor handles no refund events.** `_shared/payment-webhook-processor.ts` branches only on `isPaymentSuccessEvent` (line 278), payment-failure, and `isTransferEvent` (line 1016). There is no `refund.processed` / `refund.pending` / `refund.failed` branch. Consequences the matrix must cover: a refund initiated in the Paystack dashboard (out of band) produces **no** product-side record at all, and an in-product refund that Paystack later completes asynchronously (Paystack refunds are frequently `pending` before `processed`) is recorded optimistically at request time and never reconciled against the final outcome.

**C-3. `complete_transaction_refund` does not debit the salon wallet.** Reading the function body in `supabase/migrations/20260725000002_customer_value_and_refunds.sql`: it inserts a reversing `transactions` row, completes/creates the `refund_requests` row, and updates `appointments.payment_status` to `refunded_partial`/`refunded_full` — but touches no `salon_wallets` row and writes no `wallet_ledger_entries`. The salon wallet was credited on `charge.success` via `credit_salon_purse` and is never reduced when that charge is refunded.

C-3 is material to the verdict, not just to the matrix: it means a salon can withdraw money that has already been returned to the customer. It is a **payout-path** concern, and the go/no-go verdict this run exists to produce must address it explicitly. It is not, however, in this run's remit to fix (PRD "Out of Scope" — findings are ticketed, not patched).

---

# 3. What this run produces

Four artifacts, in this order. Nothing is executed before artifact 1 exists on disk (PRD AC-1).

| # | Artifact | Path |
|---|---|---|
| 1 | Test plan (the matrix, expected outcomes, pass criteria, environment rules) | `docs/test-plans/payments-e2e.test-plan.md` |
| 2 | Cell manifest (machine-readable, one row per cell) | `docs/test-plans/payments-e2e.cells.json` |
| 3 | Harness + scenario tests | `supabase/functions/_shared/payments-e2e/` |
| 4 | Results + go/no-go verdict | `docs/test-plans/payments-e2e.results.md` |

Section 14 below **is** the specification of artifact 1. Implementer transcribes and expands it into that document — it does not re-derive the matrix.

**Fold-in note (per "Adjacent defects"):** none. C-1/C-2/C-3 are findings about code this run only *observes*; repairing them is explicitly out of scope per the PRD, and each becomes its own backlog item + Jira ticket. No defect is being folded into this design.

---

# 4. Architecture Decisions

### AD-1 — Two tiers of evidence, both required where applicable

**Decision.** Every cell is executed in one or both of two tiers, and the tier is recorded with the result.

- **Tier A — live Paystack test-mode.** A real transaction against the real Paystack test account for that currency, with the webhook delivered by Paystack itself to the deployed `payment-webhook-gh`/`-ng` function. Proves the integration as configured: keys, signing secrets, endpoint registration, Paystack's own event shapes.
- **Tier B — deterministic replay.** The harness constructs a realistic Paystack event payload, signs it with a real HMAC-SHA512 over the raw body using the currency's test secret, and drives it through the real code path against a real database. Proves behaviour repeatably and covers what Paystack cannot be asked to do on demand.

**Reasoning.** Tier A alone cannot produce a duplicate delivery, a reversed transfer, or an out-of-order event on request, and it is not reproducible by a second person (PRD non-functional: Reproducibility). Tier B alone proves only that our code responds correctly to payloads *we* wrote — it cannot catch a wrong signing secret, an unregistered webhook URL, or a Paystack payload shape we guessed wrong. Each tier covers the other's blind spot, so the honest answer is both, with the tier recorded so the verdict never over-claims.

**Rejected.** *Tier A only* — fails reproducibility and cannot cover duplicate-webhook or reversal, which are the two cells the verdict most depends on. *Tier B only* — a false "go" is the PRD's most expensive failure mode, and a mocked-Paystack-only run is exactly how one is produced. *Mocked-client unit tests* (the existing `index.test.ts` convention) — already exist and are precisely the coverage the brief says is insufficient.

### AD-2 — Tier B asserts against `processWebhook` directly, not through the HTTP endpoint

**Decision.** For Tier B assertions the harness imports and awaits `processWebhook` from `_shared/payment-webhook-processor.ts`. The HTTP wrapper (`payment-webhook-gh`/`-ng`) is covered separately by a small, dedicated set of transport cells (section 14.4).

**Reasoning.** Both webhook functions call `processWebhook` **without awaiting it** and return `200` immediately (Technical Brief, "Existing Constraints"). A harness that POSTs to the endpoint and then reads the database is racing an unawaited promise: it would produce flaky results and, worse, intermittent false passes. Awaiting the processor directly removes the race entirely and makes each cell deterministic. Splitting transport from behaviour also means a failure tells you *which* it was.

This is the same shape as the existing precedent, which imports `handleAddTenantCoOwner` directly rather than going over HTTP.

**Rejected.** *Poll-with-timeout after POSTing to the endpoint* — turns every cell into a sleep, makes the suite slow and flaky, and a timeout is indistinguishable from a silent processor failure. *Changing the webhook to await* — that is a change to the money path inside the run that is meant to independently verify it; forbidden by the PRD and by AD-9.

### AD-3 — The harness signs payloads with an independent HMAC implementation

**Decision.** Tier B computes the `x-paystack-signature` with Deno's own `crypto.subtle` HMAC-SHA512 in the harness, not by calling the verification helper in `_shared/paystack-helpers.ts`.

**Reasoning.** Using the production verifier to generate the signature it will then check makes signature verification untestable — any bug in it passes by construction. An independent implementation means the transport cells genuinely test that the function rejects bad signatures and accepts good ones.

### AD-4 — A hard environment guard, executed before any fixture is written

**Decision.** `_shared/payments-e2e/guard.ts` exports `assertSafeEnvironment()`, called at module load by every harness entry point. It throws unless **all** hold: every Paystack key in the environment begins `sk_test_`; `SUPABASE_URL` does not match the production project ref (read from an explicit `PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS` list, defaulting to the prod ref); `PAYMENTS_E2E_ACK=i-am-not-on-production` is set. No fallback, no warning-and-continue.

**Reasoning.** PRD AC-17 requires an auditable guarantee that no step touched production. A written instruction is not a guarantee; a fail-closed assertion in the one place every scenario passes through is. The `sk_test_` prefix check is the strongest available signal because Paystack's own key format encodes the mode. The explicit acknowledgement variable prevents a stray already-exported prod environment from satisfying the other two checks by accident.

**Rejected.** *Relying on the operator to set the right env vars* — the failure mode is silent, irreversible and involves real customers' money. *Allowing an override flag* — an override exists to be used.

### AD-5 — Local Supabase stack is the default target; the DEV project is permitted

**Decision.** The harness targets whatever `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` point at, defaulting to the local stack (`http://127.0.0.1:54321`) exactly as the existing integration-test precedent does. Tier B runs entirely locally. Tier A requires the DEV project, because Paystack must be able to reach a deployed webhook URL.

**Reasoning.** The PRD's constraint is "never production"; DEV-or-local is a free engineering choice within it. Local gives Tier B fast, isolated, reproducible runs on a database the operator can reset, which is what makes a second person reproducing the plan realistic. Tier A cannot be local — Paystack needs a public endpoint — so it uses DEV, which is what the PRD names.

### AD-6 — Fixtures are seeded per-cell and namespaced, never shared

**Decision.** Each cell seeds its own tenant, customer, appointment/invoice, wallet and payout destination through a `fixtures.ts` factory, tagged `e2e-<cell-id>-<timestamp>`, and asserts only against rows carrying that tag.

**Reasoning.** Cells must be independently re-runnable and order-independent, or a failure cannot be reproduced in isolation (PRD: Reproducibility). Shared fixtures also make duplicate-webhook cells actively misleading, since a second cell's writes look like the duplicate under test. This follows the precedent's `seed(tag)` pattern.

### AD-7 — Evidence is emitted as structured records; the results document is rendered from them

> **Amended by AD-R2** (`docs/design/payments-e2e-verification-resume.design.md`) — before/after and, for
> Paystack-calling cells, external_references are now runtime-enforced by `recordCell()`, not merely
> collected on a best-effort basis. See the amendment for the exact scope and the exemption for `n/a`/`not-run`.

**Decision.** Every cell appends one JSON record to `docs/test-plans/payments-e2e.evidence.jsonl` — cell id, requirement ids, currency, intent, scenario, tier, result (`pass` | `fail` | `n/a` | `not-run`), the before/after snapshot of every row it asserted on, external references (Paystack reference, withdrawal reference), timestamp, and a free-text note. `docs/test-plans/payments-e2e.results.md` is generated from that file.

**Reasoning.** The PRD forbids a pass claim backed by recollection and requires that no cell be silently missing. If evidence is a byproduct of execution rather than something written up afterwards, both properties hold mechanically: an unrun cell has no record and renders as `not-run`, and a pass carries the state that justified it. Rendering rather than hand-writing the results table also removes the most likely place for a false "go" to enter — transcription.

### AD-8 — The harness lives in `_shared/payments-e2e/`, and stays out of CI

**Decision.** Harness modules in `supabase/functions/_shared/payments-e2e/`; scenario suites as `*.integration.test.ts` beside them. No CI wiring — `.github/workflows/ci.yml` runs `pnpm test` and has no Deno step, and nothing here changes that.

**Reasoning.** `_shared/` is the established home for code spanning multiple edge functions, and this harness spans six. `*.integration.test.ts` is the established marker for "drives a live stack, not run by CI" — the precedent file says so in its own header. Keeping it out of CI is required: PRD explicitly puts a standing CI payments suite out of scope, and a suite that spends real Paystack test-mode calls on every push is a separate commitment with its own cost.

**Rejected.** *A `scripts/` directory* — none exists in this repo; inventing a second convention for test code that already has one.

### AD-9 — No production code is modified by this run

**Decision.** This run adds test-plan documents, harness code, results and backlog/ticket updates. It changes no file under `supabase/functions/` other than the new `_shared/payments-e2e/` directory, and no migration.

**Reasoning.** The verdict's only value is its independence. A run that repaired the money path while verifying it would be attesting to its own changes, and the PRD forbids it in three separate places. This is stated as a decision so that reviewer can check it as a diff-shaped property: any production-code change in this run's diff is a review failure, regardless of merit.

### AD-10 — The verdict is scoped to the payout path and stated as two separable answers

> **Amended by AD-R1** (`docs/design/payments-e2e-verification-resume.design.md`) — the verdict now lives in
> its own hand-written file, `docs/test-plans/payments-e2e.verdict.md`, which `render-results.ts` inlines
> verbatim. This section's shape (three named statements with resting cell ids) is unchanged; only its
> storage location moved, to stop a re-render from destroying it.

**Decision.** `payments-e2e.results.md` ends with a verdict section stating (a) go/no-go on the payout path, (b) whether `subaccount-split-cleanup` is thereby unblocked, (c) whether beta launch is thereby unblocked — as separate statements, each with the cell ids it rests on, plus any conditions attached to a "go".

**Reasoning.** The PRD already decided these are separable (a payout "go" unblocks the cleanup on its own; beta additionally requires the charge-side defects resolved). Structuring the verdict that way up front is what prevents the hedged "mostly fine, some concerns" outcome the PRD names as a risk — each statement is forced to be yes or no against named evidence.

**Note for the verdict author:** C-3 (wallet not debited on refund) is a payout-path finding and must be weighed under (a), not filed away as a charge-side defect. It does not automatically force a no-go — the cleanup is about deleting *superseded split code*, and C-3 is independent of splits — but the verdict must say which it is and why.

---

# 5. Components

**New — `supabase/functions/_shared/payments-e2e/`**

| Module | Responsibility |
|---|---|
| `guard.ts` | `assertSafeEnvironment()` (AD-4). Owns every production-safety check; nothing else performs one. |
| `env.ts` | Resolves Supabase + Paystack GH/NG config from the environment. Calls the guard on load. |
| `fixtures.ts` | `seedTenant`, `seedCustomer`, `seedAppointment`, `seedInvoice`, `seedWallet`, `seedPayoutDestination`, `cleanup(tag)` (AD-6). |
| `paystack-test-client.ts` | Thin Tier A client: initialize transaction, fetch transaction by reference, create refund, fetch transfer, fetch balance. Test keys only. |
| `webhook-replay.ts` | Builds realistic `charge.success` / `charge.failed` / `transfer.*` payloads from a seeded fixture; signs them (AD-3); `deliverToProcessor()` (awaits `processWebhook`) and `deliverOverHttp()` (for transport cells). |
| `assertions.ts` | Reusable observations: recorded payment count and amount, appointment `amount_paid`/`payment_status`, `transactions` rows, `invoices` rows, `wallet_ledger_entries` deltas, `salon_wallets.balance`, `salon_withdrawals.status`, captured outbound notifications. |
| `notifications.ts` | Captures receipt/notification sends so "exactly once" is assertable (section 9). |
| `evidence.ts` | `recordCell()` → appends to `payments-e2e.evidence.jsonl` (AD-7). |
| `render-results.ts` | Renders `payments-e2e.results.md` from the evidence file + cell manifest. |

**New scenario suites** (same directory): `checkout.integration.test.ts`, `webhook-recording.integration.test.ts`, `duplicate-delivery.integration.test.ts`, `refund.integration.test.ts`, `payout.integration.test.ts`, `transport.integration.test.ts`.

**Exercised, not modified:** `create-payment-session`, `payment-webhook-gh`, `payment-webhook-ng`, `_shared/payment-webhook-processor.ts`, `_shared/paystack-helpers.ts`, `_shared/payment-fee-calculator.ts`, `process-salon-withdrawal`, `verify-booking-payment`, `refund-via-paystack`, `refund-cancelled-appointment`, `send-invoice`, `send-appointment-notification`; RPCs `credit_salon_purse`, `debit_salon_purse_for_withdrawal`, `get_salon_wallet_availability`, `complete_transaction_refund`.

---

# 6. Data Flow

**Per Tier B cell:**

1. `guard.ts` asserts the environment is non-production. Failure aborts the process — no fixture is written.
2. `fixtures.ts` seeds a namespaced tenant + dependencies with the cell's currency (`tenants.currency` is authoritative for currency resolution downstream).
3. The cell calls the real `create-payment-session` handler to obtain a `payment_intents` row and reference — the amount is recomputed server-side, so the harness must not assert its own expected amount without deriving it from `total_amount - amount_paid` plus `computeBookingCharge`.
4. `assertions.ts` snapshots every row the cell will assert on (**before**).
5. `webhook-replay.ts` builds and signs the event and awaits `processWebhook`.
6. `assertions.ts` snapshots the same rows (**after**) and evaluates the cell's pass criterion.
7. For duplicate cells, steps 5–6 repeat with the byte-identical payload, and the criterion is evaluated on the delta between the two afters.
8. `evidence.ts` records the cell with both snapshots.
9. `cleanup(tag)` removes the fixture.

**Per Tier A cell:** as above, except step 5 is replaced by a real Paystack test-mode payment against the returned `authorization_url` (a browser step, or the test-card API where Paystack supports it), after which the cell polls for the Paystack-delivered webhook's effects with a bounded timeout, and records the Paystack reference as evidence. A Tier A cell that times out is recorded `fail` with the timeout noted — never `pass`, and never silently retried.

**Payout cells:** seed a wallet with settled balance → call the real `process-salon-withdrawal` handler with an authenticated owner JWT → assert the `salon_withdrawals` row and that the wallet is **not** yet debited → replay `transfer.success` / `transfer.failed` / `transfer.reversed` → assert the final wallet delta and withdrawal status.

---

# 7. API Changes

None. No endpoint, request shape, response shape, or event payload changes (AD-9).

---

# 8. Database Changes

No schema changes, no migrations, no indexes, no backfills. The harness writes only fixture rows through existing tables and removes them in teardown.

---

# 9. Validation

- **Environment validation** — AD-4, fail-closed, before anything else runs.
- **Amount validation** — expected amounts are derived from the same inputs the server uses (`appointments.total_amount - amount_paid`, plus `computeBookingCharge` for balance payments), never hardcoded per cell; a hardcoded expectation would pass a cell that a fee-calculation regression should fail.
- **Currency validation** — every cell asserts the currency on every row it touches. A cell run in GHS that finds an NGN row fails, even if amounts match.
- **"Exactly once" validation** — receipts and notifications are the weakest observation in this design, because `processWebhook` sends them through `send-invoice`, `send-appointment-notification` and direct Resend calls. Cells assert exactly-once on the durable artifacts (`invoices` rows, `transactions` rows) plus captured outbound sends. Capture is achieved by pointing the harness environment's Resend/SMS credentials at a capture endpoint (or an inbox the operator can read for Tier A) — **not** by stubbing the functions, which would stop testing them. If a given send cannot be captured in a cell, that cell records the notification sub-assertion as `n/a` with the reason rather than claiming exactly-once (PRD: correctness over completeness).

---

# 10. Error Handling

- A cell that throws is recorded `fail` with the error, and the suite continues to the next cell — one broken cell must not cost the run its other evidence.
- Teardown runs in a `finally`, so a failed cell still cleans up; a failed teardown is logged and recorded on the cell but does not mask the cell's own result.
- The harness never retries a cell to get a better answer. A flake is recorded as a flake; a cell whose result depends on timing is marked as such in the plan (PRD: cells whose outcome depends on manual timing must be identified).
- Guard failure is fatal for the whole process, not per-cell.

---

# 11. Security Considerations

- Test keys only, enforced by AD-4. No key, token, or JWT is written into any artifact: the evidence file records Paystack *references*, never authorization codes, card data, or keys. `render-results.ts` must not copy raw request/response bodies into the results document.
- Fixture users are created with throwaway credentials on throwaway domains, following the precedent. Per the project's standing rule, tenant-user auth for tests uses passwords, never `generateLink`/magic links.
- The evidence file and results document are committed to the repository — they must contain no customer-identifying data beyond the synthetic fixtures the harness created.
- Signature verification is exercised, never bypassed (AD-3). No harness code path may call `processWebhook` in a way that a production caller could reach without a valid signature.

---

# 12. Performance Considerations

Not a performance-tested path (explicitly out of scope), but the harness's own data access matters for reliability:

- Every assertion fetches by the key it already knows — `payment_intents` by id, `appointments` by id, `transactions`/`invoices`/`wallet_ledger_entries` filtered by `tenant_id` **and** the fixture tag, `salon_withdrawals` by reference. No cell loads a table and filters in memory; with parallel-run fixtures present that is both slow and wrong.
- "Exactly once" is asserted with a filtered `count` in the query, not by fetching rows and counting client-side.
- Tier A polling is bounded (fixed attempt count, fixed interval, hard ceiling) and never unbounded.
- Cells run sequentially within a suite. Fixture isolation makes parallelism safe in principle, but Paystack test-mode rate limits and the shared wallet-availability RPC make it not worth the debugging cost.

---

# 13. Compatibility

No backward-compatibility surface: nothing shipped changes. The harness depends on current internal shapes (`processWebhook`'s signature, `credit_salon_purse`'s arguments, `payment_intents.intent_type` values); if a later change to the money path breaks the harness, that is the harness doing its job and it is updated alongside. The test plan is written to outlive this run (PRD success criterion: reusable for the next change to the payment path), so it states expected *behaviour*, with cell code as the implementation of that expectation rather than its definition.

---

# 14. The test plan specification

This section is the source for `docs/test-plans/payments-e2e.test-plan.md` and `payments-e2e.cells.json`.

## 14.1 Cell identity

Every cell has id `<AREA>-<INTENT>-<SCENARIO>-<CURRENCY>`, e.g. `PAY-BOOK-DUP-GHS`. Currencies: `GHS`, `NGN` — always both, never generalised from one (separate Paystack accounts). Every cell carries the PRD functional-requirement ids it evidences.

Intents: `BOOK` (appointment payment — covering guest checkout and outstanding-balance payment as sub-cases), `CPT` (customer purse top-up), `SPT` (salon purse top-up), `INV` (invoice payment), `MSG` (messaging credit purchase), `SUB` (subscription activation).

Scenarios: `OK` success · `FAIL` declined card · `ABD-C` abandoned but charge succeeded · `ABD-N` abandoned with no charge · `DUP` duplicate webhook delivery · `REF` refund.

## 14.2 Applicability

| Intent | OK | FAIL | ABD-C | ABD-N | DUP | REF |
|---|---|---|---|---|---|---|
| BOOK | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CPT | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| SPT | ✓ | — | ✓ | — | ✓ | — |
| INV | ✓ | — | ✓ | — | ✓ | ✓ |
| MSG | ✓ | — | — | — | ✓ | — |
| SUB | ✓ | ✓ | ✓ | — | ✓ | — |

Every `—` is a deliberate not-applicable and the plan document must carry its reason. The reasons, to be transcribed:

- `BOOK` is full-depth because it is the deepest recording path (appointment update + two possible transaction rows + invoice + notifications + wallet credit); a defect in the shared path surfaces here first.
- `ABD-N` is BOOK-only: for every other intent, "no charge occurred" leaves only an orphaned `payment_intents` row, which `BOOK-ABD-N` already covers as a shared-path property.
- `FAIL` is omitted for `SPT`/`INV`/`MSG` because the failure branch in `processWebhook` is intent-independent and is covered by `BOOK-FAIL` and `SUB-FAIL`; the cells are marked n/a-covered-elsewhere, not n/a-untested.
- `REF` is omitted for `SPT`/`MSG`: neither has a product refund path (refund is reached from a transaction in salon-admin's refund dialog, and via cancelled-appointment); the absence is itself recorded as a finding rather than a passing cell.
- `DUP` is required for **every** intent. It is the known defect and the highest-value cell in the matrix; it is also the only scenario where per-intent behaviour genuinely diverges, since each intent branch has its own recording steps.

## 14.3 Expected outcome and pass criterion per scenario

Each is stated in the PRD's three places — customer, salon, record. These are the templates; the plan document instantiates them per intent and currency.

**OK** (FR-6, 7, 8) — *Customer:* confirmation and exactly one receipt with the correct amount and currency. *Salon:* exactly one owner/manager notification; the amount visible in records and wallet. *Record:* exactly one `transactions` row of the correct amount and currency; for BOOK, `appointments.amount_paid` increased by exactly the charge with `payment_status` consistent and no residual balance discrepancy; exactly one `invoices` row; `salon_wallets.balance` increased by exactly the credited amount with one matching `wallet_ledger_entries` row; `payment_intents.status = completed`.
**Pass:** every count is exactly 1 and every delta is exactly the expected amount. Any count of 0 or ≥2, or any delta mismatch, fails.

**FAIL** (FR-9) — *Customer:* clear failure, able to retry. *Salon:* nothing. *Record:* no `transactions` row, no `invoices` row, appointment unchanged, wallet balance and ledger unchanged, no receipt or notification sent.
**Pass:** every observed row and balance is byte-identical to the before-snapshot, and the captured send count is 0.

**ABD-C** (FR-10) — the browser never returns; the charge succeeded and only the webhook fires. *Expected:* outcome identical to `OK` in every respect.
**Pass:** the `OK` criterion holds with `verify-booking-payment` never invoked. The cell must assert that the redirect path was not exercised, otherwise it is not testing the thing it claims.

**ABD-N** (FR-11) — abandoned with no charge; no webhook arrives. *Record:* the `payment_intents` row remains non-`completed`; nothing else exists — no transaction, no invoice, no wallet movement, appointment untouched.
**Pass:** no partial record of any kind, and the pending intent is distinguishable from a completed one.

**DUP** (FR-12) — the byte-identical success event delivered twice. *Expected per PRD:* no change on the second delivery. *Known current behaviour:* only the wallet credit is protected.
**Pass criterion:** the cell passes only if the second delivery changes nothing. **This cell is expected to fail for BOOK today and the run records the actual observed outcome rather than skipping it** (PRD FR-12 states this explicitly). The evidence must quantify the divergence precisely: the `appointments.amount_paid` overstatement, the count of extra `transactions` rows, extra `invoices` rows, extra sends, and — separately — that `salon_wallets.balance` did *not* double. The per-intent DUP results together determine how wide the defect is, which is what the beta-blocker severity assessment rests on.

**REF** (FR-13, plus C-1/C-2/C-3) — a successful payment is then refunded through the in-product path. Three sub-assertions, each recorded separately:
- **REF-a (in-product refund records correctly):** `refund-via-paystack` returns success; a reversing `transactions` row exists; `refund_requests` is `completed`; for BOOK, `appointments.payment_status` is `refunded_partial`/`refunded_full` per the amount. **Pass:** all four hold.
- **REF-b (wallet reconciliation):** `salon_wallets.balance` after the refund, compared to before. **Expected by correctness:** reduced by the refunded amount. **Expected by current code (C-3):** unchanged. **Pass:** reduced. This cell is expected to fail and its result feeds the payout verdict (AD-10).
- **REF-c (out-of-band refund):** a refund issued directly against Paystack (Tier A, dashboard or API) with no in-product action. **Expected by correctness:** the product reflects it. **Expected by current code (C-2):** no product-side record whatsoever. **Pass:** the product reflects it. Expected to fail; recorded as a finding.

## 14.4 Transport cells

Per currency, against the deployed function (`PAY-TRANSPORT-*-<CURRENCY>`): a correctly-signed event returns 200 and is processed (FR-6); a tampered body with the original signature is rejected without side effects; an event signed with the *other* currency's secret is rejected (this is the cell that catches a GH/NG key-crossover misconfiguration); a malformed body is rejected without a 5xx. Also recorded here, as an observation rather than a pass/fail: the function returns 200 before processing completes, so a processor failure is invisible to Paystack's retry mechanism (Technical Brief, "Existing Constraints").

## 14.5 Payout cells

Per currency (`PAYOUT-*-<CURRENCY>`), each against a seeded wallet with a known settled balance:

| Cell | FR | Expected | Pass criterion |
|---|---|---|---|
| `W-OK` | 16 | Transfer succeeds; withdrawal `completed`; wallet reduced by exactly the amount, once | Delta equals amount exactly; exactly one debit ledger entry |
| `W-FAILED` | 17 | `transfer.failed`; withdrawal `failed`; wallet untouched | Balance identical to before; no debit entry |
| `W-REVERSED` | 17 | `transfer.reversed`; withdrawal `failed`; wallet untouched | As above |
| `W-DUP-REQ` | 18 | Second identical request inside the 5-minute window refused (409) | Exactly one `salon_withdrawals` row; exactly one Paystack transfer |
| `W-DUP-EVT` | 21 | `transfer.success` delivered twice | Wallet debited exactly once; second delivery is a no-op |
| `W-OVER` | 19 | Amount above settled/available refused with an actionable reason, even where raw balance looks sufficient | 4xx with a reason string; no withdrawal row; no transfer |
| `W-FLOOR` | 19 | Request above Paystack's live platform balance refused | 4xx; no transfer |
| `W-OTP` | 20 | Paystack holds for OTP → `awaiting_otp` | Not shown to the salon as completed or failed, and not an unexplained stuck item — assessed against the salon-facing Payouts view, not the database value alone |

`W-OTP` cannot be forced on demand in Paystack test mode. If it cannot be triggered honestly, it is recorded `n/a` with the reason and the verdict states that FR-20 is unevidenced — it is never marked pass by inference. `W-OVER` requires a wallet whose raw balance exceeds its settled availability; the fixture constructs that state directly so the cell does not depend on real settlement timing.

## 14.6 Traceability

The cell manifest carries `requirement_ids` per cell, and `render-results.ts` emits a requirement-coverage table so the verdict can be read against FR-6 … FR-26. Any functional requirement with no passing cell is listed explicitly as unevidenced.

---

# 15. Edge Cases

- **Currency mismatch** (FR-14): a payment attempt whose currency differs from `tenants.currency` is refused. One cell per currency.
- **Already-settled booking** (FR-15): session creation for a `fully_paid` / `refunded_full` appointment returns 409.
- **Split-payment bookings**: the BOOK success path can insert a *second* `transactions` row for a purse/split portion. The exactly-once assertion must expect the correct number of rows for the fixture's shape, not a blanket 1, or it fails a correct system.
- **Guest vs authenticated checkout**: `appointment_payment` needs no bearer token, every other intent does. Both are asserted; an intent that succeeds unauthenticated when it shouldn't is a security finding, not a passing cell.
- **`SUBACCOUNT_SPLIT_ENABLED`**: currently off, and every cell runs with it off — that is the path under verdict. The harness asserts the flag's value at run start and records it in the evidence header, so a future reader knows which path the verdict covers.
- **Out-of-order delivery**: `transfer.success` arriving before `process-salon-withdrawal` has committed its row. Worth one cell; if the processor cannot find the withdrawal, the observed behaviour is recorded as a finding.
- **Multi-appointment sessions**: `create-payment-session` accepts multiple appointment ids; the amount is summed server-side. One BOOK-OK cell uses two appointments to cover the summation and per-appointment update.
- **Zero/negative balance**: a session for an appointment with no outstanding balance (refused, FR-15 adjacent).
- **Pending-then-processed refunds** (C-2): a Paystack refund that is `pending` at request time and `processed` later. The product records optimistically and never reconciles; recorded as a finding under REF-c.

---

# 16. Tests Required

The harness *is* the test artifact; there is no separate unit-test obligation for production code, since none changes (AD-9). Required:

- **Integration (the deliverable):** the six scenario suites in section 5, covering the matrix in 14.2–14.5.
- **Unit, for the harness itself:** `guard.ts` — asserts it throws for a live key, for a forbidden project ref, and for a missing acknowledgement, and passes only when all three conditions hold. This is the one piece of harness code whose failure mode is catastrophic and silent, so it gets its own mocked-environment test (`guard.test.ts`, runnable in CI-style isolation without a stack). `webhook-replay.ts` signature generation gets a unit test against a known-good HMAC vector.
- **Not required:** new tests for `create-payment-session`, the webhook functions, or `process-salon-withdrawal` — building permanent regression coverage is out of scope per the PRD.

---

# 17. Verification

```bash
# Harness unit tests (no stack needed)
deno test -A supabase/functions/_shared/payments-e2e/guard.test.ts \
             supabase/functions/_shared/payments-e2e/webhook-replay.test.ts

# Tier B, against a local stack
supabase start
export PAYMENTS_E2E_ACK=i-am-not-on-production
deno test -A supabase/functions/_shared/payments-e2e/*.integration.test.ts

# A single cell, for reproducing a failure in isolation
deno test -A --filter "PAY-BOOK-DUP-GHS" supabase/functions/_shared/payments-e2e/duplicate-delivery.integration.test.ts

# Render results + verdict scaffold from recorded evidence
deno run -A supabase/functions/_shared/payments-e2e/render-results.ts

# Repo-wide checks (nothing here should change their outcome)
pnpm lint && pnpm test
```

Tier A cells are driven by the same suites with `PAYMENTS_E2E_TIER=A` and DEV credentials, and include a manual browser step for hosted checkout; the plan document records the exact click path so a second person can repeat it.

---

# 18. Implementation Order

1. **`guard.ts` + `guard.test.ts` first, before any other harness code.** Nothing may touch a database or Paystack until the production guard exists and is proven to fail closed.
2. `env.ts`, `fixtures.ts`, `assertions.ts`, `evidence.ts` — the substrate, with one throwaway smoke cell proving seed → assert → record → cleanup works end to end against the local stack.
3. **Write and persist `docs/test-plans/payments-e2e.test-plan.md` and `payments-e2e.cells.json`** from section 14. This lands before any scenario cell is executed (PRD AC-1) — commit it on its own.
4. `webhook-replay.ts` + `webhook-replay.test.ts`, and `transport.integration.test.ts` (14.4). Proves signing and rejection before anything relies on replayed events.
5. `checkout.integration.test.ts` — session creation, currency mismatch, already-settled 409, guest vs authenticated (FR-14, 15).
6. `webhook-recording.integration.test.ts` — OK / FAIL / ABD-C / ABD-N across all applicable intents and both currencies (FR-6…11).
7. `duplicate-delivery.integration.test.ts` — DUP for every intent, both currencies (FR-12). Quantify, do not fix.
8. `payout.integration.test.ts` — all of 14.5, both currencies (FR-16…21). This is the verdict's evidence base.
9. `refund.integration.test.ts` — REF-a/b/c (FR-13, C-1/C-2/C-3), including the wallet-reconciliation cell.
10. Tier A pass: re-run the applicable cells against the DEV project with real Paystack test-mode transactions, recording tier on each result.
11. `render-results.ts` → generate `payments-e2e.results.md`; fill the verdict section per AD-10.
12. Raise each finding as its own backlog item in `docs/backlog-open-followups.md` **and** a Jira ticket under the payments epic, with severity relative to beta (FR-25). Expected at minimum: duplicate-webhook non-idempotency; refund wallet reconciliation (C-3); no refund-event webhook handling (C-2); plus anything the run discovers.
13. Update `payments-e2e-verification` with the outcome and `subaccount-split-cleanup` with the verdict's consequence (FR-26).

Steps 5–9 are independent of each other and can be reordered if a cell blocks; steps 1–4 are strictly ordered, and step 3 must precede any execution.

---

# 19. Open Questions

- `Q: Should the refund matrix cells be pass/fail tests or an open-ended finding, given the PRD assumed no refund path exists? -> A: Pass/fail tests. A refund path demonstrably exists (C-1), so the PRD's assumption is superseded by fact rather than by preference, and testing an existing feature is strictly more informative than describing it. The "what can a salon do" finding the PRD asked for is preserved as REF-c and the SPT/MSG not-applicable reasons. (decided autonomously)`
- `Q: Does the wallet-not-debited-on-refund finding (C-3) force a no-go on the payout path? -> A: It does not automatically, and the verdict author must decide it on the evidence. C-3 is independent of the subaccount/split question that `subaccount-split-cleanup` turns on, so it should not by itself block that cleanup; but it does mean a salon can withdraw refunded money, which is a beta-launch concern. AD-10 requires these to be answered as separate statements, which is what keeps the two from being conflated. (decided autonomously)`
- **Unresolved, needs a business call (carried from the PRD):** whether an out-of-band refund is acceptable for beta salons. C-2 sharpens this — an out-of-band refund is currently *invisible to the product*, so "acceptable" would mean accepting silent ledger divergence. This cannot be decided from the code.
- **Unresolved:** whether existing recorded payments in dev (or prod) have already diverged through duplicate deliveries, and who owns correcting them. The run should record whether it can tell from `transactions`/`wallet_ledger_entries` shape, but deciding the remediation is not this run's call.
- **Unresolved, may block Tier A:** whether Paystack **test** credentials exist for *both* GH and NG. If one is missing, that currency's Tier A cells are recorded `n/a` and the verdict must state the gap — evidence from one currency is explicitly not evidence for the other.

---

# Amendments

- **2026-09-15 — `docs/design/payments-e2e-verification-resume.design.md`.** A resume pass, after the first
  run produced a NO-GO verdict under a credentials-blocked environment. Amends AD-7 (AD-R2: runtime-enforced
  before/after and external_references) and AD-10 (AD-R1: the verdict moves to its own hand-written,
  never-generated file). Also introduces AD-R3 (REF decomposition generalised to CPT/INV, phantom manifest
  cells removed), AD-R4 (Tier A split into a server-to-server precondition and a stricter
  browser-checkout-required precondition), and AD-R5 (orphaned evidence surfaced instead of silently
  dropped). See that document for the full decisions and reasoning; this file's own text is otherwise
  unchanged, per its own AD-R6.
