# Original Request

> ...that has already withdrawn those funds leaves Salon Magik absorbing the refund with no way to claw it back. Investigate what actually determines recoverability - Paystack settlement/refund state, the withdrawal ledger, and how gateway funds are marked withdrawable (see supabase/functions/_shared/payment-webhook-processor.ts around line 634) - and what the refund paths currently do: supabase/functions/refund-via-paystack and supabase/functions/refund-cancelled-appointment. The safeguard must be backend-enforced, not just UI gating.

---

# Summary

Recoverability is determined entirely by `salon_wallets.balance`, a per-tenant internal ledger Salon Magik maintains itself — not by anything Paystack reports about settlement state. A booking payment credits this wallet in full at webhook time (`credit_salon_purse`), and a withdrawal debits it (`debit_salon_purse_for_withdrawal`). `debit_salon_purse` (the generic debit RPC) enforces `balance >= amount` before allowing any debit, which is the only backend mechanism anywhere in the codebase that can tell whether a salon has already pulled the money out.

`refund-cancelled-appointment` uses this mechanism correctly: it calls `debit_salon_purse` first and fails loudly (`Insufficient wallet balance`) if the salon already withdrew the funds, before ever crediting the customer.

`refund-via-paystack` does not use this mechanism at all. It calls Paystack's `/refund` API directly (pulling money back from Salon Magik's own Paystack settlement balance) and then calls `complete_transaction_refund`, an RPC that only writes `transactions`/`refund_requests` rows and adjusts `appointments.amount_paid` — it never touches `salon_wallets`. There is no check, anywhere in this path, of whether the salon's wallet still holds the refunded amount. If the salon already withdrew it, Paystack still debits Salon Magik's settlement balance for the refund, and nothing claws that amount back from the salon. This is a real, currently-open gap, not a hypothetical.

---

# Current Behaviour

## How funds become withdrawable (credit side)

`payment-webhook-processor.ts:626-664`, case `booking_payment` (or similar), on a completed Paystack charge:
- `actualServiceAmount` (the gateway-paid amount) is credited to the tenant's `salon_wallets.balance` via `credit_salon_purse`, net of `platform_percentage_charge`.
- Comment at line 634 confirms the model explicitly: *"Only gateway funds become immediately withdrawable... every booking payment credits the internal wallet unconditionally, paid out via withdrawal request instead."*
- This credit is unconditional and immediate — it does not wait for Paystack settlement, and nothing in this path checks Paystack's real settlement/balance state (`getPaystackBalance`, `paystack-helpers.ts:352`, is only used by `process-salon-withdrawal` at withdrawal time, as a platform-wide sanity check against Paystack's live balance — not per-refund, not per-tenant).

## How funds leave the wallet (debit side / withdrawal)

- `debit_salon_purse_for_withdrawal` (created in `20260222120010_create_debit_salon_purse_for_withdrawal_rpc.sql`, currency-validated in `20260403235356_add_currency_validation_to_debit_salon_purse.sql`) is called from `process-salon-withdrawal` when a salon cashes out. It locks `salon_wallets`, checks `balance >= amount`, and debits it.
- Once withdrawn, `salon_wallets.balance` for that tenant is reduced accordingly — this is the only record of "has this salon already taken this money out."

## The generic debit guard: `debit_salon_purse`

`20260403235356_add_currency_validation_to_debit_salon_purse.sql:11-104` (current definition):
- Locks the tenant's `salon_wallets` row `FOR UPDATE`.
- Validates currency match.
- **`IF v_balance_before < p_amount THEN RAISE EXCEPTION 'Insufficient wallet balance...'`** — this is the backend enforcement point. Any caller of this RPC is protected against debiting more than the wallet currently holds.
- Idempotent via `p_idempotency_key` against `wallet_ledger_entries`.

## Refund path 1: `refund-cancelled-appointment/index.ts` — enforces the guard

