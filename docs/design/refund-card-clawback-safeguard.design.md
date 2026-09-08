# References

- Planning Brief: `docs/prd/refund-card-clawback-safeguard.prd.md`
- Technical Brief: `docs/research/2026-09-06-refund-clawback-safeguard.md`
- Backlog item: `docs/backlog-open-followups.md` → `refund-card-safeguard`

Both briefs are assumed open. This document covers the *how* only — the problem, current behaviour, scope and acceptance criteria live in those files and are not restated here.

---

# Architecture Decisions

## AD-1. The guard is a real wallet **debit** taken *before* the external effect, not a balance pre-check

**Decision.** Every refund path that moves money to a customer performs an actual, committed `salon_wallets` debit *before* the irreversible effect (Paystack `/refund`, or the customer-balance credit). If the debit cannot be taken, the refund stops there. If the external effect subsequently fails, the debit is reversed by a compensating credit.

**Reasoning.** A read-only "is the balance enough?" check followed later by a debit is two decisions with a gap between them, and the gap is exactly where NFR *Correctness under concurrency* fails: a withdrawal that commits in the gap leaves the refund already sent to Paystack against a wallet that can no longer cover it. Taking the debit *is* the check — `debit_salon_purse` already locks `salon_wallets FOR UPDATE` and raises on `balance < amount`, and `debit_salon_purse_for_withdrawal` takes the same lock, so a refund and a withdrawal racing on one wallet serialise on that row and exactly one wins (AC-12). Committing the debit before calling Paystack also means the funds are held from that instant: a withdrawal started while Paystack is still responding sees the reduced balance.

This is the same "debit first, external effect second" ordering `refund-cancelled-appointment` already uses; the Technical Brief establishes it as the house pattern and this design extends it rather than inventing a second one.

**Rejected alternatives.**
- *Balance pre-check in the edge function, debit inside `complete_transaction_refund` afterwards.* Loses the concurrency guarantee above, and in the Paystack case the RPC runs only after the money has already left — too late to reject, which the Technical Brief calls out as a verified constraint.
- *A separate "reservation"/hold table distinct from the wallet balance.* A second ledger to keep consistent with the first, for no gain: reducing `balance` already is the hold, and `wallet_ledger_entries` already records it.

## AD-2. Reuse `debit_salon_purse` / `credit_salon_purse` — the new RPCs wrap, never reimplement

**Decision.** The new SQL functions call the existing `debit_salon_purse` (entry type `salon_purse_debit_refund`) and `credit_salon_purse` (entry type `salon_purse_reversal`). No new balance arithmetic, no new ledger insert, no new idempotency mechanism is written.

**Reasoning.** Those RPCs already carry currency validation, the `FOR UPDATE` lock, the `balance >= amount` guard, the negative-amount ledger row, and idempotency keyed on `wallet_ledger_entries(tenant_id, idempotency_key)`. The `salon_purse_debit_refund` entry type was added specifically for refund debits (`20260410061930`) and is currently used by only one caller; this feature makes it the entry type for *all* refund debits. Re-deriving any of that would create a second definition of "can this wallet afford it" that can drift from the withdrawal path's definition — which is the exact class of bug this feature exists to close.

## AD-3. Blocks are reported by **return value**, not by raising

**Decision.** The enforcement RPC `debit_salon_wallet_for_refund` returns `jsonb` — `{ok:true, ledger_entry_id}` or `{ok:false, code:'INSUFFICIENT_RECOVERABLE_FUNDS', …}` — and inserts the `refund_block_events` row on the `false` branch. It does not raise on insufficient funds.

**Reasoning.** FR-6 requires the blocked attempt to be *recorded*. PostgreSQL has no autonomous transactions on Supabase, so a `raise` inside the function rolls back the very row that records the block. Returning normally commits the block-event insert and nothing else — which is also exactly what AC-3 demands (no change to transaction, appointment, customer balance, or wallet balance). Raising is reserved for genuine programming errors (missing wallet, currency mismatch, unauthorised caller), which are not user-visible block conditions and must roll back.

**Rejected alternative.** *Let the caller record the block after catching the exception.* Recording would then depend on the caller's good behaviour, and a caller that crashed between the two would lose the record — the "no silent absorption" NFR would hold only by convention.

## AD-4. One backend entry point for **completing** a refund: the `refund-via-paystack` edge function, generalised to all refund types

**Decision.** `refund-via-paystack` is extended to complete `paystack`, `store_credit` and `offline` refunds. `RequestRefundDialog`'s direct-complete branch and `useRefunds.approveRefund` both stop calling `complete_transaction_refund` from the browser and call this function instead. The *request* path (`request_transaction_refund`) is untouched.

**Reasoning.** FR-4 and FR-9 require the guard to hold for every entry point, and AC-10 extends the all-or-nothing rule to store-credit refunds — which today go straight from the browser to `complete_transaction_refund` and never touch `salon_wallets` at all. That is a genuine divergence the Technical Brief did not have to look for, because it only compared the *cancellation* path. Enforcing the rule in one server-side place, with one ordering and one block-recording site, is what stops the two paths diverging again (PRD scope item 4). Splitting store-credit enforcement into a second edge function would recreate the divergence in a new shape.

The function keeps its existing name and deployed URL despite now being broader than Paystack. Renaming would leave the old, now-unguarded `refund-via-paystack` deployed and callable until someone manually deleted it — a live bypass of the safeguard for as long as it lingered. A header comment records that the name is historical.

