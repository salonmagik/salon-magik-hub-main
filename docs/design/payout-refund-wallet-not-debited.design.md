# References

- Backlog item: `docs/backlog-open-followups.md` → `payout-refund-wallet-not-debited` (line 224), on branch `feat/second-owner-foundation`
- Verdict: `docs/test-plans/payments-e2e.verdict.md` section (a), same branch
- **Pre-existing design for the same defect:** `docs/design/refund-card-clawback-safeguard.design.md` (commit `ffc1740`, branch `feat/refund-card-clawback-safeguard`)
- Pre-existing briefs for that work: `docs/prd/refund-card-clawback-safeguard.prd.md`, `docs/research/2026-09-06-refund-clawback-safeguard.md`
- Related backlog item, same defect from the UI side: `refund-card-safeguard` (line 3)
- Deliberately **not** in scope: `payments-e2e-refund-webhook-unhandled` (line 243) — see *Forward compatibility* below

This document covers the *how* only. The defect, its confirmation evidence and its impact live in the backlog item and the verdict and are not restated.

---

# Summary of what this design changes

The dispatch asked for a design that adds a wallet debit to `complete_transaction_refund` and settles what happens when the wallet cannot absorb it. **That design already exists, is implemented, tested and committed** — on an unmerged branch nobody in this run was looking at. The bulk of this document is therefore an adoption plan, not a new architecture.

Three things were nevertheless found wrong or missing in that existing work, and this design fixes them:

1. **The debit amount is wrong** (`AD-N1`). It debits the *gross* refund amount, but the wallet was only ever credited *net* of the platform fee. With the default 0.5% fee, a full refund of the only payment in a wallet is short by 0.5% and is **blocked every time**. Adopted as-is, the existing fix would leave `PAY-BOOK-REF-b-GHS/NGN` failing for a second, different reason.
2. **The named verification signal does not work as the dispatch assumed** (`AD-N2`). The `REF-b` cell calls `complete_transaction_refund` directly and asserts the RPC itself debits. The chosen architecture deliberately forbids that. The cell must be updated or it stays red after a correct fix.
3. **The fix and its verification harness are on two different unmerged branches**, and the current checkout is on a third (`main`) that has neither (`AD-N3`).

---

# Corrections to the dispatch's premises

Recorded because implementer will otherwise look for things that are not there.

- **`refund-cancelled-appointment` does not go through `complete_transaction_refund`.** It writes its own `transactions` / `refund_requests` rows directly and it *already* debits the salon wallet via `debit_salon_purse` (`supabase/functions/refund-cancelled-appointment/index.ts:199`, idempotency key `refund_salon_debit_<appointment_id>`). It is **not** "affected identically" — it is the one path that got this right, and the existing design explicitly took it as the house pattern. It does carry two lesser defects of its own, folded in below.
- **The payments-e2e harness is not in the working tree.** It exists only on `feat/second-owner-foundation`. So does the backlog file `conductor-run` points at, and the verdict.
- **The "what if the wallet can't absorb it" question was already settled**, on 2026-09-08, as *block the refund and record the block* — reached by a route the dispatch did not consider (debit **before** the external effect, so there is nothing irreversible to unwind). See `AD-N4`.

---

# Architecture Decisions

## AD-N0. Adopt `ffc1740` rather than design and build a second fix

**Decision.** The deliverable is the existing commit `ffc1740` ("feat: gate refund destinations on salon-wallet recoverability"), replayed onto the pipeline's working branch, plus the corrections in `AD-N1`–`AD-N3`. No parallel implementation is written.

**Reasoning.** `ffc1740` is a complete, reviewed-quality implementation of exactly this defect: 4 migrations, an enforcement RPC, a non-bypassable guard on `complete_transaction_refund`, a 398-line SQL test suite, executing Deno tests for both edge functions, salon-admin dialog changes and a backoffice blocked-refunds panel — 3,737 insertions across 26 files, with its own PRD, Technical Brief and ADR. Building a second fix would duplicate all of it, and would leave two competing definitions of "can this wallet afford it" in a codebase whose entire bug class here is exactly that kind of divergence.

