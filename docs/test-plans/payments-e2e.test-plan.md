# Payments E2E — Test Plan

Source: `docs/design/payments-e2e-verification.design.md` section 14 (the specification this document transcribes and expands). Backlog item: `payments-e2e-verification` in `docs/backlog-open-followups.md`.

This is artifact 1 of the run (design section 3) and is committed before any scenario cell executes (PRD AC-1). The machine-readable cell manifest generated from the same source is `docs/test-plans/payments-e2e.cells.json` (102 cells; regenerate with `deno run -A supabase/functions/_shared/payments-e2e/generate-manifest.ts` if `matrix.ts` changes — never hand-edit the JSON).

## Environment rules

- **Never production.** Every harness entry point calls `guard.ts#assertSafeEnvironment()` on module load (design AD-4): every Paystack key present must start with `sk_test_`, `SUPABASE_URL` must not match a project ref listed in `PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS` (which must itself be set explicitly — see the implementer report for why there is no hardcoded default), and `PAYMENTS_E2E_ACK=i-am-not-on-production` must be set. No override exists.
- **Tier B (deterministic replay)** targets the local Supabase stack by default (`supabase start`), matching the existing integration-test convention.
- **Tier A (live Paystack test-mode)** requires the DEV Supabase project (Paystack needs a public webhook URL) and real `sk_test_` keys for both `PAYSTACK_SECRET_KEY_GH` and `PAYSTACK_SECRET_KEY_NG`.
- Every cell is namespaced per design AD-6 (`e2e-<cell-id>-<timestamp>` tag on every seeded row) and independently re-runnable.
- Every cell's evidence is a JSON record appended to `docs/test-plans/payments-e2e.evidence.jsonl` (design AD-7); `docs/test-plans/payments-e2e.results.md` is rendered from that file by `render-results.ts`, never hand-written.

## Two tiers of evidence (design AD-1)

- **Tier A** — a real transaction against the real Paystack test account, webhook delivered by Paystack itself to the deployed function. Proves the integration as configured.
- **Tier B** — the harness builds and independently signs (AD-3) a realistic Paystack event and delivers it straight to `processWebhook` (AD-2, never over HTTP — both webhook functions return 200 before awaiting the processor, so racing that over HTTP would be flaky by construction). Proves behaviour repeatably and covers what Paystack cannot be asked to do on demand (duplicates, reversals, out-of-order delivery).

Both tiers are recorded where applicable; neither substitutes for the other (see design AD-1 "Rejected").

## Cell identity (design 14.1)

`<AREA>-<INTENT>-<SCENARIO>-<CURRENCY>`, e.g. `PAY-BOOK-DUP-GHS`. Currencies are always both `GHS` and `NGN` — a finding in one currency's Paystack account is never assumed to hold for the other, since they are separate accounts.

- **Intents:** `BOOK` (appointment payment, incl. guest checkout and outstanding-balance payment), `CPT` (customer purse top-up), `SPT` (salon purse top-up), `INV` (invoice payment), `MSG` (messaging credit purchase), `SUB` (subscription activation).
- **Scenarios:** `OK` success · `FAIL` declined card · `ABD-C` abandoned but charge succeeded · `ABD-N` abandoned, no charge · `DUP` duplicate webhook delivery · `REF` refund.

## Applicability (design 14.2)

| Intent | OK | FAIL | ABD-C | ABD-N | DUP | REF |
|---|---|---|---|---|---|---|
| BOOK | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CPT | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| SPT | ✓ | — | ✓ | — | ✓ | — |
| INV | ✓ | — | ✓ | — | ✓ | ✓ |
| MSG | ✓ | — | — | — | ✓ | — |
| SUB | ✓ | ✓ | ✓ | — | ✓ | — |

Every `—` carries a reason in `payments-e2e.cells.json` (`reason_if_not_applicable`) and is rendered `N/A` in the results, never silently omitted. The reasons (design 14.2, and see `matrix.ts`):