**Rejected alternative.** *Put the debit inside `complete_transaction_refund` and leave the browser calling it directly.* Works for store credit but not for the card path (AD-1: too late), so the two paths would still be enforced in two different places.

## AD-5. `complete_transaction_refund` becomes non-bypassable by requiring proof of the debit

**Decision.** Add a final parameter `p_wallet_debit_entry_id uuid default null`. The RPC computes whether this refund requires a wallet debit and, if it does, **raises** unless it is handed a `wallet_ledger_entries` row that genuinely covers this refund (right tenant, entry type `salon_purse_debit_refund`, amount `= -p_amount`, matching currency, referencing this transaction, not already claimed by another refund request). The id is persisted on `refund_requests.wallet_debit_entry_id`.

**Reasoning.** The RPC is reachable over PostgREST by any owner or manager, so moving the guard into an edge function is only a real guarantee if the RPC refuses to do bookkeeping that no debit backs. Validating a *supplied* entry rather than taking the debit itself keeps the debit at the one place AD-1 requires (before the external effect) while making the linkage explicit and auditable — this is what makes the *Auditability* NFR answerable: for any completed refund, `refund_requests.wallet_debit_entry_id` names the debit that covered it.

**Which refunds require a debit:** `p_refund_type in ('paystack','store_credit','original_method')` **and** the original transaction was not purse-funded (`v_transaction.method <> 'purse'`). Purse-funded bookings never credited `salon_wallets` in the first place (only gateway funds do — `payment-webhook-processor.ts:634`), so debiting the salon for them would take money it was never given; those refunds return the customer's own reserved balance via the existing `refund_customer_balance_reservation` path. `offline` refunds require no debit either: Salon Magik pays out nothing, the salon settles with the customer directly.

**Rejected alternative.** *A boolean `p_wallet_debit_taken` flag.* Trivially forgeable by a direct caller and records nothing; the whole point is that the proof is a real ledger row.

## AD-6. Blocked attempts live in a dedicated `refund_block_events` table, not the audit log

**Decision.** New table `public.refund_block_events`, surfaced to platform staff through a backoffice-gated `get_backoffice_blocked_refunds()` RPC and a **Blocked refunds** panel on `apps/backoffice/src/pages/TransactionsPage.tsx`.

**Reasoning.** AC-4 names seven specific fields and the Success Criteria require the *total value* of blocked attempts to be reportable. `log_audit_event` stores an untyped `jsonb` payload in a high-volume, tenant-scoped table — summing an amount out of it is a JSON cast over every audit row, and there is no index that makes it cheap. A narrow table with a `numeric` amount column makes "loss avoided this month" one indexed aggregate. It also gives the salon-side surface a clean shape if blocked attempts are ever shown to salon staff (not in this phase).

## AD-7. The dialog's availability check is one read, recomputed locally as the amount changes

**Decision.** On open, when the transaction is gateway-funded, the dialog calls `check_refund_recoverability(p_transaction_id)` once. It returns the wallet balance, currency and whether a debit is required. The dialog compares the entered amount against that balance client-side; it does not re-query on every keystroke.

**Reasoning.** The *Usability* NFR wants this to not make the dialog feel slow, and recoverability is a pure comparison of one balance against one amount — there is nothing to re-fetch. The answer is advisory by construction (AD-1 holds the real guarantee), so a slightly stale balance is a cosmetic problem, not a correctness one: the submit-time debit is what decides, and AC-8's race path is exactly the case where the two disagree. If the check errors or is unauthorised, the dialog leaves the destinations selectable and lets the backend decide at submit, per the NFR.

## AD-8. There is no "no destination available" state — `offline` is unconditional, and the copy says so

**Decision.** The Cash/transfer (`offline`) destination is never gated on the wallet, in any circumstance. The disabled card and salon-balance tiles carry copy that names the cause and points at that remaining route, rather than hedging or escalating:

- Disabled card tile: **"Unavailable — this payment has already been paid out to your salon. Refund it to the customer directly and record it as cash / transfer."**
- Disabled salon-balance tile: **"Unavailable — store credit is funded from your salon balance, which no longer holds this payment."**
- Enabled card tile (replacing the old *"Not always possible — depends on Paystack's own settlement state"*): **"Goes back to the customer's card. The amount is taken from your salon balance."**
- A single line under the destination group when both are disabled: **"This payment has already been withdrawn, so Salon Magik can't move the money for you. Refund the customer directly and record it below."**

**Reasoning.** The Planning Brief left open what staff should be told when *no* destination is available, and whether that escalates to Salon Magik support. It doesn't need answering, because the state it describes cannot occur: `offline` requires no wallet debit (AD-5) — Salon Magik pays out nothing on that path, it only records that the salon settled directly. So the answer is always the same and always available, and no escalation path is needed. Escalating to Salon Magik support would be actively wrong: the money is already in the salon's bank account, so the salon is the only party that can return it.

The copy therefore states the cause in the salon's own terms ("paid out to your salon", not "insufficient balance") and gives the next action in the same sentence. This is also what keeps the Salon-trust risk in the Planning Brief in check — the message must read as *"you already have this money"*, never as *"Salon Magik is withholding your customer's refund"*.

**Rejected alternative.** *Ship placeholder copy and revisit once a process is agreed.* There is no process to agree: the product already has exactly one correct answer here, and leaving vague copy in place repeats the failure this feature exists to fix — the old tile hedged instead of saying what was true.

## AD-9. Blocks are made *passively* visible, not notified