The lineage makes this cheap: `ffc1740`'s parent (`1303a6c`) is an ancestor of `feat/second-owner-foundation`, so the commit replays onto it directly. Its migrations (`20260907090000`–`090400`) also sit strictly between that branch's `20260906180800` and `20260908063000`, and nothing on that branch redefines `complete_transaction_refund`, `debit_salon_purse`, `credit_salon_purse` or `create_wallet_reversal` after them. There is no functional conflict to resolve — only the migration *ordering* question in `AD-N3`.

**Rejected alternatives.**
- *Design a fresh minimal fix (add a debit inside `complete_transaction_refund`).* This is what the dispatch implies, and it is wrong for the card path: `refund-via-paystack` calls Paystack **before** the RPC (`index.ts:86` then `:111`), so by the time the RPC could refuse, the customer has already been paid. The file's own comment says as much. A debit placed there can only ever allow a negative balance — it cannot protect anything.
- *Cherry-pick only the SQL and drop the UI.* The dialog still offers "refund to card" on a wallet that cannot fund it; the user-visible outcome becomes a raw error at submit. The backlog's `refund-card-safeguard` item stays open for no saving.

## AD-N1. Debit what the wallet was actually credited, derived from the ledger — never the gross refund amount

**Decision.** Replace `debit_salon_wallet_for_refund`'s use of `p_amount` as the debit amount with a computed figure from a new helper `public.refund_wallet_debit_amount(p_transaction_id uuid, p_amount numeric) returns numeric`, which returns the salon's *actual* share of the refunded portion:

```
credited  := sum of salon-wallet credit entries attributable to this transaction
already   := net of debits already taken against this transaction (debits are
             negative; their reversals are added back)
debit     := round(credited * (p_amount / transaction.amount), 2)
             -- except when p_amount settles the full remaining refundable
             -- balance, in which case debit := credited + already exactly
debit     := least(debit, credited + already)     -- never exceed what remains
```

Attribution of credits to a transaction:
- gateway-funded: `wallet_ledger_entries.gateway_reference = transactions.provider_reference`, `entry_type in ('salon_purse_credit_booking','salon_purse_credit_invoice')` — an exact, per-transaction match;
- purse-funded with a cashable redemption: `reference_type = 'appointment'`, `reference_id = transactions.appointment_id`, `gateway_reference is null` — the credit `settle_customer_balance_reservation` posts on completion (`20260725000002...sql:818`).

`credited = 0` therefore means "the salon was never given this money", and the debit is skipped with `ok:true, ledger_entry_id:null`.

**Reasoning.** The wallet is credited `actualServiceAmount × (1 − platform_percentage_charge/100)`, not the transaction amount (`payment-webhook-processor.ts:640`, and identically for invoices at `:795`). The `transactions` row records the gross. Debiting the gross therefore takes from the salon a platform fee it never received, and — because that fee is exactly what is missing from the balance — turns every full refund of a lone payment into a block. The e2e fixture is the proof: a 100.00 payment at the default 0.5% credits **99.50**, and `99.50 < 100.00` trips `INSUFFICIENT_RECOVERABLE_FUNDS` with a 0.50 shortfall. The existing SQL tests never caught this because they seed `salon_wallets.balance` directly (300, debit 100) instead of driving a real `charge.success`.

Deriving from the ledger rather than recomputing `amount × (1 − fee)` is deliberate: `tenants.platform_percentage_charge` is mutable, so recomputing would use today's fee against a payment credited under yesterday's. The ledger is the only record of what was actually credited. It also handles, correctly and for free, the case where the credit never landed at all — `credit_salon_purse` failures in the webhook processor are swallowed with `console.error` and never retried (`:656`), so a `transactions` row with no matching wallet credit is a reachable state, and the right debit for it is zero rather than a spurious block.

Making the final tranche absorb the rounding remainder guarantees that a fully-refunded transaction returns the wallet to exactly its pre-credit position, with no 0.01 residue accumulating across partial refunds.

**Rejected alternatives.**
- *Debit gross, let the salon absorb the platform fee.* Takes money the salon never held; the block it causes is not a real insufficiency.
- *Debit gross, and credit the platform fee back separately.* Two entries where one is correct, and it still blocks whenever the wallet holds exactly the net credit.
- *Recompute from `tenants.platform_percentage_charge`.* Wrong whenever the fee has changed since the payment, and silently so.