- `BOOK` is full-depth because it is the deepest recording path (appointment update + up to two transaction rows + invoice + notifications + wallet credit) — a defect in the shared path surfaces here first.
- `ABD-N` is BOOK-only: for every other intent an abandoned no-charge session leaves only an orphaned `payment_intents` row, which `BOOK-ABD-N` already covers as a shared-path property.
- `FAIL` is omitted for `SPT`/`INV`/`MSG`: the failure branch in `processWebhook` is intent-independent and is covered by `BOOK-FAIL`/`SUB-FAIL` — n/a-covered-elsewhere, not n/a-untested.
- `REF` is omitted for `SPT`/`MSG`: neither has a product refund path reaching their transactions — the absence is itself a finding, not a passing cell.
- `DUP` is required for **every** intent — it is the known defect (only the wallet credit is protected by idempotency) and the highest-value cell in the matrix, and each intent branch has its own recording steps that can diverge independently.

## Expected outcome and pass criterion per scenario (design 14.3)

Each is stated in three places — customer, salon, record.

**OK** (FR-6/7/8) — *Customer:* confirmation, exactly one receipt, correct amount/currency. *Salon:* exactly one owner/manager notification; amount visible in records and wallet. *Record:* exactly one `transactions` row (correct amount/currency); for BOOK, `appointments.amount_paid` increased by exactly the charge with a consistent `payment_status`; exactly one `invoices` row; `salon_wallets.balance` increased by exactly the credited amount with one matching `wallet_ledger_entries` row; `payment_intents.status = completed`.
**Pass:** every count exactly 1, every delta exactly the expected amount. Any count of 0 or ≥2, or any delta mismatch, fails.

**FAIL** (FR-9) — *Record:* no `transactions` row, no `invoices` row, appointment unchanged, wallet unchanged, no receipt/notification sent.
**Pass:** every observed row/balance byte-identical to the before-snapshot; captured send count 0.