**Decision.** No email, push or digest notification is sent when a refund is blocked. Instead the backoffice **Blocked refunds** panel is accompanied by an unresolved-count badge on the Transactions nav entry, driven by a `count` the same RPC already returns, so a block is visible without anyone deciding to go looking. The edge function additionally logs each block at `error` level with tenant, transaction and amount, so it lands in existing log-based alerting if anyone wants to key off it.

**Reasoning.** A notification is a commitment to a recipient, a cadence and a de-duplication rule, and none of those can be chosen sensibly before anyone knows whether blocks happen twice a month or two hundred times a day — the Planning Brief itself flags blocked-attempt volume as the thing to watch, and a per-event alert built ahead of that data is the classic path to an ignored channel. A badge costs one integer on a query that is already being run, has no delivery semantics to get wrong, and degrades gracefully at any volume. If the volume turns out to warrant a real alert, it is a read over `refund_block_events` and touches nothing in this design.

**Rejected alternatives.**
- *Email platform staff per blocked attempt.* Unbounded volume, no recipient defined, and the first busy day trains everyone to filter it.
- *Nothing at all beyond the panel.* The "no silent absorption" NFR is about the record existing, but a record nobody sees is only half of it. The badge is the cheapest thing that closes that gap.


---

# Components

**Database (new)**
- `public.refund_block_events` — table.
- `public.check_refund_recoverability(uuid)` — read-only advisory check for the dialog.
- `public.debit_salon_wallet_for_refund(...)` — the enforcement point; debits or records a block.
- `public.reverse_refund_wallet_debit(...)` — compensating credit when the external effect fails.
- `public.get_backoffice_blocked_refunds(int, int)` — platform-staff read.

**Database (changed)**
- `public.complete_transaction_refund(...)` — new `p_wallet_debit_entry_id` parameter; requires and validates it (AD-5).
- `public.refund_requests` — new `wallet_debit_entry_id uuid` column.

**Edge functions**
- `supabase/functions/refund-via-paystack/index.ts` — generalised to all refund types; owns the ordering.
- `supabase/functions/refund-cancelled-appointment/index.ts` — swaps its direct `debit_salon_purse` call for `debit_salon_wallet_for_refund` so its blocks are recorded too (FR-7).

**Frontend — salon-admin**
- `apps/salon-admin/src/components/dialogs/RequestRefundDialog.tsx` — availability on the destination tiles; submit routed through the edge function; typed error messages.
- `apps/salon-admin/src/hooks/useRefunds.tsx` — `approveRefund` routed through the edge function.

**Frontend — backoffice**
- `apps/backoffice/src/hooks/useBlockedRefunds.tsx` — new.
- `apps/backoffice/src/pages/TransactionsPage.tsx` — new **Blocked refunds** panel.
- `apps/backoffice/src/components/BackofficeLayout.tsx` — unresolved-block count badge on the Transactions nav entry (AD-9).

Unchanged and explicitly out of the change set: `request_transaction_refund`, `reject_transaction_refund`, `credit_salon_purse`/`debit_salon_purse` themselves, `debit_salon_purse_for_withdrawal`, `payment-webhook-processor`, `process-salon-withdrawal`.

---

# Data Flow

## Card refund, funds recoverable (AC-1)

```
RequestRefundDialog (mode=complete)
  open  → rpc check_refund_recoverability(transaction)
        → { requires_wallet_debit: true, wallet_balance, currency }
        → card + salon-balance tiles rendered available
  submit → POST functions/refund-via-paystack
             { transactionId, amount, reason, refundType:'paystack',
               requestId, idempotencyKey }
             │
             ├─ auth: bearer → user
             ├─ service client: load transactions row, validate refundable
             ├─ rpc debit_salon_wallet_for_refund(...)      ← COMMITS
             │     locks salon_wallets FOR UPDATE
             │     balance >= amount → debit_salon_purse
             │     → { ok:true, ledger_entry_id }
             ├─ POST https://api.paystack.co/refund          ← irreversible
             │     → 200 ok
             └─ user client: rpc complete_transaction_refund(
                    …, p_wallet_debit_entry_id: ledger_entry_id)
                    validates the entry, writes the refund transaction,
                    completes refund_requests (+ wallet_debit_entry_id),
                    adjusts appointments.amount_paid / payment_status
             → 200 { success:true, refundId, paystackReference, walletDebitEntryId }
```

## Card refund, funds already withdrawn (AC-2, AC-3, AC-5)

```
  submit → rpc debit_salon_wallet_for_refund(...)
             balance < amount
             → INSERT refund_block_events (committed)
             → { ok:false, code:'INSUFFICIENT_RECOVERABLE_FUNDS',
                 wallet_balance, shortfall, currency }
         → 409 { error, code, walletBalance, shortfall, currency }
```
Paystack is never called. `transactions`, `refund_requests`, `appointments`, the customer balance and `salon_wallets.balance` are all untouched — the block-event insert is the only write.

## Card refund, Paystack declines after the debit (FR-3)

```
  … debit taken (committed)
  → POST /refund → non-2xx or status:false
  → rpc reverse_refund_wallet_debit(idempotency_key)
        credit_salon_purse('salon_purse_reversal', key || '__reversal')
  → 502 { error: paystack message, code:'PAYSTACK_DECLINED' }
```
The wallet ends where it started; the ledger shows the debit and its reversal, so the attempt is visible rather than erased.

## Store-credit / cancellation refund

Same shape, no Paystack leg: debit → `complete_transaction_refund` (which credits the customer balance). If the RPC fails, the debit is reversed before returning, because nothing external happened.