## AD-N2. The proof-of-debit check validates a stamped gross amount, not `-p_amount`

**Decision.** `debit_salon_wallet_for_refund` stamps the ledger row it creates with `metadata = metadata || jsonb_build_object('refund_gross_amount', p_amount)` immediately after `debit_salon_purse` returns (same transaction, one `update`). `complete_transaction_refund`'s guard replaces its `v_debit.amount <> -p_amount` test with `(v_debit.metadata->>'refund_gross_amount')::numeric <> p_amount`, keeping every other check (tenant, `entry_type`, currency, `reference_id`, not-already-claimed) unchanged.

**Reasoning.** `AD-N1` breaks the identity `debit amount = refund amount` that the existing guard relies on (`20260907090300...sql:116`). The guard cannot simply recompute the expected debit, because by the time it runs the debit has already committed and `already` has moved — recomputation would disagree with itself. Stamping the gross amount the debit was taken *for* keeps the link exact and one lookup cheap, and keeps the amount check as strong as before: a debit taken for a 40.00 refund still cannot back a 100.00 one.

Stamping in `debit_salon_wallet_for_refund` rather than threading a metadata parameter through `debit_salon_purse` keeps that shared primitive — used by withdrawals and credit purchases — untouched.

**Rejected alternative.** *Drop the amount check to `-v_debit.amount <= p_amount`.* Permits a 0.01 debit to authorise a full refund. The check exists precisely to stop that.

## AD-N3. Renumber the four adopted migrations to land after the target branch's latest

**Decision.** On replay, rename `20260907090000`–`20260907090400` to fresh `20260915…` timestamps, preserving their relative order, and add the `AD-N1`/`AD-N2` changes as a fifth migration in the same series rather than editing the four in place.

**Reasoning.** `feat/second-owner-foundation` already carries migrations through `20260914120000`, and any environment tracking that branch has them applied. Pushing a lower-numbered migration into such a database is the out-of-order case `supabase db push` will skip without `--include-all`, which would leave dev and prod silently missing the fix while local (pushed from empty) has it — the worst possible split. Renumbering forward makes the push ordinary on every environment, which matters because CI deploys prod with `db push` and a failing push is a bug, not a flag to add.

Keeping `AD-N1`/`AD-N2` as a separate follow-on migration rather than editing the adopted four preserves `ffc1740` as a readable, attributable unit and keeps the correction visible in history as a correction.

## AD-N4. Insufficient balance blocks the refund — confirmed, not re-decided

**Decision.** Adopt the existing answer: the refund is refused, the wallet and all bookkeeping are left untouched, and the attempt is recorded in `refund_block_events` with tenant, transaction, amount, balance-at-attempt and shortfall. Negative balances are not permitted on any in-product path. Cash/transfer (`offline`) remains ungated, so a refusal never leaves staff with no route.

**Reasoning.** The dispatch framed this as an open choice between a negative balance, an arrears record and blocking, on the premise that "the money may already have been withdrawn, so the debit can drive the balance negative or fail". That premise only holds if the debit is attempted *after* the external effect. The existing design removes the premise instead of answering it: every in-product refund path takes the committed wallet debit **before** the irreversible step, so a refusal costs nothing and there is never an un-funded refund to account for. Recording the block by return value rather than by raising is what makes the record survive — Supabase has no autonomous transactions, so raising would roll back the very row that documents the block.

The interaction with the withdrawal guard the dispatch asked about resolves itself. `debit_salon_purse` and `debit_salon_purse_for_withdrawal` both take `salon_wallets FOR UPDATE`, so a refund and a withdrawal racing on one wallet serialise and exactly one wins. `get_salon_wallet_availability` needs no change: it derives `pending` from unsettled *credit* entries and clamps it with `least(pending, balance)`, so a debit that shrinks the balance correctly shrinks the withdrawable figure with it.

An arrears/clawback ledger was considered and is unnecessary for the same reason: with debit-before-effect there is no shortfall to carry. It becomes necessary only for out-of-band refunds, which is why the seam below is worth leaving open.