Flow (lines 197-300):
1. Validates the appointment is cancelled, has a paid amount, and isn't already refunded (via `refund_requests`/`transactions` lookups).
2. **Step 1 (line 199-215): calls `debit_salon_purse` with `p_entry_type: "salon_purse_debit_refund"`, `p_amount: refundAmount`.** If the salon's wallet doesn't have enough balance (i.e. already withdrawn), this raises and the function returns a 500 before any customer credit happens.
3. Step 2: only after the debit succeeds, credits the customer's purse (`credit_customer_purse`) with the same amount — money moves salon wallet → customer wallet, both internal ledgers, so the books always balance.
4. Inserts a `refund` transaction and a completed `refund_requests` row, marks the appointment `refunded_full`.

This path never touches Paystack — it's a purely internal store-credit refund — so the "clawback" here is simply refusing the debit if the money isn't there.

## Refund path 2: `refund-via-paystack/index.ts` — does NOT enforce the guard

Flow (lines 27-138):
1. Auth check, loads the `transactions` row, confirms `provider === "paystack"` and a `provider_reference` exists.
2. **Calls Paystack's `POST /refund` directly** (line 88-99) with the full amount — this pulls funds from **Salon Magik's own Paystack settlement balance**, refunding the customer's card. Paystack does not know or care about this app's internal wallet accounting.
3. Only after Paystack confirms, calls `complete_transaction_refund` (RPC, `20260725000002_customer_value_and_refunds.sql:1092-1265`).
4. `complete_transaction_refund` (traced fully): row-locks the `transactions` row, checks caller is owner/manager, validates the refund amount against `v_reserved`/`v_remaining` (sum of other pending/approved/completed refund requests on the same transaction — prevents double-refunding the same payment), inserts a `refund` transaction, updates/inserts `refund_requests`, optionally credits customer balance if `refund_type` is `store_credit`, and adjusts `appointments.amount_paid`/`payment_status`.
5. **At no point does `complete_transaction_refund` reference `salon_wallets` or call `debit_salon_purse`.** It has no idea whether the tenant's wallet can absorb this refund. The comment in the edge function at line 104-106 explicitly acknowledges relying on Paystack's own error surface for settlement issues ("if the funds already settled to the salon, Paystack's own error message says so") — but Paystack's `/refund` endpoint does not fail based on *this app's* internal wallet balance; it only reflects Paystack-side settlement/refund window rules, which are unrelated to whether Salon Magik's own ledger shows the tenant already withdrew the money.

Net effect: a card refund can be approved and executed via Paystack while the tenant's `salon_wallets.balance` is $0 (already withdrawn), and the wallet is never debited — Salon Magik absorbs the loss with no ledger entry ever recording it, let alone recovering it.

## UI gating (confirmed present, confirmed insufficient on its own)

`RequestRefundDialog.tsx`: `canRefundViaPaystack` (line 82) gates the Paystack option to `mode === "complete" && !isApproval && transaction.provider === "paystack" && provider_reference` — a client-side condition only. No balance check exists in the UI either; it does not query `salon_wallets` before offering/allowing the Paystack refund option. This matches the request's premise that the current safeguard, such as it is, is UI-only (and in this case, doesn't even check balance in the UI — it's absent everywhere).

---

# Affected Surfaces

This step applies because a backend safeguard change would touch a contract other code depends on (`complete_transaction_refund` RPC signature/behaviour, and/or the `refund-via-paystack` edge function).

