# Original Request

> End-to-end payments verification before beta (top-priority, user-set 2026-09-14). The product
> ships to beta users only once payments are proven end to end, against the DEV Supabase project
> and Paystack TEST keys — never prod. Cover the full path: checkout session creation, Paystack
> redirect, webhook processing (payment-webhook-gh / payment-webhook-ng), payment recording,
> receipts, and payout/withdrawal. A written test plan comes before any implementation: scope the
> matrix explicitly — currencies GH and NG, success, failure, abandoned, duplicate webhook, refund
> — rather than ad-hoc clicking. This run must end in an explicit go/no-go verdict on the new payout
> path, because that same verdict is the gate on subaccount-split-cleanup (~82 references to the
> superseded subaccount/split code cannot be deleted until it lands); the two items are one
> decision.

---

# Summary

This is the `payments-e2e-verification` item in `docs/backlog-open-followups.md` (status:
in-progress). The request is for a **written test plan**, not an implementation — no code changes
are implied by this investigation itself, so steps 3 (Affected Surfaces) and 3b (Existing
Implementation & Placement) are not applicable in their usual sense; see those sections for why.

The payment path is: `create-payment-session` (checkout) → Paystack hosted checkout → either the
browser redirect (`verify-booking-payment` / `verify-subscription-payment`, best-effort) or the
`payment-webhook-gh`/`-ng` webhook (authoritative) → `_shared/payment-webhook-processor.ts`
(`processWebhook`, the single shared handler both webhooks call) → appointment/transaction/invoice
recording → `credit_salon_purse` wallet crediting → `process-salon-withdrawal` (payout) →
`transfer.success`/`transfer.failed` webhook events finalize the withdrawal.

Two verified, non-obvious facts materially shape the test matrix:

1. **The webhook has no duplicate-delivery guard for the `appointment_payment` intent type** other
   than the wallet-credit step. A repeated `charge.success` webhook (Paystack retries webhooks that
   don't respond fast/200) would re-run the appointment `amount_paid` update, insert a second
   `transactions` row, and generate a second invoice + duplicate emails. Only the salon-wallet
   credit itself is idempotent (`credit_salon_purse`'s `p_idempotency_key`). This must be an
   explicit case in the "duplicate webhook" test matrix cell, and its outcome bears directly on the
   go/no-go verdict.
2. **The payout/withdrawal path already has thorough, layered idempotency and reconciliation
   safeguards** that were built recently and are visible in code: a request-level duplicate check
   (5-minute window) in `process-salon-withdrawal`, wallet-availability/settlement checks, a
   live Paystack-balance floor check before transferring, and wallet debit deferred until
   `transfer.success` (not at request time), with the debit itself idempotent
   (`debitWalletWithRetry` / idempotency key `webhook_debit_<withdrawalId>`). This is the "new
   payout path" the go/no-go verdict is about.

---

# Current Behaviour

## Checkout session creation — `supabase/functions/create-payment-session/index.ts`

- Single function handles all `intentType`s (`appointment_payment`, `customer_purse_topup`,
  `salon_purse_topup`, `invoice_payment`, `messaging_credit_purchase`). Non-`appointment_payment`
  intents require a Bearer-authenticated caller; `appointment_payment` does not (guest checkout).
- Currency is resolved from `tenant.currency` with client-supplied `currency` only as a fallback
  input, then validated for a match (`determineEffectiveCurrency`, `validateCurrencyMatch` in
  `_shared/paystack-helpers.ts`) — the tenant's own currency, not the client, is authoritative.
- For `appointment_payment`, the charge amount is **never trusted from the client**: it is
  recomputed server-side from `appointments.total_amount - amount_paid` across the target
  appointment id(s), and a session is refused (409) if the booking is already `fully_paid` /
  `refunded_full`. Fees (`computeBookingCharge` in `_shared/payment-fee-calculator.ts`) are added on
  top for a balance/outstanding payment, mirroring what `create-public-booking` already does for the
  initial booking charge.
- `getPaystackKeyForCurrency` (in `_shared/paystack-helpers.ts`) selects `PAYSTACK_SECRET_KEY_NG` or
  `PAYSTACK_SECRET_KEY_GH` purely from currency — GH and NG are fully separate Paystack accounts/keys,
  confirming the test matrix must exercise both independently, not just one currency with an
  assumption the other behaves the same.
- A `payment_intents` row is inserted (`status: "pending"` → `"processing"` once Paystack returns an
  `access_code`) before calling Paystack's `/transaction/initialize`. This row is what the webhook
  later looks up by `payment_intent_id` in metadata to determine `intent_type`.
- Subaccount split params (`subaccount`, `transaction_charge`) are only sent to Paystack if
  `SUBACCOUNT_SPLIT_ENABLED` (in `_shared/payment-fee-calculator.ts`) is true — this is the flag
  disabled 2026-09-06 pending this exact verification, per `[[project-payout-and-billing-gaps]]`
  memory and the `subaccount-split-cleanup` backlog item.

## Webhook processing — `payment-webhook-gh` / `payment-webhook-ng` + `_shared/payment-webhook-processor.ts`

- The two webhook functions (`supabase/functions/payment-webhook-gh/index.ts`,
  `payment-webhook-ng/index.ts`) are near-identical: each verifies the Paystack HMAC-SHA512
  signature over the raw body using its own currency-specific secret
  (`PAYSTACK_SECRET_KEY_GH` / `_NG`), parses the event into a shared `WebhookEvent` shape, then calls
  the shared `processWebhook` **without awaiting it**, returning `200` immediately (explicit comment:
  "prevent Paystack timeout/retries"). This means a slow or throwing `processWebhook` cannot be
  observed by Paystack's own retry behavior, and any error inside it is only visible in function
  logs, not in the webhook response.
- `processWebhook` (`_shared/payment-webhook-processor.ts:267`) branches on `isPaymentSuccessEvent`
  (`charge.success` or an equivalent), `isPaymentFailureEvent`, and `isTransferEvent`
  (`transfer.success`/`transfer.failed`/`transfer.reversed`).
- For payment success, it further branches on `payment_intents.intent_type` looked up by
  `payment_intent_id`: `appointment_payment`, `customer_purse_topup`, `salon_purse_topup`,
  `invoice_payment`, `messaging_credit_purchase`, plus a special `subscription_activation` path keyed
  off `metadata.intent` rather than `intent_type`.
- **`appointment_payment` success path** (line 349 onward): updates each target appointment's
  `amount_paid`/`payment_status`, inserts a `transactions` row (and a second one for any
  purse/split-payment portion), sends owner/customer email notifications
  (`sendTransactionAlerts`, `send-appointment-notification`, direct Resend calls to owners/managers),
  generates and sends an invoice (`invoices` insert + `send-invoice` function call), then credits the
  salon wallet unconditionally via `credit_salon_purse` (idempotency key `booking_<reference>`).
  Only this last step is guarded against being re-run — every step before it (appointment update,
  transaction insert, notifications, invoice generation) has no duplicate-webhook check.
- `payment_intents.status` is set to `"completed"` only **after** all of the above runs
  (line 965-974), and nothing checks whether it was already `"completed"` before starting — i.e.
  there is no early-exit idempotency guard at the top of the success branch at all.
- **Transfer events** (payout finalization) do have an explicit duplicate guard: `transfer.success`
  checks `withdrawal.status === "completed"` and returns early if so (line 1047-1051) before calling
  `debitWalletWithRetry`, which itself uses a per-withdrawal idempotency key
  (`webhook_debit_<withdrawalId>`, line 93).

## Browser-redirect fallback — `verify-booking-payment`

- Exists as a secondary path when the browser returns from Paystack's hosted checkout, but per
  `[[project-payout-and-billing-gaps]]` (documented for the analogous `verify-subscription-payment`),
  this path is **not reliable** — it only runs if the customer's browser completes the redirect. The
  webhook is the authoritative path; the test plan should verify behaviour with the redirect
  deliberately skipped/interrupted ("abandoned" matrix cell), not just the happy path where the
  browser returns.

## Payout / withdrawal — `process-salon-withdrawal` + transfer webhook

- `process-salon-withdrawal/index.ts` requires an authenticated owner/manager/supervisor
  (`requireTenantRole`, `PAYOUT_ALLOWED_ROLES`), then:
  1. Checks for an existing `pending`/`processing` withdrawal on the same destination (409 if found).
  2. Checks for a same-amount/same-destination withdrawal within a 5-minute window, in any of
     `pending`/`processing`/`completed` (409 if found) — this is the request-level duplicate guard.
  3. Validates `wallet.balance >= amount`, then a stricter **settlement-aware** availability check
     (`get_salon_wallet_availability` RPC) — since wallet balance is credited immediately on
     `charge.success` but Paystack itself only settles funds the next business day.
  4. Cross-checks against Paystack's own live platform balance (`getPaystackBalance`) as a floor —
     refuses the withdrawal if Paystack's real balance is below the requested amount, covering the
     case where the internal ledger disagrees with reality.
  5. Inserts the `salon_withdrawals` row (`status: "pending"`) with a pre-generated reference
     (`withdrawal_<uuid>_<timestamp>`) **before** calling Paystack's `/transfer` endpoint, so the
     reference is already in the DB when the webhook fires.
  6. Calls Paystack `/transfer`. A `data.status === "otp"` response is recorded as
     `awaiting_otp` — an internal-only status (surfaced only in backoffice's Withdrawals page per
     `[[project-payout-and-billing-gaps]]`); the salon-facing Payouts page always shows this as plain
     "pending".
  7. **The wallet is not debited here** — only on the later `transfer.success` webhook
     (`debitWalletWithRetry`), specifically to avoid debiting for a transfer that fails, is reversed,
     or gets stuck at OTP.
- `transfer.failed`/`transfer.reversed` webhook events mark the withdrawal `failed` with no wallet
  reversal needed (since it was never debited).

## Currency/environment configuration

- GH and NG are selected purely by currency string throughout (`getPaystackKeyForCurrency`), each
  with its own env-var-scoped secret key and (implicitly) its own webhook signing secret — this repo
  effectively runs two independent Paystack integrations that happen to share code.

---

# Affected Surfaces

Not applicable in the usual sense: this run is scoped to producing a test plan and executing it,
not to changing a contract. No API endpoint, shared type, exported function, DB column, event
payload, or config key is being modified by this investigation itself. If the test plan's outcome
subsequently drives a code fix (e.g. for the duplicate-webhook gap found above), that fix would
need its own Affected Surfaces pass at that time.

---

# Existing Implementation & Placement

Not applicable in the usual sense — this is a verification task, not a new feature, so there is no
"where should this live" question. The existing implementation *of the thing being verified* is
described fully in Current Behaviour above; there is no partial/duplicate implementation to be
aware of. No relevant prior memory note exists at this path (`docs/research/` has no earlier
`payments-e2e` or `payment-webhook` brief to check per step 3c — the closest prior work is
`docs/research/2026-09-06-paystack-subscriptions-billing.md`, which covers subscription billing
reliability, a related but distinct surface from the checkout/webhook/payout path here).

There is no existing e2e test harness for this path: `find supabase/functions -iname "*.test.ts"`
turns up only narrow unit tests with mocked Supabase clients (e.g.
`process-salon-withdrawal/index.test.ts`) — none for `create-payment-session`,
`payment-webhook-gh`/`-ng`, or `verify-booking-payment`, and none that exercise a live Paystack test
account. This confirms the test plan must be built from scratch, not adapted from an existing
convention, though the memory note's "Verification pattern used for both (reusable playbook)" (in
`[[project-payout-and-billing-gaps]]`) — a diagnostic function computing the real Paystack
HMAC-SHA512 signature and POSTing a realistic payload straight to the webhook — is a proven
technique for simulating webhook delivery (including the duplicate-webhook case) without needing a
real browser or a real Paystack account action for every scenario.

---

# Execution Flow

```
Customer/client checkout
    ↓
create-payment-session (recomputes amount server-side, resolves GH/NG key, creates payment_intents row)
    ↓
Paystack hosted checkout (customer redirected)
    ↓                                              ↘
verify-booking-payment (browser redirect,      payment-webhook-gh / payment-webhook-ng
best-effort, NOT authoritative)                (HMAC verified, fires processWebhook
    ↓                                            without awaiting, returns 200 immediately)
    ↓                                                   ↓
    ↓                                    _shared/payment-webhook-processor.ts: processWebhook
    ↓                                                   ↓
    ↓                              appointment_payment / customer_purse_topup / salon_purse_topup /
    ↓                              invoice_payment / messaging_credit_purchase / subscription_activation
    ↓                                                   ↓
    ↓                              appointments update, transactions insert, invoices insert,
    ↓                              send-invoice, send-appointment-notification, owner emails
    ↓                                                   ↓
    ↓                              credit_salon_purse (idempotent wallet credit)
    ↓
(payment_intents.status → completed either way)

Salon payout:
process-salon-withdrawal (duplicate checks, wallet availability, Paystack balance floor,
    salon_withdrawals row inserted, Paystack /transfer called, wallet NOT yet debited)
    ↓
transfer.success / transfer.failed / transfer.reversed webhook → processWebhook
    ↓
transfer.success: debitWalletWithRetry (idempotent) → salon_withdrawals.status = completed
transfer.failed/reversed: salon_withdrawals.status = failed (no reversal needed)
```

---

# Relevant Files

- `supabase/functions/create-payment-session/index.ts` — checkout session creation; server-side
  amount recomputation, currency resolution, fee calculation, `payment_intents` row creation.
- `supabase/functions/payment-webhook-gh/index.ts`, `payment-webhook-ng/index.ts` — signature
  verification and event parsing per currency; both delegate to the shared processor.
- `supabase/functions/_shared/payment-webhook-processor.ts` — the actual business logic for every
  webhook event type; where the duplicate-webhook gap and the payout idempotency both live.
- `supabase/functions/_shared/paystack-helpers.ts` — currency→key resolution, currency validation,
  signature verification, Paystack balance lookup.
- `supabase/functions/process-salon-withdrawal/index.ts` — payout/withdrawal initiation; duplicate
  guards, settlement/balance checks, deferred wallet debit.
- `supabase/functions/process-salon-withdrawal/index.test.ts` — existing unit test convention for
  this function (mocked Supabase client), useful as a pattern reference, not itself e2e.
- `supabase/migrations/20260403235218_add_currency_validation_to_credit_salon_purse.sql` — current
  `credit_salon_purse` definition; confirms the idempotency mechanism (lookup by
  `idempotency_key` before crediting).
- `docs/backlog-open-followups.md` — defines this item's scope, its gating relationship to
  `subaccount-split-cleanup`, and prior status.

---

# Relevant Components

- Edge Functions: `create-payment-session`, `payment-webhook-gh`, `payment-webhook-ng`,
  `process-salon-withdrawal`, `verify-booking-payment`, `send-invoice`,
  `send-appointment-notification`.
- Shared modules: `_shared/payment-webhook-processor.ts`, `_shared/paystack-helpers.ts`,
  `_shared/payment-fee-calculator.ts`.
- Database RPCs: `credit_salon_purse`, `debit_salon_purse_for_withdrawal` (via
  `debitWalletWithRetry`), `get_salon_wallet_availability`.
- Tables: `payment_intents`, `appointments`, `transactions`, `invoices`, `salon_wallets`,
  `wallet_ledger_entries`, `salon_withdrawals`, `salon_payout_destinations`.

---

# Existing Constraints

- Currency is authoritative from `tenants.currency`, not the client; GH and NG are fully separate
  Paystack keys/accounts, so every scenario in the test matrix must be run against both, not
  assumed to generalize from one.
- Appointment payment amounts are always recomputed server-side from `total_amount - amount_paid`;
  a session cannot be created for an already-settled booking (409).
- `SUBACCOUNT_SPLIT_ENABLED` currently gates off subaccount/split params entirely — the path under
  test here is the non-split, wallet-based path, which is exactly the path the go/no-go verdict is
  about.
- Wallet debit for withdrawals is strictly deferred to `transfer.success` confirmation, never at
  request time — by design, to avoid debiting for a transfer that never completes.
- Both webhook functions return `200` before `processWebhook` finishes (fire-and-forget), so
  Paystack will not retry on a slow/failing processor — meaning a broken processor could show
  "webhook received" while quietly failing internally, with no signal from Paystack's dashboard
  retry behaviour.

---

# Existing Behaviour

- **Duplicate `charge.success` delivery is not idempotent end-to-end** for `appointment_payment`:
  only the wallet credit (`credit_salon_purse`) is protected by an idempotency key
  (`booking_<reference>`). A second identical webhook delivery would re-update
  `appointments.amount_paid` (double-counting payment against the same booking), insert a second
  `transactions` row, generate a second invoice via `send-invoice`, and re-send owner/customer
  notification emails. This is a genuine, verified gap in the current implementation that the test
  plan's "duplicate webhook" matrix cell must exercise and the go/no-go verdict must weigh.
- The payout/withdrawal path, by contrast, already has multiple independent, verified safeguards
  (request-level duplicate window, settlement-aware balance check, live Paystack-balance floor,
  deferred + idempotent wallet debit, and an explicit `withdrawal.status === "completed"` guard on
  `transfer.success`) — this is the strongest evidence in the current codebase in favor of the "new
  payout path" being sound, but has not yet been exercised against a live Paystack test account per
  the backlog note.
- `awaiting_otp` is an internal-only status; the salon-facing Payouts UI always shows "pending" —
  worth confirming during testing that this doesn't produce a misleading "stuck" withdrawal from a
  salon's perspective if OTP is ever triggered against a Paystack test account.

---

# Unknowns

- `Q: Does the test plan need to be written as a persisted document (e.g. its own docs/ file) before
  execution, or is producing it inline in this pipeline run (planner/principal stage) sufficient?
  -> A: Treat this Technical Brief as complete for its own scope (documenting current behaviour);
  the written test plan itself is planning/design work, not research, so it belongs in the next
  pipeline stage (planner), not here. (decided autonomously) [engineering - unresolved: unverified]`
- `Q: Should the found duplicate-webhook gap be fixed as part of this same run, or only documented
  for the go/no-go decision? -> A: Out of scope for research; this is a design/prioritization call
  for principal/planner, not something researcher decides. Recorded here as a fact for them to act
  on. [product]`

---