## AD-N5. Leave an explicit seam for out-of-band (Paystack-initiated) refunds — do not implement it

**Decision.** Add a final parameter `p_allow_negative boolean default false` to `debit_salon_wallet_for_refund`. When true, an insufficient balance takes the debit anyway, driving `salon_wallets.balance` negative, writes the normal `salon_purse_debit_refund` ledger row, **and still** records a `refund_block_events` row (as the arrears record) with the shortfall. No caller passes `true` in this change.

**Reasoning.** The dispatch asked that this design not conflict with `payments-e2e-refund-webhook-unhandled`. It would conflict without this. A refund raised in the Paystack dashboard arrives as a `refund.processed` webhook *after* the money has gone — the one path where `AD-N4`'s debit-before-effect ordering cannot hold and blocking is not an available answer. Adding the parameter now costs one branch in one function and means the future handler is a caller, not a re-architecture of the enforcement point. Leaving it out would force whoever implements that handler either to bypass the enforcement RPC (recreating the divergence this whole design exists to close) or to change its contract under a live caller.

`salon_wallets.balance` has no non-negative `CHECK` constraint, so negative balances are already representable, and `get_salon_wallet_availability` already yields `available = 0` for them via its `greatest(0, …)`.

**Rejected alternative.** *Design the out-of-band handler here.* Explicitly out of scope per the dispatch, and it needs its own decisions (recovery policy for a negative balance, whether withdrawals are frozen while in arrears) that belong with that item.

## AD-N6. Two adjacent defects in `refund-cancelled-appointment`, folded in

Both are in a file this design already modifies (`AD-N0` swaps its `debit_salon_purse` call for `debit_salon_wallet_for_refund`), both are code failing its own stated intent, and neither is a separate backlog item — so both are fixed here rather than deferred.

1. **Gross over-debit.** It debits `refundAmount` (gross) for the same reason and with the same consequence as `AD-N1`. Fixed by the switch to `debit_salon_wallet_for_refund`, which now computes the amount itself.
2. **Per-appointment idempotency key silently swallows a second refund.** The key is `refund_salon_debit_<appointment_id>` (`index.ts:196`). `debit_salon_purse` returns the *existing* entry for a repeated key, so a second partial refund on the same appointment returns `ok` having debited nothing, and the customer is credited twice against one debit. Fixed by keying on the refund being taken, not the appointment: `refund_salon_debit_<appointment_id>_<refund_request_id>`, consistent with the scheme `refund-via-paystack` uses. Retry idempotency is preserved because the key is still stable per refund.

---

# Components

**Database — adopted unchanged from `ffc1740`**
- `public.refund_block_events` — table (also the arrears record under `AD-N5`).
- `public.check_refund_recoverability(uuid)` — advisory read for the dialog.
- `public.reverse_refund_wallet_debit(...)` — compensating credit when Paystack fails after the debit committed.
- `public.get_backoffice_blocked_refunds(int, int)` — platform-staff read.
- `public.refund_requests.wallet_debit_entry_id` — new column.

**Database — adopted and then corrected here**
- `public.refund_wallet_debit_amount(uuid, numeric)` — **new** (`AD-N1`).
- `public.debit_salon_wallet_for_refund(...)` — amount now computed, not `p_amount`; stamps `refund_gross_amount`; gains `p_allow_negative` (`AD-N1`, `AD-N2`, `AD-N5`).
- `public.complete_transaction_refund(...)` — adopted guard, with the amount check re-pointed at the stamped metadata (`AD-N2`).

**Edge functions**
- `supabase/functions/refund-via-paystack/index.ts` — adopted: generalised to all refund types, owns the debit-before-effect ordering, keeps its historical name/URL.
- `supabase/functions/refund-cancelled-appointment/index.ts` — adopted, plus `AD-N6`.

**Frontend** — adopted unchanged: `RequestRefundDialog.tsx`, `useRefunds.tsx` (salon-admin); `useBlockedRefunds.tsx`, `TransactionsPage.tsx`, `BackofficeLayout.tsx` (backoffice).