- **`supabase/functions/refund-via-paystack/index.ts`** — the only caller of Paystack's `/refund` API among refund paths that also calls `complete_transaction_refund`. Needs a change (the actual clawback/guard).
- **`apps/salon-admin/src/hooks/useRefunds.tsx`** (`approveRefund`, line 85) — calls `complete_transaction_refund` directly for the approval-queue path. Confirmed this path is only reachable for `store_credit`/`offline` refund types (`RequestRefundDialog.tsx` filters `paystack` out of the request/approval flow via `canRefundViaPaystack`'s `!isApproval` condition) — so it never triggers a real Paystack card refund and is not affected by a Paystack-specific clawback change. If `complete_transaction_refund`'s signature itself changes (e.g. to add wallet debit logic inline), this caller would need no changes since it doesn't pass any new params, but would inherit whatever new behavior is added — worth verifying at design time.
- **`apps/salon-admin/src/components/dialogs/RequestRefundDialog.tsx`** (lines 142-160) — calls `refund-via-paystack` for the direct-complete Paystack path. No contract change needed unless the edge function starts returning a new error shape that the dialog should surface distinctly (e.g. "salon already withdrew this money").
- **`refund-cancelled-appointment/index.ts`** — already implements the correct pattern; not a consumer that needs to change, but the reference implementation for how the guard should look if reused/extracted.
- **`complete_transaction_refund` RPC** — currently has no `security definer` interaction with `salon_wallets`. If the fix is placed inside this RPC (rather than only in the edge function), every caller of it (`refund-via-paystack`, `useRefunds.approveRefund`) inherits the change; since the approval-queue caller only ever passes non-Paystack refund types, adding a Paystack-specific wallet-debit branch there would be inert for it.

No frontend/other-service consumers outside this repo were found (`refund_type`, `complete_transaction_refund`, and `refund-via-paystack` are not referenced from `apps/client-portal` or other apps).

---

# Existing Implementation & Placement

**Existing implementation:** The clawback safeguard already exists, in `debit_salon_purse` + its use in `refund-cancelled-appointment`. It is not duplicated or approximated anywhere in `refund-via-paystack` — that path has zero equivalent check. This is a gap to close by extending the existing pattern to the Paystack path, not a greenfield feature.

**Correct home:** Backend, specifically either:
- inside `refund-via-paystack/index.ts`, calling `debit_salon_purse` (or a dedicated variant) against `salon_wallets` **before** calling Paystack's `/refund` API (mirroring `refund-cancelled-appointment`'s "debit first, external effect second" ordering used to keep failures cheap to unwind), or
- inside `complete_transaction_refund` itself, so every caller gets the guard uniformly.

Given `refund-via-paystack` calls Paystack *before* `complete_transaction_refund` runs (the RPC currently assumes the external refund already succeeded and is “bookkeeping-only” per its own comment, lines 120-122), placing the wallet-balance check in the RPC alone would be too late — Paystack would have already pulled the money by the time `complete_transaction_refund` could reject it. The check needs to happen in the edge function, before the Paystack API call, using the same `debit_salon_purse`-style locked-balance check (or a read-only pre-check plus the real debit at the same point `debit_salon_purse` already runs it inside `complete_transaction_refund`/a new step). This is an architectural/design decision for principal, not something to resolve here — but the constraint (ordering: verify/reserve wallet capacity before the irreversible Paystack call) is a verified fact, not a recommendation.

No `CLAUDE.md` or project doc states where this belongs; the placement conclusion above is derived entirely from the existing `refund-cancelled-appointment` pattern and the ordering of external vs. internal effects in `refund-via-paystack`.

---

# Execution Flow

Money-in (already-withdrawable determination):
```
Paystack webhook (charge.success)
    ↓ payment-webhook-processor.ts
credit_salon_purse (unconditional, full gateway amount net of platform fee)
    ↓
salon_wallets.balance += amount
```

Money-out (withdrawal, reduces recoverability):
```
process-salon-withdrawal
    ↓
debit_salon_purse_for_withdrawal (checks balance >= amount)
    ↓
salon_wallets.balance -= amount
```

Refund path with the guard (works correctly today):
```
refund-cancelled-appointment
    ↓
debit_salon_purse (checks balance >= amount) → salon_wallets.balance -= amount
    ↓ (only if debit succeeds)
credit_customer_purse
```

Refund path without the guard (the gap):
```
refund-via-paystack
    ↓
Paystack POST /refund  ← pulls from Salon Magik's Paystack settlement balance, unconditionally
    ↓ (always reached if Paystack accepts)
complete_transaction_refund  ← never touches salon_wallets
```

---

# Relevant Files