`refund-cancelled-appointment` keeps its own flow (debit → `credit_customer_purse` → transaction/refund_requests/appointment writes) and only changes *which* RPC takes the debit, so blocks land in `refund_block_events`.

## Bookkeeping failure after a successful Paystack refund

The debit is **kept**, not reversed: the customer really did get the money, so the salon really does owe it. The existing `CRITICAL` log and 500 response stay, now carrying `walletDebitEntryId` so reconciliation can find the debit. This is the pre-existing failure mode; it is strictly better than today because the clawback has already happened.

---

# API Changes

## `refund-via-paystack` request

```ts
interface RefundViaPaystackRequest {
  transactionId: string;
  amount: number;
  reason: string;
  requestId?: string | null;
  refundType?: "paystack" | "store_credit" | "offline";  // default "paystack"
  idempotencyKey?: string | null;                        // client UUID per submit
}
```
`refundType` defaults to `"paystack"` so any in-flight older client keeps working unchanged.

## `refund-via-paystack` responses

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `{ success: true, refundId, paystackReference?, walletDebitEntryId? }` | done |
| 400 | `{ error, code: "INVALID_REQUEST" }` | validation |
| 401 | `{ error, code: "UNAUTHENTICATED" }` | bad/absent token |
| 404 | `{ error, code: "TRANSACTION_NOT_FOUND" }` | |
| **409** | `{ error, code: "INSUFFICIENT_RECOVERABLE_FUNDS", walletBalance, shortfall, currency }` | **new** — the block |
| 502 | `{ error, code: "PAYSTACK_DECLINED" }` | Paystack said no; debit reversed |
| 500 | `{ error, code: "REFUND_RECORDING_FAILED", walletDebitEntryId }` | needs manual reconciliation |

`code` is new on every response; the existing `error` string is preserved so nothing that reads it breaks.

## RPC signatures

```sql
check_refund_recoverability(p_transaction_id uuid) returns jsonb
-- { requires_wallet_debit bool, wallet_balance numeric, currency text,
--   max_refundable numeric }
-- security definer; raises unless auth.uid() is an active owner/manager
-- of the transaction's tenant. Read-only, no locks.

debit_salon_wallet_for_refund(
  p_transaction_id uuid,
  p_amount         numeric,
  p_refund_type    public.refund_type,
  p_reason         text,
  p_actor_id       uuid,
  p_idempotency_key text,
  p_refund_request_id uuid default null,
  p_appointment_id uuid default null
) returns jsonb
-- security definer; execute revoked from anon/authenticated (service role only)
-- { ok:true, ledger_entry_id uuid }
-- { ok:false, code:'INSUFFICIENT_RECOVERABLE_FUNDS',
--   wallet_balance, shortfall, currency, block_event_id }

reverse_refund_wallet_debit(
  p_tenant_id uuid, p_transaction_id uuid, p_amount numeric,
  p_currency text, p_debit_idempotency_key text
) returns uuid   -- reversal ledger entry id; service role only

complete_transaction_refund(
  p_transaction_id uuid, p_amount numeric, p_refund_type public.refund_type,
  p_reason text, p_request_id uuid default null,
  p_wallet_debit_entry_id uuid default null      -- NEW
) returns uuid

get_backoffice_blocked_refunds(p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, created_at timestamptz, tenant_id uuid, tenant_name text,
  transaction_id uuid, refund_request_id uuid, attempted_amount numeric,
  currency text, wallet_balance_at_attempt numeric, shortfall numeric,
  refund_type text, block_code text, reason text,
  attempted_by_id uuid, attempted_by_email text,
  total_count bigint          -- count(*) over () — feeds the nav badge (AD-9)
)
-- raises 'BACKOFFICE_ACCESS_REQUIRED' unless is_backoffice_user(auth.uid())
```

---

# Database Changes

## Migration 1 — `20260907090000_refund_block_events.sql`

```sql
create table public.refund_block_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  refund_request_id uuid references public.refund_requests(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  refund_type public.refund_type not null,
  attempted_amount numeric(12,2) not null check (attempted_amount > 0),
  currency text not null,
  wallet_balance_at_attempt numeric(12,2) not null,
  shortfall numeric(12,2) not null,
  block_code text not null default 'INSUFFICIENT_RECOVERABLE_FUNDS',
  reason text,
  attempted_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_refund_block_events_tenant_created
  on public.refund_block_events (tenant_id, created_at desc);
create index idx_refund_block_events_created
  on public.refund_block_events (created_at desc);
create index idx_refund_block_events_transaction
  on public.refund_block_events (transaction_id);

alter table public.refund_block_events enable row level security;
```

RLS: **one** policy — `select` for active owners/managers of `tenant_id` (so a salon-side surface is possible later without another migration). No `insert`/`update`/`delete` policy: rows are written only by the `security definer` function, and platform staff read through the backoffice RPC, which is also `security definer`.

`shortfall` is stored rather than derived so the reporting aggregate is a plain `sum()`.

## Migration 2 — `20260907090100_refund_wallet_debit_rpcs.sql`

Creates `check_refund_recoverability`, `debit_salon_wallet_for_refund`, `reverse_refund_wallet_debit`.