**Tests**
- `supabase/tests/refund_clawback.sql` — adopted, plus new net-credit cases (`AD-N1`).
- `supabase/functions/_shared/payments-e2e/refund.integration.test.ts` — REF-b rewritten (`AD-N2`).

**Explicitly unchanged:** `credit_salon_purse`, `debit_salon_purse`, `debit_salon_purse_for_withdrawal`, `create_wallet_reversal`, `get_salon_wallet_availability`, `payment-webhook-processor.ts`, `process-salon-withdrawal`, `request_transaction_refund`, `reject_transaction_refund`.

---

# Data Flow

In-product refund, all types, single ordering:

1. Dialog opens → `check_refund_recoverability(transaction_id)` → tiles enabled/disabled, `offline` always enabled.
2. Staff submits → `refund-via-paystack` (service role).
3. Function calls `debit_salon_wallet_for_refund(transaction, gross_amount, type, reason, actor, idempotency_key, request_id, appointment_id)`.
   - `refund_wallet_debit_amount` computes the salon's actual share.
   - Share is `0` → `{ok:true, ledger_entry_id:null}`, nothing debited.
   - Share `> balance` → `refund_block_events` row committed, `{ok:false, code:'INSUFFICIENT_RECOVERABLE_FUNDS', shortfall}` returned; function stops and returns a typed error. **Nothing else has happened.**
   - Otherwise → `debit_salon_purse` debits, ledger row stamped with `refund_gross_amount`, `{ok:true, ledger_entry_id}`.
4. Only now the irreversible step: Paystack `/refund` for `paystack`; nothing external for `store_credit`/`offline`.
5. If step 4 fails → `reverse_refund_wallet_debit` posts a compensating `salon_purse_reversal`; the error is returned; the books are square.
6. `complete_transaction_refund(..., p_wallet_debit_entry_id)` records the refund transaction, completes the request (storing `wallet_debit_entry_id`), adjusts customer balance and appointment, writes the audit event. It raises rather than record anything if the proof is absent, mismatched, or already claimed by another refund.

Cancellation refund (`refund-cancelled-appointment`) follows the same 3→4→6 shape with `store_credit` and a customer-purse credit as step 4.

---

# Database Changes

Five migrations, in order. The first four are `ffc1740`'s, renumbered per `AD-N3`; the fifth is new.

| # | Content |
|---|---|
| 1 | `refund_block_events` table + indexes (`tenant_id`, `created_at desc`, partial on unresolved) |
| 2 | `check_refund_recoverability`, `debit_salon_wallet_for_refund`, `reverse_refund_wallet_debit` |
| 3 | `refund_requests.wallet_debit_entry_id uuid` + unique index (one refund per debit entry) |
| 4 | `complete_transaction_refund` guard (`p_wallet_debit_entry_id`) |
| 5 | **New:** `refund_wallet_debit_amount`; `debit_salon_wallet_for_refund` replaced (computed amount, metadata stamp, `p_allow_negative`); `complete_transaction_refund` guard's amount check re-pointed at `refund_gross_amount` |

No backfill. Existing completed refunds are not retro-debited: the money is gone and inventing ledger entries for it would make the ledger less truthful, not more. The blocked-refund panel starts empty by construction.

Indexes required by migration 5's lookups — add if not already present:
- `wallet_ledger_entries (tenant_id, gateway_reference)` — credit attribution for gateway-funded transactions.
- `wallet_ledger_entries (tenant_id, reference_type, reference_id)` — credit attribution for purse redemptions, and the already-debited sum.

---

# Validation

- `refund_wallet_debit_amount` returns `>= 0` always; `0` is a valid, non-error answer.
- The computed debit never exceeds `credited + already` — total debits for a transaction can never exceed total credits for it, in any sequence of partial refunds.
- Refund amount against remaining refundable is unchanged (existing `v_reserved` / `v_remaining` check).
- Proof-of-debit: right tenant, `entry_type = 'salon_purse_debit_refund'`, `reference_id = transaction`, matching currency, `refund_gross_amount = p_amount`, not already on another `refund_requests` row.
- Currency mismatch between wallet and transaction raises (a fault, not a block).

---

# Error Handling