**ABD-C** (FR-10) — browser never returns; charge succeeded, only the webhook fires. **Pass:** the `OK` criterion holds, and `verify-booking-payment` was never invoked (the redirect path must not have been exercised — otherwise the cell isn't testing what it claims).

**ABD-N** (FR-11) — abandoned, no charge, no webhook. **Pass:** no partial record of any kind; `payment_intents` row remains non-`completed` and is distinguishable from a completed one.

**DUP** (FR-12) — the byte-identical success event delivered twice. **Pass criterion:** the cell passes only if the second delivery changes nothing. **This is expected to fail for BOOK today** (and is recorded as the actual observed outcome, per FR-12, never skipped). The evidence quantifies: `appointments.amount_paid` overstatement, extra `transactions` rows, extra `invoices` rows, extra sends — and separately confirms `salon_wallets.balance` did **not** double (the one part of the wallet credit path that is idempotency-protected, via the `(tenant_id, idempotency_key)` unique index on `wallet_ledger_entries`).

**REF** (FR-13, plus design corrections C-1/C-2/C-3) — three sub-assertions per currency, `PAY-BOOK-REF-a/b/c-<CURRENCY>`:
- **REF-a** (in-product refund records correctly): `refund-via-paystack` returns success; a reversing `transactions` row exists; `refund_requests` is `completed`; for BOOK, `appointments.payment_status` reflects the amount. **Pass:** all four hold.
- **REF-b** (wallet reconciliation): `salon_wallets.balance` before vs. after. **Expected by correctness:** reduced by the refunded amount. **Expected by current code (C-3 — `complete_transaction_refund` never debits the wallet):** unchanged. **Pass:** reduced. **Expected to fail today**; feeds the payout verdict (AD-10).
- **REF-c** (out-of-band refund, Tier A): a refund issued directly against Paystack, no in-product action. **Expected by correctness:** the product reflects it. **Expected by current code (C-2 — the webhook processor has no `refund.*` branch):** no product-side record at all. **Pass:** the product reflects it. **Expected to fail today**; recorded as a finding.

## Transport cells (design 14.4)

Per currency (`PAY-TRANSPORT-<KIND>-<CURRENCY>`), against the *deployed* function (never `processWebhook` directly — see AD-2):

- **OK:** a correctly-signed event returns 200 and is processed (FR-6).
- **TAMPERED:** a tampered body with the original signature is rejected, no side effects.
- **WRONG-CURRENCY-SECRET:** an event signed with the *other* currency's secret is rejected — catches a GH/NG key-crossover misconfiguration.
- **MALFORMED:** a malformed body is rejected without a 5xx.

Also recorded as an observation (not pass/fail): the function returns 200 before processing completes, so a processor failure is invisible to Paystack's retry mechanism.

## Payout cells (design 14.5)

Per currency (`PAYOUT-<KIND>-<CURRENCY>`), each against a seeded wallet with a known settled balance:

| Cell | FR | Expected | Pass criterion |
|---|---|---|---|
| `W-OK` | 16 | Transfer succeeds; withdrawal `completed`; wallet reduced by exactly the amount, once | Delta equals amount exactly; exactly one debit ledger entry |
| `W-FAILED` | 17 | `transfer.failed`; withdrawal `failed`; wallet untouched | Balance identical to before; no debit entry |
| `W-REVERSED` | 17 | `transfer.reversed`; withdrawal `failed`; wallet untouched | As above |
| `W-DUP-REQ` | 18 | Second identical request inside the 5-minute window refused (409) | Exactly one `salon_withdrawals` row; exactly one Paystack transfer |
| `W-DUP-EVT` | 21 | `transfer.success` delivered twice | Wallet debited exactly once; second delivery a no-op |
| `W-OVER` | 19 | Amount above settled/available refused with an actionable reason | 4xx with a reason string; no withdrawal row; no transfer |
| `W-FLOOR` | 19 | Amount above Paystack's live platform balance refused | 4xx; no transfer |
| `W-OTP` | 20 | Paystack holds for OTP → `awaiting_otp` | Not shown to the salon as completed/failed, and not an unexplained stuck item — assessed against the salon-facing Payouts view, not the DB value alone |

`W-OTP` cannot be forced on demand in Paystack test mode; if it cannot be triggered honestly it is recorded `n/a` with the reason, and the verdict states FR-20 is unevidenced — never marked pass by inference. `W-OVER`'s fixture constructs a wallet whose raw balance exceeds its settled availability directly, rather than depending on real settlement timing.

## Traceability (design 14.6)

`payments-e2e.cells.json` carries `requirement_ids` per cell; `render-results.ts` emits a requirement-coverage table so the verdict can be read against FR-6…FR-26. Any requirement with no passing cell is listed explicitly as unevidenced — never marked pass by inference.

## Edge cases (design section 15)

- **Currency mismatch** (FR-14): a payment attempt whose currency differs from `tenants.currency` is refused. One cell per currency.
- **Already-settled booking** (FR-15): session creation for a `fully_paid`/`refunded_full` appointment returns 409.
- **Split-payment bookings:** the BOOK success path can insert a second `transactions` row for a purse/split portion — the exactly-once assertion expects the correct count for the fixture's shape, not a blanket 1.
- **Guest vs. authenticated checkout:** `appointment_payment` needs no bearer token; every other intent does. An intent that succeeds unauthenticated when it shouldn't is a security finding, not a passing cell.
- **`SUBACCOUNT_SPLIT_ENABLED`:** currently `false`; every cell runs with it off, and the harness asserts and records the flag's value at run start so a future reader knows which path the verdict covers.
- **Out-of-order delivery:** `transfer.success` arriving before `process-salon-withdrawal` has committed its row — one cell; if the processor can't find the withdrawal, the observed behaviour is recorded as a finding.
- **Multi-appointment sessions:** one BOOK-OK cell uses two appointments to cover server-side amount summation and per-appointment update.
- **Zero/negative balance:** a session for an appointment with no outstanding balance is refused (FR-15 adjacent).
- **Pending-then-processed refunds** (C-2): a Paystack refund `pending` at request time, `processed` later — the product records optimistically and never reconciles; recorded as a finding under REF-c.

## Execution status

**No scenario cell in this matrix has been executed as of this writing.** See the implementer report accompanying this run for why, and for exactly which environment inputs are required before execution can proceed. `docs/test-plans/payments-e2e.results.md`, once rendered, lists every cell's real status — `not-run` for anything no evidence record exists for. This test plan and the cell manifest are complete and committed independently of execution (PRD AC-1); they do not change when execution eventually happens, only the evidence and results files do.