`debit_salon_wallet_for_refund` body, in order:
1. Load the `transactions` row `for update` (same lock `complete_transaction_refund` takes, so the two serialise on the transaction as well as the wallet).
2. Return early with the existing `wallet_ledger_entries` row if `p_idempotency_key` was already used for this tenant — mirrors `debit_salon_purse`'s own idempotency so a retry is a no-op that still returns `{ok:true}` (AC-11).
3. Resolve `v_requires_debit` by the AD-5 rule. If false, return `{ok:true, ledger_entry_id:null}` — the caller has nothing to debit and `complete_transaction_refund` will not demand one.
4. Lock `salon_wallets` for the tenant `for update`; if absent, raise (a real fault, not a block).
5. Currency mismatch → raise.
6. `balance < p_amount` → insert `refund_block_events`, return `{ok:false, …}`.
7. Otherwise `perform debit_salon_purse(tenant, 'salon_purse_debit_refund', 'transaction', transaction_id::text, amount, currency, p_idempotency_key)` and return its entry id.

## Migration 3 — `20260907090200_refund_requests_wallet_debit_link.sql`

```sql
alter table public.refund_requests
  add column if not exists wallet_debit_entry_id uuid
    references public.wallet_ledger_entries(id) on delete set null;

create unique index if not exists uq_refund_requests_wallet_debit_entry
  on public.refund_requests (wallet_debit_entry_id)
  where wallet_debit_entry_id is not null;
```
The partial unique index is the mechanism that stops one debit being reused to justify two refunds — AD-5's "not already claimed" check is enforced by the database, not only by the `if` in the function.

## Migration 4 — `20260907090300_complete_transaction_refund_wallet_guard.sql`

`create or replace` cannot add a parameter, so the old signature is dropped first (the same pattern `20260906180500_backoffice_ledger_lifecycle.sql` uses):

```sql
drop function if exists public.complete_transaction_refund(
  uuid, numeric, public.refund_type, text, uuid);
```

The recreated body is today's, plus, inserted **after** the `v_remaining` over-refund check and **before** the refund transaction insert:

- compute `v_requires_wallet_debit` per AD-5;
- if required and `p_wallet_debit_entry_id is null` → `raise exception 'REFUND_WALLET_DEBIT_REQUIRED: a refund of this type must be completed through the refund-via-paystack function'`;
- if supplied, `select … into v_debit from public.wallet_ledger_entries where id = p_wallet_debit_entry_id for update` and require `tenant_id = v_transaction.tenant_id`, `wallet_type = 'salon'`, `entry_type = 'salon_purse_debit_refund'`, `amount = -p_amount`, `currency = v_transaction.currency`, `reference_id = p_transaction_id::text`; otherwise raise `REFUND_WALLET_DEBIT_INVALID`;
- if not required and one was supplied → raise `REFUND_WALLET_DEBIT_UNEXPECTED` (prevents a debit being consumed by a refund that should not have taken one).

`wallet_debit_entry_id` is written on both `refund_requests` branches (the freshly inserted row and the approved-request update).

## Migration 5 — `20260907090400_backoffice_blocked_refunds.sql`

`get_backoffice_blocked_refunds`, gated on `is_backoffice_user(auth.uid())` with `raise exception 'BACKOFFICE_ACCESS_REQUIRED'`, joining `tenants.name` and `auth.users.email`, ordered `created_at desc`, `limit`/`offset` from the parameters. `total_count` is a `count(*) over ()` window over the unpaginated set, so the nav badge and the panel's pagination are served by the single query the panel already issues — no second round trip for the count.

## Backfill

None. Historical unrecoverable refunds are explicitly out of scope, and `refund_requests.wallet_debit_entry_id` is correctly `null` for every pre-existing row — `null` means "predates the guard", which is the truth.

---

# Validation

**Edge function, before any state change:** bearer token present and resolvable; `transactionId` a uuid; `amount` finite and `> 0`; `reason` non-empty after trim; `refundType` one of the three allowed values; transaction exists, `type in ('payment','deposit')`, `status = 'completed'`. For `refundType = 'paystack'` additionally: `provider = 'paystack'` and a `provider_reference`/`paystack_reference` exists, and `getPaystackKeyForCurrency` resolves a key. All of these run **before** the debit, so a malformed request never touches the wallet.

**`debit_salon_wallet_for_refund`:** wallet exists; `p_currency`-equivalent (transaction currency) matches wallet currency; `p_amount > 0`. Insufficiency is a returned block, not a validation failure.

**`complete_transaction_refund`:** every check it performs today is retained unchanged — refundable transaction, active owner/manager, positive amount and non-empty reason, pending-request match, and the `v_remaining` over-refund bound (FR-12). The wallet-debit checks of Migration 4 are added on top; none of the existing ones are relaxed.

**Client:** unchanged amount/reason validation, plus — advisory only — the card and salon-balance tiles are disabled when `requires_wallet_debit && amount > wallet_balance`.

---

# Error Handling

| Condition | Where | Result |
| --- | --- | --- |
| Wallet short at submit | `debit_salon_wallet_for_refund` | block event written; `409 INSUFFICIENT_RECOVERABLE_FUNDS`; nothing else written. The edge function additionally logs the block at `error` level with tenant, transaction, attempted amount and balance (AD-9), so it reaches log-based alerting without a notification channel |
| Wallet row missing / currency mismatch | same | `raise` → whole call rolls back → `500`; this is a data fault, not a block, and must not masquerade as one |
| Paystack non-2xx or `status:false` | edge function | reverse the debit, `502 PAYSTACK_DECLINED`, Paystack's own message preserved |
| Paystack network error / timeout | edge function | reverse the debit, `502 PAYSTACK_UNREACHABLE`. The refund may still have been accepted by Paystack, so the reversal is logged at `error` level with the transaction id and idempotency key for reconciliation |
| `complete_transaction_refund` fails, Paystack already succeeded | edge function | **keep** the debit; existing `CRITICAL` log plus `walletDebitEntryId`; `500 REFUND_RECORDING_FAILED` |
| `complete_transaction_refund` fails, nothing external happened | edge function | reverse the debit, `500 REFUND_RECORDING_FAILED` |
| `REFUND_WALLET_DEBIT_REQUIRED` raised | direct PostgREST caller | `500` from PostgREST; means someone bypassed the edge function — the message names the correct entry point |