| Condition | Behaviour |
|---|---|
| Insufficient recoverable funds | `{ok:false}` + committed `refund_block_events` row; typed error to the dialog; nothing else mutated |
| Paystack declines | Debit reversed via `reverse_refund_wallet_debit`; Paystack's own message surfaced |
| `complete_transaction_refund` fails after Paystack succeeded | Unchanged: logged `CRITICAL`, flagged for manual reconciliation. The debit has already committed, so the wallet is correct even in this state |
| Missing wallet / currency mismatch / unauthorised | `raise` — genuine faults, must roll back |
| Duplicate or retried refund | Same idempotency key → existing ledger entry returned, no second debit; guard's not-already-claimed check stops a second refund reusing one debit |

---

# Security Considerations

- `debit_salon_wallet_for_refund` and `reverse_refund_wallet_debit` are `revoke … from public, anon, authenticated` / `grant … to service_role` — reachable only from edge functions holding the service key, never over PostgREST.
- `complete_transaction_refund` stays `authenticated`-callable and keeps its owner/manager check, but is no longer *useful* to a direct caller for wallet-drawing refunds: without a real, unclaimed ledger row it raises. This is what closes the browser bypass.
- `check_refund_recoverability` is owner/manager-gated and read-only; it leaks only the caller's own wallet balance.
- `get_backoffice_blocked_refunds` is backoffice-staff gated.
- `refund_gross_amount` is written by a `security definer` function into a table with no client write path, so it cannot be forged by a caller.

---

# Performance Considerations

- `refund_wallet_debit_amount` runs two indexed aggregates over `wallet_ledger_entries`, both scoped by `tenant_id` and an equality on `gateway_reference` or `(reference_type, reference_id)` — bounded by the entries for one transaction, typically one to three rows. Both indexes are listed above; without them these degrade to a per-tenant scan on the highest-volume table in the schema, so they are not optional.
- The whole refund runs inside one `salon_wallets` row lock. It is held across `debit_salon_purse` only — **not** across the Paystack HTTP call, which happens in the edge function after the debit transaction has committed. Holding a row lock across a network round-trip to Paystack would serialise every refund for a tenant behind an external timeout; the ordering in *Data Flow* exists partly to avoid that.
- The backoffice panel aggregates over `refund_block_events`, a low-volume table with a `numeric` amount column, so "loss avoided" is one indexed aggregate rather than a JSON cast over the audit log.
- The dialog performs exactly one recoverability read on open and recomputes locally as the amount changes — no per-keystroke query.
- No N+1: every lookup here is by a known key, and the blocked-refunds list is paginated in the query (`get_backoffice_blocked_refunds(limit, offset)`).

---

# Compatibility

- `complete_transaction_refund` gains a defaulted parameter, so existing 5-argument callers still resolve. They will now *raise* for wallet-drawing refunds — intentional (`AD-N0`, and the reason the REF-b cell must change). Offline and purse-funded refunds continue to work unchanged from any caller.
- `refund-via-paystack` keeps its name, URL and request shape; `refundType` is additive. The deployed old version is replaced rather than left alongside, so there is no window in which an unguarded endpoint stays callable.
- No data migration, no deprecation window, no backfill.
- Rollout is a single deploy: migrations, then edge functions, then frontend. The guard is only enforceable once the edge functions are deployed to supply the proof, so deploying migrations *without* the functions would block every wallet-drawing refund. These go out together.

---

# Edge Cases