- `supabase/functions/_shared/payment-webhook-processor.ts` — establishes that gateway funds are credited to `salon_wallets` unconditionally and immediately (lines 626-664).
- `supabase/functions/refund-via-paystack/index.ts` — the refund path with the gap; calls Paystack directly, then `complete_transaction_refund`, with no wallet balance check.
- `supabase/functions/refund-cancelled-appointment/index.ts` — the reference implementation that already enforces the balance guard via `debit_salon_purse`.
- `supabase/migrations/20260725000002_customer_value_and_refunds.sql` — defines `complete_transaction_refund` (lines 1092-1265), confirmed it never references `salon_wallets`.
- `supabase/migrations/20260403235356_add_currency_validation_to_debit_salon_purse.sql` — current `debit_salon_purse` definition, the insufficient-balance guard (lines 58-60).
- `supabase/migrations/20260410061930_add_salon_purse_debit_refund_entry_type.sql` — the `salon_purse_debit_refund` ledger entry type, added specifically for refund debits but currently only ever used by `refund-cancelled-appointment`.
- `supabase/functions/_shared/paystack-helpers.ts` — `getPaystackBalance` (lines 339-382), confirmed this checks Paystack's platform-wide live balance, used only by `process-salon-withdrawal`, unrelated to per-tenant recoverability.
- `apps/salon-admin/src/components/dialogs/RequestRefundDialog.tsx` — confirms UI-only gating (`canRefundViaPaystack`, line 82) with no balance check.
- `apps/salon-admin/src/hooks/useRefunds.tsx` — confirms the approval-queue path (`approveRefund`) never reaches Paystack refunds.

---

# Relevant Components

- **Edge Functions:** `refund-via-paystack`, `refund-cancelled-appointment`, `process-salon-withdrawal`, `payment-webhook-processor` (shared).
- **RPCs:** `complete_transaction_refund`, `debit_salon_purse`, `debit_salon_purse_for_withdrawal`, `credit_salon_purse`, `credit_customer_purse`.
- **Tables:** `salon_wallets` (balance), `wallet_ledger_entries` (audit trail + idempotency), `transactions`, `refund_requests`, `appointments`.

---

# Existing Constraints

- `debit_salon_purse` and `debit_salon_purse_for_withdrawal` both lock the wallet row `FOR UPDATE` and enforce `balance >= amount`, raising on violation — this is the established backend-enforcement pattern for anything that debits a salon's wallet.
- `complete_transaction_refund` enforces its own invariant: total refunds (pending+approved+completed) against a transaction can never exceed the original transaction amount (`v_remaining` check) — this is about not over-refunding a payment, not about wallet recoverability, and is orthogonal to the gap described here.
- Idempotency on wallet debits is keyed by `p_idempotency_key` against `wallet_ledger_entries`, scoped per tenant.
- Currency on any wallet debit must match `salon_wallets.currency` or the RPC raises.

---

# Existing Behaviour

- `refund-via-paystack`'s own comment (lines 104-106, 120-122) already acknowledges the fragility here: it explicitly defers to "Paystack's real answer" for settlement issues and treats `complete_transaction_refund` failure as a post-hoc reconciliation problem ("Paystack has already refunded the customer at this point"). This confirms the current design never intended to prevent the Paystack call from happening when the wallet can't cover it — it only handles the RPC failing *after* Paystack already acted, which is a different failure mode from the one in the original request.
- `refund-cancelled-appointment` debits the salon wallet *before* crediting the customer, specifically so a failed debit prevents the customer credit from happening at all — this ordering is the pattern to replicate, but in `refund-via-paystack`'s case the "external effect" is the irreversible Paystack API call, not an internal credit, which is what makes ordering harder to get right there (see Existing Implementation & Placement above).

---

# Unknowns

- `Q: Should the fix hard-block the Paystack refund entirely when the wallet balance is insufficient, or allow it and record a debt/negative-balance/reconciliation entry against the tenant for manual recovery? -> A: [product] — this determines whether staff can still issue the refund at all when a customer legitimately needs one but the salon already withdrew the money; no repository evidence indicates a preference either way (no negative-balance handling or debt-tracking exists anywhere in the schema today).`
- `Q: If partially covered (wallet has some balance but less than the refund amount), should the refund be blocked entirely, capped to available balance, or split (partial wallet debit + recorded shortfall)? -> A: [product] — no existing pattern in the codebase addresses partial coverage for any debit operation; `debit_salon_purse` is all-or-nothing today.`