The salon-admin dialog maps `code` to copy and must not fall back to the raw `error` string for the 409 — AC-8 requires the withdrawn-funds message to read differently from a Paystack decline.

---

# Security Considerations

- `debit_salon_wallet_for_refund` and `reverse_refund_wallet_debit` are `security definer` and move money, so `execute` is **revoked from `anon` and `authenticated`** and granted to `service_role` only. They are reachable exclusively from edge functions holding the service key. This is a deliberate difference from `check_refund_recoverability`, which is granted to `authenticated` because the dialog calls it directly.
- `check_refund_recoverability` exposes a salon's wallet balance, so it requires an **active owner/manager** `user_roles` row for that transaction's tenant — the same bar `complete_transaction_refund` already applies. Staff who can only *request* refunds never see a balance.
- Authorisation for the refund itself stays inside `complete_transaction_refund` under the *user*-scoped client, exactly as today: the edge function does not re-implement the owner/manager check and does not complete refunds with the service key. The service key is used only for reading the transaction and for the two wallet functions.
- `refund_block_events` has RLS on with a tenant-scoped select policy and no write policies; platform-staff access goes through `is_backoffice_user`, matching every other backoffice RPC.
- The debit runs **after** authorisation is established for the caller but **before** `complete_transaction_refund` re-checks it. A user who is authenticated but not an owner/manager could therefore cause a debit that is then rolled back by the RPC's own check — so the edge function performs its own `user_roles` owner/manager lookup before the debit, and returns `403` on failure. The RPC's check remains the authority; the edge-function check exists only so an unauthorised caller cannot churn the wallet.

---

# Performance Considerations

- **Dialog open** adds exactly one RPC round trip (`check_refund_recoverability`), which does two indexed single-row reads: `transactions` by primary key and `salon_wallets` by `idx_salon_wallets_tenant_id` (`tenant_id` is `unique`). It takes no locks and runs in parallel with the existing `refund_requests` fetch, so it does not extend the dialog's time-to-interactive. Typing in the amount field triggers **no** further queries (AD-7).
- **Submit** adds one RPC round trip and one row-level lock held only for the duration of that call — the lock is released at commit, *before* the Paystack HTTP call, so a slow Paystack response never holds `salon_wallets` open against a concurrent withdrawal.
- **Blocked-refunds panel:** `get_backoffice_blocked_refunds` is served by `idx_refund_block_events_created` and is paginated in SQL via `limit`/`offset` — never "fetch all and slice in JS". The tenant-name and actor-email joins are single-row lookups by primary key per returned row, bounded by `p_limit`; no N+1 from the client, because the RPC returns the joined shape in one call.
- The nav badge adds no query of its own: it reads `total_count` off the panel's existing paginated call (AD-9), which the `created_at desc` index already serves.
- The tenant-scoped aggregate the Success Criteria need (`sum(attempted_amount)` over a date range for a tenant) is served by `idx_refund_block_events_tenant_created`.
- No new query runs on any hot path: nothing here touches booking, checkout or webhook processing.

---

# Compatibility

**Backward compatible by construction:**
- `refund-via-paystack` keeps its URL and its existing request fields; `refundType` and `idempotencyKey` are optional and default to today's behaviour. A client deployed before the frontend change still issues card refunds correctly — now guarded.
- `complete_transaction_refund`'s new parameter has a default, and PostgREST binds by name, so existing callers still resolve the function.

**Deliberately breaking, and required to be:**
- A direct browser call to `complete_transaction_refund` for a `store_credit` refund on a gateway-funded transaction now raises `REFUND_WALLET_DEBIT_REQUIRED`. This is the FR-4 guarantee, not a regression — but it means **the frontend changes must ship in the same release as Migration 4**, or the store-credit and approval-queue paths break for the window in between. There is no ordering of these two that is safe to split across releases; note it on the deploy.
- `refund-cancelled-appointment` behaves identically to today except that blocked attempts now leave a row. Its existing `'Insufficient wallet balance'` message is replaced by the structured block, so anything matching on that string (nothing found in-repo) would need updating.

**Deprecation:** none. No function or column is removed. The `refund-via-paystack` name is retained deliberately (AD-4) and documented as historical in a header comment.

**Migration ordering:** 1 → 2 → 3 → 4 → 5. Migration 4 references `refund_requests.wallet_debit_entry_id` from Migration 3 and the unique index that backs its "not already claimed" rule; Migration 2 references `refund_block_events` from Migration 1.

---

# Edge Cases