1. **Full refund of a lone payment at a non-zero platform fee** — the case that breaks the unadopted version. 100.00 gross, 99.50 credited, 99.50 debited, wallet to 0.00, no block.
2. **Platform fee is zero** — `credited = gross`, debit equals the refund amount; behaviour identical to the unadopted version.
3. **Fee changed between payment and refund** — ledger-derived, so the original fee applies. Correct.
4. **Credit never landed** (swallowed `credit_salon_purse` error) — `credited = 0`, no debit, no block, refund proceeds.
5. **Repeated partial refunds** — each debits its pro-rata share; the tranche that settles the remaining refundable balance absorbs the rounding remainder, so the total debited equals the total credited exactly.
6. **Split payment (purse portion + card portion on one appointment)** — two transactions; the gateway credit attributes to the card one by `gateway_reference`, the redemption credit to the purse one by `appointment_id` with a null `gateway_reference`. No double counting.
7. **Purse-funded booking, appointment not yet completed** — no redemption credit exists, `credited = 0`, nothing debited; the customer's reserved balance is returned by the existing `refund_customer_balance_reservation` path.
8. **Offline refund** — never requires a debit, never blocked, always available.
9. **Wallet exactly equal to the debit** — succeeds, balance 0.00 (covered by existing SQL test 3).
10. **Refund racing a withdrawal** — serialised on the `salon_wallets` row lock; exactly one succeeds.
11. **Retried refund / duplicate delivery** — idempotency key returns the existing entry; no second debit.
12. **Second refund attempting to reuse one debit entry** — rejected by the unique index and the guard's not-already-claimed check.
13. **Paystack succeeds, RPC then fails** — wallet already correctly debited; flagged for reconciliation.
14. **Out-of-band Paystack refund** — arrives on an unhandled webhook path today; no wallet effect at all. Unchanged by this design, seam left per `AD-N5`.

---

# Tests Required