1. **Wallet balance exactly equals the refund amount.** `debit_salon_purse` uses `balance < amount`, so equality succeeds and the wallet lands on zero. Correct — the money is exactly recoverable.
2. **Wallet has some but not all of it** (AC-5). `{ok:false}`, block recorded with the true `wallet_balance_at_attempt` and `shortfall`; no partial debit, no partial refund.
3. **Purse-funded original transaction.** `v_requires_wallet_debit` is false; no debit is taken and `complete_transaction_refund` must not be handed one (`REFUND_WALLET_DEBIT_UNEXPECTED`). The customer's own reserved balance is returned by the existing `refund_customer_balance_reservation` path, unchanged.
4. **`offline` refund.** No debit ever, on any transaction — Salon Magik pays out nothing. The Cash/transfer tile therefore stays enabled even when the wallet is empty, which is why the "no destination available" state the Planning Brief asked about cannot occur (AD-8).
5. **Salon has no `salon_wallets` row at all.** Raises, `500`. Not treated as a block: a missing wallet is a provisioning fault and should be loud, not quietly recorded as "already withdrawn".
6. **Wallet currency ≠ transaction currency.** Raises before any debit. Multi-currency tenants are outside this feature; failing loudly is correct.
7. **Retried submit with the same `idempotencyKey`** (AC-11). The ledger-entry lookup short-circuits and returns the original entry id; `complete_transaction_refund` then fails on the partial unique index (that entry already backs the first refund request) — so the second attempt neither double-debits nor double-refunds.
8. **Two genuinely separate partial refunds of the same transaction for the same amount.** Distinct client-generated `idempotencyKey`s, so distinct debits, each claimable once. This is exactly why the key is per-submit and not derived from `(transaction, amount)`.
9. **Withdrawal commits between dialog open and submit** (AC-8). Availability was computed from a now-stale balance; the debit rejects, the 409 message names the withdrawn-funds reason, and no refund is issued.
10. **Withdrawal and refund submitted simultaneously** (AC-12). Both contend for the same `salon_wallets` row lock; the loser sees the winner's committed balance and fails its own `balance >= amount` check. Balance never goes negative.
11. **Approval-queue refund of a `store_credit` request on an emptied wallet** (AC-10). `approveRefund` now goes through the edge function and receives the 409; the request stays `pending` — it is neither completed nor rejected, so the salon can still reject it explicitly or retry once funds return.
12. **Paystack returns 2xx but `status: false`.** Already treated as failure today; the debit is reversed. The existing check (`!paystackRes.ok || !paystackData.status`) is retained verbatim.
13. **Reversal itself fails** after a Paystack decline. Logged `CRITICAL` with the idempotency key; the salon is left debited for a refund the customer never received. The `salon_purse_reversal` idempotency key makes a manual re-run of the reversal safe.
14. **`refund_block_events` row for a transaction that is later deleted.** `on delete set null` keeps the event and its amount; the tenant, amount and timestamp survive, which is what the reporting needs.

---

# Tests Required

## SQL (pgTAP, `supabase/tests/refund_clawback.sql` — new, alongside the existing `customer_value_flows.sql` and `subscription_lifecycle.sql`)

1. Sufficient balance → `debit_salon_wallet_for_refund` returns `ok:true`, balance drops by the amount, one `salon_purse_debit_refund` ledger row with a negative amount.
2. Insufficient balance → `ok:false`, balance unchanged, exactly one `refund_block_events` row with the correct `wallet_balance_at_attempt` and `shortfall`.
3. Balance exactly equal → succeeds, balance zero.
4. Same idempotency key twice → one ledger row, balance debited once.
5. Purse-funded transaction → `requires_wallet_debit` false, no debit, no block.
6. `complete_transaction_refund` with `p_wallet_debit_entry_id` null on a gateway-funded `store_credit` refund → raises `REFUND_WALLET_DEBIT_REQUIRED`; no transaction, refund_request or appointment row changes.
7. `complete_transaction_refund` with a mismatched entry (wrong amount / wrong tenant / wrong entry type) → raises `REFUND_WALLET_DEBIT_INVALID`.
8. Same debit entry used for two refunds → second fails on the partial unique index.
9. `complete_transaction_refund` with a valid entry → succeeds and stores `wallet_debit_entry_id` on `refund_requests`.
10. `offline` refund → no debit required, no debit taken, completes.
11. `check_refund_recoverability` as a non-owner/manager → raises; as owner → returns the balance.
12. `get_backoffice_blocked_refunds` as a non-backoffice user → raises `BACKOFFICE_ACCESS_REQUIRED`.
13. The existing `v_remaining` over-refund bound still rejects an over-refund even when the wallet is flush (FR-12 regression guard).
14. `reverse_refund_wallet_debit` restores the balance and writes a `salon_purse_reversal` entry; run twice → one reversal.

## Frontend unit (Vitest)

15. `RequestRefundDialog` — card and salon-balance tiles disabled with the AD-8 withdrawn-funds copy when `wallet_balance < amount` (AC-6), and the both-disabled helper line rendered.
16. — both tiles enabled when the balance covers it (AC-7).
17. — cash/transfer tile stays enabled when the wallet is empty.
18. — selection auto-switches off `paystack` when the amount is raised past the balance.
19. — `check_refund_recoverability` erroring leaves the tiles selectable (NFR fallback, AD-7).
20. — a 409 `INSUFFICIENT_RECOVERABLE_FUNDS` renders the withdrawn-funds message; a 502 `PAYSTACK_DECLINED` renders a visibly different one (AC-8).
21. — submit sends `refundType` and a fresh `idempotencyKey`, and a new key is generated after returning to the form and resubmitting.
22. `useRefunds.approveRefund` — invokes `refund-via-paystack` (not the RPC) and surfaces the 409 without marking the request completed (AC-11 for the queue path).
23. `useBlockedRefunds` — maps RPC rows, paginates, and exposes `total_count` for the badge.
24. Nav badge renders the unresolved count and is absent at zero.

## Integration / end-to-end (against a local Supabase stack)