**SQL (`supabase/tests/refund_clawback.sql`)** — adopted 9 tests, plus new:
- 10: transaction credited net of a 0.5% fee; full refund debits exactly the net and does not block. *(The regression test for `AD-N1` — this is the case the existing suite's directly-seeded balances cannot reach.)*
- 11: two partial refunds summing to the full amount debit exactly the total credited, no rounding residue.
- 12: transaction with no wallet credit at all → no debit, no block, refund completes.
- 13: `refund_gross_amount` mismatch is rejected by the guard.
- 14: `p_allow_negative := true` debits past zero, leaves a negative balance, and still records a block event.

**Deno unit** — adopted tests for both edge functions; extend `refund-cancelled-appointment`'s for the `AD-N6` idempotency-key change (two partial refunds on one appointment each take their own debit).

**Frontend** — adopted `RequestRefundDialog`, `useRefunds`, `useBlockedRefunds`, `BackofficeLayout` tests.

**payments-e2e** — REF-b rewritten per `AD-N2`: seed and deliver `charge.success` exactly as now (wallet 99.50), then take the debit through `debit_salon_wallet_for_refund` with the service-role client and pass the returned `ledger_entry_id` to `complete_transaction_refund`. Assert no error and wallet `99.50 → 0.00`. This keeps the cell Paystack-free and keeps its identity ("does completing a refund debit the salon wallet"), while testing the architecture that actually exists. The cell's header comment and its `note` strings, which currently assert C-3 as expected-to-fail, must be rewritten with it — a cell that passes while its note says the defect is confirmed is worse than a failing one.

The blocked path needs no new e2e cell: SQL tests 2 and 10–14 cover it with far less machinery.

---

# Verification

Run from the repository root, on the branch chosen in step 1, with the local stack up. `supabase/functions/.env` currently points at the **dev** project — override in-shell, never by editing that file:

```
supabase start
supabase db push                      # never db reset
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')
export SUPABASE_ANON_KEY=$(supabase status -o json | jq -r '.ANON_KEY')

psql "$(supabase status -o json | jq -r '.DB_URL')" -v ON_ERROR_STOP=1 -f supabase/tests/refund_clawback.sql
psql "$(supabase status -o json | jq -r '.DB_URL')" -v ON_ERROR_STOP=1 -f supabase/tests/customer_value_flows.sql

deno test -A --no-check supabase/functions/refund-via-paystack/index.test.ts
deno test -A --no-check supabase/functions/refund-cancelled-appointment/index.test.ts

export PAYMENTS_E2E_ACK=i-am-not-on-production
export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<prod ref, per the payments-e2e implementer report>
deno test -A --no-check supabase/functions/_shared/payments-e2e/refund.integration.test.ts

npm test -w apps/salon-admin
npm test -w apps/backoffice
```

**Acceptance signal:** `PAY-BOOK-REF-b-GHS` and `PAY-BOOK-REF-b-NGN` record `pass` in `docs/test-plans/payments-e2e.evidence.jsonl` with `before.balance = 99.5`, `after.balance = 0`. Re-render `docs/test-plans/payments-e2e.results.md` and update `docs/test-plans/payments-e2e.verdict.md` section (a).

**Not to be run in this change:** the dev-project `supabase db push` and `supabase functions deploy`. That step trips this environment's auto-mode classifier as a production deploy and is awaiting the user's explicit authorization. Verify locally, and report the dev deploy as outstanding rather than routing around the denial. Never point any of this at prod.

---

# Implementation Order

1. **Settle the branch.** The working tree is on `main`, which has neither the backlog, the harness, the verdict, nor the fix — it is 450 commits behind `feat/second-owner-foundation`, the branch every artifact in this run belongs to, and the drift came from a manual checkout outside the pipeline (reflog `HEAD@{1}`). Move to `feat/second-owner-foundation` (or a topic branch off it) before anything else. The untracked design docs in the working tree carry across a checkout safely. **If that branch is in use by another pane, stop and confirm rather than switching under it** — memory records that this repo is shared.
2. Replay `ffc1740` onto that branch (`git cherry-pick ffc1740`, or apply the 26 files). Expect conflicts only where the subscription-lifecycle and co-owner work touched the same frontend files; the SQL should apply clean.
3. Renumber migrations `20260907090000`–`090400` to `20260915…`, preserving order (`AD-N3`).
4. Add migration 5: `refund_wallet_debit_amount`, the revised `debit_salon_wallet_for_refund`, the re-pointed guard check, and the two `wallet_ledger_entries` indexes (`AD-N1`, `AD-N2`, `AD-N5`).
5. Apply `AD-N6` to `refund-cancelled-appointment`: route through `debit_salon_wallet_for_refund`, change the idempotency key to include the refund request id.
6. `supabase db push` locally. A failure here is a bug to fix in place — not a reason to reset.
7. Add SQL tests 10–14; run the full SQL suite.
8. Run the Deno edge-function tests; extend `refund-cancelled-appointment`'s for step 5.
9. Rewrite REF-b in `refund.integration.test.ts` per `AD-N2`, including its header comment and `note` strings.
10. Run the payments-e2e refund suite against the local stack; confirm both REF-b cells flip to `pass`.
11. Run the salon-admin and backoffice test suites.
12. Re-render `payments-e2e.results.md`; update `payments-e2e.verdict.md` section (a).
13. Update `docs/backlog-open-followups.md`: close `payout-refund-wallet-not-debited` **and** `refund-card-safeguard` — they are the same defect and this change resolves both. Leave `payments-e2e-refund-webhook-unhandled` open, noting the `p_allow_negative` seam.
14. Report the dev-project push/deploy as outstanding and awaiting authorization.

---

# Open Questions

**Q: Should the four adopted migrations be renumbered, or pushed with `--include-all`?** → **A: Renumbered** *(decided autonomously)*. Both work; renumbering keeps `db push` ordinary on every environment including the CI prod deploy, at the cost of diverging four filenames from `ffc1740`. Reversible if the branch's own migration history is rewritten before merge.

**Q: Should the 0.5% platform fee retained on a refunded payment be returned to the customer by Salon Magik, or kept?** → **A: Out of scope; unchanged by this design** *(decided autonomously)*. This design makes the *salon* whole — it is debited exactly what it was credited, never more. Whether Salon Magik refunds its own fee on top is a commercial decision affecting the platform's books, not the salon wallet, and nothing here forecloses either answer. Flagged because `AD-N1` is the first place the question becomes visible.

**Q: Does `feat/second-owner-foundation` remain the pipeline's working branch, given the checkout has drifted to `main`?** → Genuinely unresolved; see implementation step 1. Every artifact this run depends on lives on that branch, so the design assumes it, but the drift was a human action and confirming is cheaper than guessing wrong.

**Deferred, not fixed here:** `get_salon_wallet_availability` computes `pending := least(pending, balance)` without a lower clamp, so a negative balance reports a negative `pending` — cosmetically wrong in the payouts UI. Unreachable until `AD-N5`'s seam has a caller, and in a function this design does not otherwise touch, so it is recorded rather than folded in.