25. Full card-refund happy path (AC-1): wallet debited, `refund_requests.wallet_debit_entry_id` set, appointment `payment_status` updated — Paystack mocked.
26. Full blocked path (AC-2, AC-3): 409, no Paystack call issued, every other table byte-identical before and after apart from `refund_block_events`.
27. Paystack-declines-after-debit path: balance restored, debit + reversal both present in the ledger.
28. Concurrency (AC-12): a withdrawal and a card refund fired simultaneously against a wallet covering only one → exactly one succeeds, final balance ≥ 0.
29. `refund-cancelled-appointment` on an emptied wallet → still rejected, and now leaves a `refund_block_events` row (FR-7).

---

# Verification

```bash
# Type/lint/build across the workspace
npm run lint
npm run typecheck
npm run build

# Unit tests (salon-admin + backoffice)
npm run test

# Database: apply migrations to a clean local stack and run pgTAP
supabase db reset
supabase test db

# Edge functions typecheck under Deno
deno check supabase/functions/refund-via-paystack/index.ts
deno check supabase/functions/refund-cancelled-appointment/index.ts

# Regenerate Supabase types after migrations 1-5 and confirm no drift
supabase gen types typescript --local > <the repo's generated types path>
git diff --exit-code -- <the repo's generated types path>
```

Run the exact script names the repo defines if any of the above differ; substitute the generated-types path this repo already uses. `supabase db reset` must be run before `supabase test db` so the five new migrations are present.

---

# Implementation Order

Each step leaves the tree building and testable.

1. **Migration 1** — `refund_block_events` table, indexes, RLS. No behaviour change yet.
2. **Migration 2** — `check_refund_recoverability`, `debit_salon_wallet_for_refund`, `reverse_refund_wallet_debit`, with grants (`authenticated` for the first, `service_role` only for the other two). Still unused.
3. **Migration 3** — `refund_requests.wallet_debit_entry_id` + partial unique index.
4. **pgTAP tests 1-5, 11, 14** against steps 1-3. Green before continuing — these cover the enforcement primitive in isolation.
5. **Edge function `refund-via-paystack`** — generalise to all refund types, add the owner/manager pre-check, the debit, the ordering, the compensations, the typed `code` responses, and the error-level block log (AD-9). Keep `refundType` defaulting to `"paystack"`.
6. **Migration 4** — `complete_transaction_refund` drop + recreate with `p_wallet_debit_entry_id` and its validation. From here the store-credit browser path is broken until step 8; do not deploy between 6 and 8.
7. **pgTAP tests 6-10, 13** against step 6.
8. **`RequestRefundDialog.tsx`** — recoverability fetch on open, tile availability and the AD-8 copy verbatim, auto-switch, `idempotencyKey` generation, route all `mode === "complete"` submits through the edge function, map the `code`s to messages.
9. **`useRefunds.approveRefund`** — route through the edge function, surface the 409 without completing the request.
10. **Frontend tests 15-22.**
11. **`refund-cancelled-appointment`** — swap `debit_salon_purse` for `debit_salon_wallet_for_refund`, handle the `{ok:false}` return as a 409 with the same code.
12. **Migration 5** — `get_backoffice_blocked_refunds`; pgTAP test 12.
13. **`useBlockedRefunds` + Blocked refunds panel** on `apps/backoffice/src/pages/TransactionsPage.tsx`, plus the nav badge in `BackofficeLayout.tsx` fed by `total_count`; tests 23-24.
14. **Integration tests 25-29.**
15. **Full verification suite** per the section above.

Steps 6 and 8-9 form one atomic release unit (see Compatibility). Steps 12-13 are additive and could ship separately if needed, but FR-6/AC-4 are unmet until they land, and AD-9's visibility guarantee rests on step 13.

---

# Open Questions

- `Q: Should the block record live in the audit log or a dedicated table? -> A: Dedicated table (AD-6) — AC-4's field list and the reportable-total Success Criterion both need typed columns and an index. (decided autonomously)`
- `Q: Is the store-credit path already covered by the existing cancellation-path enforcement, as the Technical Brief's parity note implies? -> A: No. complete_transaction_refund never touches salon_wallets, so a browser-initiated store-credit refund is unguarded today just as the card path is. AC-10 requires it, so the design covers it. This widens the change beyond the Technical Brief's Affected Surfaces list, which compared only the cancellation path. (decided autonomously)`
- `Q: Rename refund-via-paystack now that it handles all refund types? -> A: No — a rename leaves the old, unguarded function deployed and callable until manually deleted, which is a live bypass. Name kept, documented as historical in a header comment. (decided autonomously)`
- `Q: Where should the idempotency key come from? -> A: Client-generated UUID per submit attempt, passed through. Deriving it from (transaction, amount) would silently collapse two legitimate identical partial refunds into one debit while still refunding the customer twice. (decided autonomously)`
- `Q: What should staff be told when no refund destination is available, and does it escalate to Salon Magik support? -> A: The state cannot occur — cash/transfer requires no wallet debit and is never gated, so there is always exactly one available route and no escalation path is needed. Final copy is specified in AD-8. (decided autonomously)`
- `Q: Should platform staff be notified when a refund is blocked, or is after-the-fact review enough? -> A: No notification in this phase; an unresolved-count badge on the backoffice Transactions nav makes blocks passively visible, plus an error-level log line per block. Rationale and the rejected alternatives are in AD-9. (decided autonomously)`

No engineering uncertainty remains. Every decision above is recorded with its reasoning so it can be audited and reversed independently.
