Status: implemented

# References

- Planning Brief: `docs/prd/paystack-subscription-lifecycle-completion.prd.md`
- Technical Brief: `docs/research/2026-09-06-paystack-subscriptions-billing.md`

Both are assumed open. This document covers the *how* only: what problem is being solved, current behaviour, scope, and acceptance criteria live in those two files and are not restated here.

---

# Architecture Decisions

## AD-1. The lifecycle runs as a second pass inside `process-recurring-addon-billing`, not a new cron

**Decision.** Extend the existing daily edge function with a *lifecycle pass* that runs **before** the existing charge pass, in the same invocation. Split `index.ts` into sibling modules under the function directory — `lifecycle.ts` (state transitions + dunning notices), `charge.ts` (the existing per-tenant charge loop, moved as-is), `index.ts` (auth, client, orchestration, response).

**Reasoning.** Every new transition (grace expiry → suspended, cancel date reached → canceled, dunning reminder emails) is a billing-state transition on exactly the daily cadence this job already runs on, and needs the same Supabase service client, the same `getPaystackKeyForCurrency`/`chargeAuthorization` helpers, and the same email senders. A second cron means a second vault secret, a second function URL, a second schedule that can drift out of sync with the first, and an ordering hazard between two jobs that both mutate `tenants.subscription_status`. One job, one ordering, one transaction-per-tenant.

Ordering matters and is load-bearing: the lifecycle pass flips cancellation-pending tenants whose date has arrived to `canceled` and clears their `next_billing_at` *before* the charge pass queries for due tenants, so a cancelled tenant can never be charged on their own cancellation date by a race between the two passes.

**Rejected alternatives.**
- *A separate `process-subscription-lifecycle` function on its own cron.* Cleaner file-wise, but introduces cross-job ordering that nothing enforces, and duplicates the auth/secret/client boilerplate. The failure mode (charge pass runs before lifecycle pass on some day and bills a cancelled tenant) is a customer-trust bug, not a cosmetic one.
- *Postgres-side transitions in a pg_cron SQL job.* State transitions alone could be pure SQL, but grace-expiry and cancellation both need to send email, which is an edge-function capability. Splitting "change the row in SQL, send the mail in TS" across two mechanisms makes the "exactly one email per transition" guarantee much harder.

## AD-2. Cancellation-pending is *not* a new `subscription_status` value

**Decision.** A cancellation-pending tenant stays `subscription_status = 'active'`. The pending state is expressed by new columns on `tenants`: `subscription_cancel_at`, `cancellation_requested_at`, `cancellation_requested_by`, `cancellation_reason`, `cancellation_reason_note`.

**Reasoning.** A cancellation-pending tenant has full paid access — that is the entire point of end-of-period cancellation. `is_tenant_operational` and every `subscription_status === 'active'` check across `SettingsPage.tsx`, `SubscriptionBanner`, theme purchase gating (`canPurchasePaidTheme`), and module gating already produce exactly the right answer for them. Adding a `pending_cancellation` enum value would require auditing and amending every one of those call sites to also accept the new value, with a silent-lockout bug at each one missed. The pending state is a *scheduled future event*, and a nullable timestamp is the honest representation of that.

**Rejected alternative.** *New enum value `pending_cancellation`.* Rejected for the call-site blast radius above. The cost is that "is this tenant cancelling?" is `subscription_cancel_at is not null` rather than a status string — cheap, and expressed once — in `useSubscriptionLifecycle` on the client and in the ledger function on the server — rather than open-coded at each call site.

## AD-3. Suspension is a new enum value `suspended`, not a reuse of `paused`

**Decision.** `alter type public.subscription_status add value if not exists 'suspended'`, in its own migration file.

**Reasoning.** `paused` already exists and is already treated as non-operational, so reuse is tempting. But the Planning Brief explicitly puts *owner-initiated pausing* out of scope as a distinct future feature, and that feature would want `paused`. Collapsing "we suspended you for non-payment" and "you asked us to pause you" into one value would make them indistinguishable in the ledger, in `get_backoffice_subscription_ledger`, and in every future filter — and they need opposite messaging.

**Implementation constraint.** PostgreSQL forbids using a newly added enum value in the same transaction that adds it, and Supabase runs each migration file in a transaction. The `add value` therefore ships as its **own migration file**, ordered before any migration or function that references `'suspended'`. This is not optional; getting it wrong fails the migration at deploy time.

## AD-4. `past_due` becomes an *operational* state during grace; suspension is what locks the storefront

**Decision.** Amend `is_tenant_operational` so `past_due` returns `true` while `now() < billing_grace_ends_at`, and `false` once the grace deadline has passed or if no deadline is set. `suspended` and `canceled` return `false`.

**Reasoning.** This is a real behaviour change and the single riskiest edit in this design, so it is called out explicitly. Today `past_due` immediately kills the public storefront (`is_tenant_operational` returns false for anything that isn't `active`/in-trial). The Planning Brief requires the opposite: during grace the tenant keeps working and is warned; only at grace expiry does the storefront go down. Without this change, requirement 15 ("at grace expiry ... storefront disabled") would be indistinguishable from requirement 10 ("during grace ... tenant keeps working"), and the grace period would be decorative.

The `false`-when-`billing_grace_ends_at is null` fallback preserves today's behaviour for any tenant already sitting in `past_due` at deploy time who has no deadline stamped — see Compatibility for the backfill that gives them one.

**Rejected alternative.** *Leave `is_tenant_operational` alone and add a separate suspension flag.* Would leave two overlapping lockout mechanisms and a storefront that goes down at the wrong moment. The function is already the single source of truth for "is this salon open for business"; suspension belongs in it.

## AD-5. The original billing anchor is persisted, not recomputed

**Decision.** Add `tenants.billing_period_due_at timestamptz`. The charge pass stamps it with the `next_billing_at` value it is charging *for*, at the moment it begins an attempt. Settlement computes the next date from that anchor, via a new SQL helper `public.advance_billing_anchor(p_due_at timestamptz, p_billing_cycle text)` which adds cycle-length intervals to the anchor until the result is in the future.

**Reasoning.** Acceptance criterion 9 requires a settled tenant to resume "on the original cycle anchor — not shifted by the failure". Today `verify-recurring-billing-retry-session` sets `next_billing_at = getNextBillingAt(cycle)` — i.e. *now* + 30/365 days — which hands the tenant every day they spent in retry and grace for free, and permanently drifts their billing date later on every payment failure. The anchor has to be remembered because by settlement time `next_billing_at` has been overwritten by the retry schedule and then nulled.

The helper uses `interval '30 days'` / `interval '365 days'`, deliberately mirroring `getNextBillingAt` in `_shared/paystack-helpers.ts` rather than using calendar months, so the two never disagree about what a "cycle" is. A comment in each points at the other.

**Rejected alternative.** *Derive the anchor from the most recent successful-charge audit log.* Possible, but makes a correctness-critical date depend on log rows that are written best-effort and are not uniquely constrained.

## AD-6. Grace-period length is an edge-function env var, stamped onto the tenant at grace start

**Decision.** `BILLING_GRACE_PERIOD_DAYS` (default `14`) read by the lifecycle pass. When a tenant enters `past_due`, `billing_grace_ends_at` is computed once and written to the row.

**Reasoning.** The repository has no general platform-settings table (only `feature_flags` and `maintenance_events`, neither a fit), and the existing dial of the same kind — `MAX_RETRY_ATTEMPTS` — is a constant in this same function. An env var is the smallest thing that satisfies "configurable" without inventing a settings surface the Planning Brief did not ask for.

Stamping the deadline on the row rather than computing `past_due_since + N days` on read is what makes acceptance criterion 10 hold ("failed settlement leaves the deadline unchanged") and stops a config change from retroactively suspending tenants who were mid-grace when it changed.

**Rejected alternative.** *A `platform_billing_settings` table with a backoffice editor.* More surface than the brief scopes, for a value that changes approximately never.

## AD-7. Dunning notices are tracked in their own table, not in per-threshold columns on `tenants`

**Decision.** New table `billing_dunning_notices (tenant_id, grace_started_at, notice_key, sent_at)` with a unique index on `(tenant_id, grace_started_at, notice_key)`.

**Reasoning.** The precedent in the codebase is `send-trial-expiry-reminders`, which uses fixed `trial_reminder_{7d,3d,24h}_sent_at` columns. That works there because the trial length is fixed. Here the grace window is configurable (AD-6) and a tenant can enter grace repeatedly, so fixed columns would need clearing on every recovery — a step that, when missed, silently suppresses every future reminder. Keying on `grace_started_at` makes each grace episode its own namespace and makes "exactly one email per notice per episode" a database constraint rather than a code convention, which is precisely what acceptance criterion 14 asks for.

## AD-8. Chain-annual pricing is gated on *data*, not on a code flag

**Decision.** Add `additional_location_pricing.price_per_location_annual numeric` (nullable) and give `compute_chain_price` a `p_billing_cycle text default 'monthly'` parameter. Chain-annual checkout and chain-annual base-price inclusion become available for a currency **exactly when** that currency has `plan_pricing.annual_price` set for Chain *and* complete annual per-location tier data. Where the data is absent, `compute_chain_price(..., 'annual')` returns `null` and the checkout function rejects annual selection for Chain with a clear message — it never guesses a number.

**Reasoning.** The Planning Brief's own Risks section flags "pricing decision blocks delivery" — the Chain annual price is an unanswered commercial question. Gating on data instead of on a deploy means all of scope item 3's engineering ships and gets tested now, and going live is a backoffice pricing entry later, by whoever makes the commercial call. It also removes the last "flagged known gap" comment from the code without replacing it with a different hardcoded carve-out.

This is also *why* `usesPaystackNativeSubscription` can be deleted rather than left inert: the reason it existed was "no correct annual chain number to charge", and a null-returning pricing function expresses that condition directly.

**Rejected alternative.** *Keep the native-Subscription branch behind a feature flag until pricing lands.* Explicitly rejected by the Planning Brief (requirement 21, and the documented incident behind the self-managed design). Two live billing mechanisms is the failure mode being eliminated.

## AD-9. Chain-annual migration disables the Paystack Subscription and aligns our anchor to its `next_payment_date`

**Decision.** A one-shot, dry-runnable, idempotent backoffice edge function `migrate-chain-annual-billing`.

**Reasoning — and the specific double-charge this avoids.** Existing chain-annual tenants are *already* in our due-tenants query and *already* being charged daily-cadence-scheduled by our cron; `compute_tenant_recurring_total` simply excludes their base price, so they are currently charged for add-ons only by us and for the base price by Paystack's own Subscription. The moment AD-8's change makes chain-annual base price computable, `compute_tenant_recurring_total` starts including it — and unless Paystack's Subscription is disabled *first*, that tenant is charged the base price twice. The migration is therefore a hard sequencing prerequisite for enabling the annual chain pricing data, not a follow-up. This is stated again in Implementation Order.

Aligning `next_billing_at` to the Paystack subscription's `next_payment_date` (rather than leaving our own now+365) is what satisfies "unchanged next charge date" (AC 17).

## AD-10. Correct home

All of it lands in this repository's existing billing locations — `supabase/functions/` (edge functions), `supabase/migrations/` (schema + Postgres functions), `apps/salon-admin/src` (owner-facing surface), `apps/backoffice/src` (ledger). There is no shared/upstream billing package in this workspace (`packages/` holds UI and shared utilities, not domain logic), so there is no upstream candidate to route this to. This follows the Technical Brief's placement finding; recorded here as an explicit decision rather than a default.

---

# Components

## Database (`supabase/migrations/`)

| Object | Change |
|---|---|
| `subscription_status` enum | add `'suspended'` (own migration file — see AD-3) |
| `tenants` | new columns: `subscription_cancel_at`, `cancellation_requested_at`, `cancellation_requested_by`, `cancellation_reason`, `cancellation_reason_note`, `billing_grace_ends_at`, `billing_period_due_at`, `suspended_at` |
| `billing_dunning_notices` | new table (AD-7) |
| `additional_location_pricing` | new column `price_per_location_annual numeric` |
| `is_tenant_operational(uuid)` | amended (AD-4) |
| `compute_chain_price(uuid, text, integer)` | new overload with `p_billing_cycle` |
| `compute_tenant_recurring_total(uuid)` | chain carve-out replaced with cycle-aware chain pricing |
| `advance_billing_anchor(timestamptz, text)` | new helper (AD-5) |
| `request_subscription_cancellation(uuid, text, text)` | new RPC, owner-only |
| `resume_subscription(uuid)` | new RPC, owner-only |
| `get_backoffice_subscription_ledger()` | returns the new lifecycle columns |
| `get_tenant_billing_activity(uuid)` | includes the new lifecycle audit actions |

## Edge functions (`supabase/functions/`)

| Function | Change |
|---|---|
| `process-recurring-addon-billing` | split into `index.ts` / `charge.ts` / `lifecycle.ts`; lifecycle pass added; charge pass gains cancellation filter, anchor stamping, grace stamping |
| `create-recurring-billing-retry-session` | unchanged in shape; allow `suspended` as well as `past_due`; carry `intent: "recurring_billing_retry"` as today |
| `verify-recurring-billing-retry-session` | settlement semantics corrected to use the persisted anchor; clears grace/suspension state; restores `active` from `suspended` too |
| `create-checkout-session` | `usesPaystackNativeSubscription` branch deleted; chain-annual availability gated on pricing data |
| `migrate-chain-annual-billing` | **new**, one-shot backoffice-triggered, dry-runnable |
| `_shared/receipts.ts` | new senders: `sendCancellationConfirmationEmail`, `sendDunningReminderEmail`, `sendSuspensionEmail`, `sendReactivationEmail` |
| `_shared/paystack-helpers.ts` | new `disablePaystackSubscription`, `getPaystackSubscription` |

## salon-admin (`apps/salon-admin/src/`)

| Component | Change |
|---|---|
| `components/billing/BillingStateBanner.tsx` | **new** — past-due / suspended persistent banner, mounted in `SalonSidebar` alongside `TrialBanner` |
| `components/billing/CancelSubscriptionDialog.tsx` | **new** — reason picker + confirmation, shows access-end date |
| `pages/salon/SettingsPage.tsx` | subscription card: cancellation-pending state, Cancel / Resume actions, masked card on file, single-primary-action logic |
| `hooks/useSubscriptionLifecycle.ts` | **new** — derives the current lifecycle state and its one primary action from `currentTenant`; the single place that decides what the surface shows |
| `components/layout/SubscriptionBanner.tsx` | **deleted** — dead code, mounted nowhere; its `past_due` case is superseded by `BillingStateBanner` |

## backoffice (`apps/backoffice/src/`)

| Component | Change |
|---|---|
| `hooks/useSubscriptionLedger.tsx` | row type extended with lifecycle fields |
| `pages/SubscriptionLedgerPage.tsx` | renders cancellation-pending / cancelled / past-due-with-deadline / suspended, with reason and timestamps |

---

# Data Flow

## Cancellation

```
Owner → SettingsPage (scope=subscription) → "Cancel subscription"
  → CancelSubscriptionDialog: shows access-end date (= tenants.next_billing_at),
    reason select + optional note
  → supabase.rpc('request_subscription_cancellation', {p_tenant_id, p_reason, p_note})
      · security definer, asserts caller has user_roles.role = 'owner' for the tenant
      · asserts subscription_status = 'active' and next_billing_at is not null
      · sets subscription_cancel_at = next_billing_at, cancellation_* fields
      · writes audit_logs 'subscription_cancellation_requested'
      · returns the access-end date
  → client refreshes tenants; surface renders "Cancellation pending, access until <date>"
    with a Resume action
```

Postgres cannot send mail, and the client must not be the thing that sends a
billing email, so the RPC is not called directly from the browser. It is called
*through* a thin edge function `manage-subscription-cancellation`
(`action: 'cancel' | 'resume'`), which does its own owner check, invokes the RPC
with the service client, and then sends the email — matching how every other
billing email in this codebase is delivered. The full flow:

```
Owner → CancelSubscriptionDialog
  → functions.invoke('manage-subscription-cancellation', {tenantId, action:'cancel', reason, note})
      · bearer-token auth → user; owner check against user_roles (same shape as
        create-recurring-billing-retry-session)
      · service client → rpc('request_subscription_cancellation', ...)
      · sendCancellationConfirmationEmail(access-end date, "reversible until then")
      · returns { cancelAt }
  → refreshTenants(); surface shows pending state
```

Resume is the same function with `action: 'resume'` → `rpc('resume_subscription')` → clears `subscription_cancel_at` and the `cancellation_*` fields, writes `subscription_cancellation_reversed`, no payment, `next_billing_at` untouched.

## Daily job — lifecycle pass (runs first)

```
cron 03:00 → process-recurring-addon-billing
  ── PASS 1: lifecycle ──────────────────────────────────────────────
  (a) cancellations due
      select tenants where subscription_cancel_at <= now()
                       and subscription_status = 'active'
      → guarded update: set subscription_status='canceled', next_billing_at=null
        WHERE id=? AND subscription_status='active' AND subscription_cancel_at <= now()
      → if 0 rows updated: skip audit + email (already applied today)
      → audit 'subscription_canceled' {trigger:'cron'}

  (b) dunning reminders
      select tenants where subscription_status='past_due'
                       and billing_grace_ends_at > now()
      for each notice threshold not yet recorded for this grace episode:
        → insert into billing_dunning_notices (tenant_id, grace_started_at,
            notice_key) ON CONFLICT DO NOTHING
        → only if the insert produced a row: sendDunningReminderEmail(...)
      (insert-then-send, never send-then-insert: a duplicate email is worse
       than a missed one here, and the unique index is the guard)

  (c) grace expiry
      select tenants where subscription_status='past_due'
                       and billing_grace_ends_at <= now()
      → guarded update: subscription_status='suspended', suspended_at=now()
        WHERE id=? AND subscription_status='past_due'
      → if 0 rows updated: skip
      → audit 'subscription_suspended' {trigger:'cron'} ; sendSuspensionEmail

  ── PASS 2: charge (existing loop, amended) ─────────────────────────
      select ... from tenants
        where paystack_authorization_code is not null
          and next_billing_at <= now()
          and subscription_status = 'active'      ← NEW
          and subscription_cancel_at is null      ← NEW
      → compute_tenant_recurring_total
      → stamp billing_period_due_at = the next_billing_at being charged for   ← NEW
      → chargeAuthorization
        · success → next_billing_at = advance from anchor, retry_count = 0,
                    billing_period_due_at = null, consume promo, receipt, audit
        · failure → retry_count++ ; < MAX → next_billing_at = now+1d
                                  ; = MAX → subscription_status='past_due',
                                            next_billing_at = null,
                                            billing_grace_ends_at =
                                              now() + BILLING_GRACE_PERIOD_DAYS,
                                            audit 'subscription_past_due',
                                            payment-failed email (as today)
```

The two new `where` clauses on the charge query are belt-and-braces: pass 1(a) has already moved every due cancellation out of `active`, and `past_due`/`suspended` tenants already have `next_billing_at = null`. They are there so that a partial failure in pass 1 cannot result in a charge to a cancelling tenant.

## Settlement (past_due or suspended → active)

```
Owner clicks "Settle payment" / "Update card" on the banner or subscription card
  → create-recurring-billing-retry-session (unchanged flow)
      · owner check; compute_tenant_recurring_total → amount due now
      · Paystack transaction/initialize, intent 'recurring_billing_retry'
  → Paystack hosted page → redirect to /salon/subscription?billing=update_payment_method
  → verify-recurring-billing-retry-session
      · existing idempotency guard on audit_logs(action, metadata.reference)
      · verify with Paystack; require reusable authorization
      · UPDATE tenants SET
          paystack_authorization_code / customer_code / authorization_email = new,
          subscription_status = 'active',
          billing_retry_count = 0,
          billing_grace_ends_at = null,
          suspended_at = null,
          billing_period_due_at = null,
          next_billing_at = advance_billing_anchor(
                              coalesce(billing_period_due_at, now()),
                              billing_cycle)          ← AD-5
      · audit 'subscription_reactivated' {trigger:'owner', from_status}
      · receipt email + sendReactivationEmail
  → client: refreshTenants(); banner clears; success modal
```

On failure (Paystack reports non-success, or the card is not reusable) the function returns 400 with the provider's reason and **writes nothing** — the tenant stays exactly where it was, `billing_grace_ends_at` untouched (AC 10). `SettingsPage` surfaces the message inline.

---

# API Changes

No public/client REST contract changes. Edge-function contracts:

**New — `manage-subscription-cancellation`** (POST, bearer auth, owner-only)
```jsonc
// request
{ "tenantId": "uuid", "action": "cancel" | "resume",
  "reason": "too_expensive" | "missing_features" | "switching_provider"
          | "closing_business" | "temporary_pause" | "other",   // cancel only
  "note": "string|null" }                                        // cancel only
// 200
{ "cancelAt": "2026-10-05T00:00:00Z" }   // action=cancel
{ "resumed": true, "nextBillingAt": "2026-10-05T00:00:00Z" }  // action=resume
// errors: 401 no/invalid token · 403 not owner · 409 not cancellable
//         (not active, or no next_billing_at) · 409 nothing to resume
```

**New — `migrate-chain-annual-billing`** (POST, bearer auth, backoffice super-admin only)
```jsonc
{ "dryRun": true, "tenantIds": ["uuid"] | null }
// 200
{ "dryRun": true, "tenants": [
    { "tenantId": "...", "paystackSubscriptionCode": "SUB_x",
      "paystackNextPaymentDate": "2026-11-02T...",
      "currentNextBillingAt": "2026-09-30T...",
      "hasReusableAuthorization": true,
      "action": "would_disable_and_realign" | "skip_already_migrated"
               | "blocked_no_annual_pricing" | "blocked_no_authorization" } ] }
```

**Changed — `create-checkout-session`**: when `plan = chain` and `billingCycle = annual` and annual chain pricing is not fully configured for the tenant's currency, returns `400 { "error": "Annual billing isn't available for the Chain plan in <CURRENCY> yet." }` instead of silently initializing a native Paystack Subscription. Every other input/output is unchanged.

**Changed — `verify-recurring-billing-retry-session`**: response unchanged (`{applied, alreadyApplied?}`); accepts tenants in `suspended` as well as `past_due`.

**New RPCs** (`authenticated`; both `security definer` with an internal owner check, mirroring the pattern used by the existing plan-configuration RPCs): `request_subscription_cancellation(p_tenant_id uuid, p_reason text, p_note text) returns timestamptz`, `resume_subscription(p_tenant_id uuid) returns timestamptz`.

---

# Database Changes

## Migration 1 — `<ts>_subscription_status_suspended.sql`

```sql
-- Own file: PostgreSQL forbids using a newly added enum value in the same
-- transaction that adds it, and Supabase runs each migration in a
-- transaction. Nothing in this file may reference 'suspended'.
alter type public.subscription_status add value if not exists 'suspended';
```

## Migration 2 — `<ts>_subscription_lifecycle_columns.sql`

```sql
alter table public.tenants
  add column if not exists subscription_cancel_at      timestamptz,
  add column if not exists cancellation_requested_at   timestamptz,
  add column if not exists cancellation_requested_by   uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason         text,
  add column if not exists cancellation_reason_note    text,
  add column if not exists billing_grace_ends_at       timestamptz,
  add column if not exists billing_period_due_at       timestamptz,
  add column if not exists suspended_at                timestamptz;

alter table public.tenants
  add constraint tenants_cancellation_reason_check
  check (cancellation_reason is null or cancellation_reason in
    ('too_expensive','missing_features','switching_provider',
     'closing_business','temporary_pause','other'));

-- Partial indexes: the daily lifecycle pass scans on exactly these two
-- predicates, and both match a tiny fraction of rows.
create index if not exists idx_tenants_cancel_due
  on public.tenants (subscription_cancel_at)
  where subscription_cancel_at is not null;

create index if not exists idx_tenants_grace_due
  on public.tenants (billing_grace_ends_at)
  where billing_grace_ends_at is not null;

create table if not exists public.billing_dunning_notices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  grace_started_at timestamptz not null,
  notice_key       text not null,
  sent_at          timestamptz not null default now()
);

-- The idempotency guarantee for dunning email (AC 14) is this index, not
-- application logic: the lifecycle pass inserts first and only sends when
-- the insert actually produced a row.
create unique index if not exists idx_billing_dunning_notices_unique
  on public.billing_dunning_notices (tenant_id, grace_started_at, notice_key);

alter table public.billing_dunning_notices enable row level security;
-- service_role only; no tenant- or backoffice-facing policy. Read access for
-- the ledger goes through the security-definer ledger function.
```

## Migration 3 — `<ts>_is_tenant_operational_lifecycle.sql`

```sql
-- past_due is now a *warned but working* state for the length of the grace
-- window (see BILLING_GRACE_PERIOD_DAYS in process-recurring-addon-billing).
-- Suspension — not the payment failure itself — is what takes the storefront
-- down. A past_due tenant with no grace deadline stamped keeps the old,
-- stricter behaviour so nothing is accidentally re-opened.
create or replace function public.is_tenant_operational(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    case t.subscription_status
      when 'active'   then true
      when 'trialing' then t.trial_ends_at is not null
                           and t.trial_ends_at + interval '3 days' > now()
      when 'past_due' then t.billing_grace_ends_at is not null
                           and t.billing_grace_ends_at > now()
      else false
    end
  from public.tenants t
  where t.id = p_tenant_id;
$$;
```

Note this is a `create or replace` of a function the `public_booking_tenants` view depends on. Replacing the *body* does not require dropping the view (only a signature change would), so the view and the `locations` RLS policy that cascades from it are left alone — unlike the original lockout migration, which had to recreate both.

## Migration 4 — `<ts>_advance_billing_anchor.sql`

```sql
-- Mirrors getNextBillingAt() in supabase/functions/_shared/paystack-helpers.ts
-- — 30 days for monthly, 365 for annual, deliberately not calendar months.
-- Keep the two in step.
create or replace function public.advance_billing_anchor(
  p_due_at timestamptz,
  p_billing_cycle text
) returns timestamptz
language plpgsql
stable   -- reads now(); must not be immutable
as $$ ... $$;
```
Body: `v_step := case when p_billing_cycle = 'annual' then interval '365 days' else interval '30 days' end;` then `v_next := coalesce(p_due_at, now()) + v_step`, looping while `v_next <= now()`, capped at 100 iterations so a nonsense anchor fails loudly rather than hanging the job.

## Migration 5 — `<ts>_chain_annual_pricing.sql`

```sql
alter table public.additional_location_pricing
  add column if not exists price_per_location_annual numeric,
  add constraint additional_location_pricing_annual_price_check
    check (price_per_location_annual is null or price_per_location_annual >= 0);

-- compute_chain_price gains a cycle parameter. Annual returns NULL total when
-- any tier in range lacks price_per_location_annual, or when the plan has no
-- annual_price for the currency — the caller must treat NULL as "annual chain
-- pricing is not configured", never as zero. This is what replaces the
-- hardcoded chain carve-out; nothing guesses a number.
create or replace function public.compute_chain_price(
  p_plan_id uuid, p_currency text, p_locations integer,
  p_billing_cycle text default 'monthly'
) returns table (total_price numeric, base_price numeric,
                 location_addon_total numeric, is_custom boolean)
...
```

The existing 3-argument call sites (`compute_current_addon_total`, the plan-configuration quote functions, `20260726000002_staff_operations_addon.sql`, etc.) continue to resolve to the defaulted `'monthly'` behaviour and are not touched.

## Migration 6 — `<ts>_recurring_total_chain_annual.sql`

`compute_tenant_recurring_total`: the `if lower(v_plan) = 'chain'` block loses its `if v_billing_cycle = 'monthly'` carve-out and instead calls `compute_chain_price(v_plan_id, v_currency, 1, v_billing_cycle)`. If the returned `total_price` is `null` for an annual chain tenant, the function raises `CHAIN_ANNUAL_PRICING_NOT_CONFIGURED` rather than returning a total that silently omits the base price. **This migration must not run before the chain-annual tenant migration completes** — see AD-9 and Implementation Order.

## Migration 7 — `<ts>_cancellation_rpcs.sql`

`request_subscription_cancellation` / `resume_subscription`, both `security definer`, both asserting `exists (select 1 from user_roles where user_id = auth.uid() and tenant_id = p_tenant_id and role = 'owner')` and raising `OWNER_ROLE_REQUIRED` otherwise. Cancellation additionally raises `SUBSCRIPTION_NOT_CANCELLABLE` unless `subscription_status = 'active' and next_billing_at is not null and subscription_cancel_at is null`.

## Migration 8 — `<ts>_backoffice_ledger_lifecycle.sql`

`get_backoffice_subscription_ledger()` returns the additional columns `subscription_cancel_at`, `cancellation_reason`, `cancellation_reason_note`, `cancellation_requested_by_email`, `cancellation_requested_at`, `billing_grace_ends_at`, `suspended_at`, `billing_retry_count`. `get_tenant_billing_activity()` gains a union branch over `audit_logs` for the new actions.

## Indexes

The two partial indexes above. No index is needed on `subscription_status` — the lifecycle pass's predicates are the timestamp columns, and the charge pass is already served by its existing `next_billing_at` filter.

## Backfill

One statement, in migration 3's file, run **before** the `is_tenant_operational` replacement so no tenant is momentarily reopened:

```sql
-- Tenants already sitting in past_due at deploy time have no grace deadline.
-- Give them a full fresh window rather than instantly suspending them —
-- they have never been warned, and requirement 11's reminder emails have
-- never been sent to them.
update public.tenants
set billing_grace_ends_at = now() + interval '14 days'
where subscription_status = 'past_due'
  and billing_grace_ends_at is null;
```

---

# Validation

**`manage-subscription-cancellation`**
- Bearer token present and resolves to a user — else 401.
- `user_roles.role = 'owner'` for `(user, tenantId)` — else 403. Checked in the edge function *and* again inside the security-definer RPC; the RPC's check is the authoritative one, since `authenticated` can call it directly.
- `action` ∈ `{cancel, resume}`.
- `reason` ∈ the enum-equivalent list, enforced by the CHECK constraint in migration 2 as well as in the edge function.
- `note`: trimmed, max 1000 chars, stored `null` when empty.
- Cancel: tenant must be `active` with a non-null `next_billing_at` and no existing `subscription_cancel_at`.
- Resume: tenant must have a non-null `subscription_cancel_at` in the future.

**`create-recurring-billing-retry-session`** — existing validation retained (owner, tenant exists, amount > 0, Paystack key for currency). Additionally accepts `suspended`.

**`verify-recurring-billing-retry-session`** — existing validation retained in full: reference + tenantId required, owner check, Paystack `status === 'success'`, `metadata.intent === 'recurring_billing_retry'`, `metadata.tenant_id === tenantId`, `authorization.reusable` and `authorization_code` present.

**`create-checkout-session`** — new: chain + annual requires configured annual chain pricing for the tenant's currency.

**`migrate-chain-annual-billing`** — backoffice super-admin only (`has_backoffice_role(auth.uid(), 'super_admin')`); per-tenant preconditions (plan = chain, cycle = annual, has a Paystack subscription code, has a reusable authorization) reported rather than silently skipped.

**Client** — `CancelSubscriptionDialog` requires a reason selection before enabling Confirm; the destructive confirm restates the access-end date. All server rules are re-enforced server-side; the client's checks are UX only.

---

# Error Handling

- **Lifecycle pass, per tenant**: wrapped in try/catch per tenant exactly like the existing charge loop. One tenant's failure never aborts the pass; the error is pushed into `results` and logged. The daily job continues to return 200 with a per-tenant result array, because a non-200 would make the pg_cron/pg_net invocation look wholly failed when 99% of it succeeded.
- **Guarded updates return 0 rows** (already-applied): treated as success-no-op, not an error. No audit entry, no email. This is the mechanism behind AC 14.
- **Email send failure**: logged, never fatal, never rolls back a state transition — consistent with how `sendPaymentFailedEmail` is handled today. Note the consequence for dunning: the `billing_dunning_notices` row is already inserted, so a failed send is *not* retried the next day. This is deliberate — the alternative (delete-on-failure) risks a duplicate blast when a send is reported failed but actually delivered. The failure is visible in the function logs.
- **`compute_tenant_recurring_total` raises `CHAIN_ANNUAL_PRICING_NOT_CONFIGURED`**: the charge pass records `status: "error"` for that tenant, does **not** increment `billing_retry_count`, and does **not** move them toward `past_due` — a platform misconfiguration must never dun a customer.
- **Settlement charge declines**: 400 with the Paystack message; no tenant mutation; grace deadline preserved; surfaced inline by `SettingsPage` (AC 10, AC 14).
- **Migration function**: never partially applies a tenant. Order per tenant is *disable the Paystack subscription first, then realign our row* — if the disable fails, our row is untouched and the tenant continues billing natively, which is the safe direction. If the realign fails after a successful disable, the tenant is left with no billing at all until the next run; the function therefore records an audit entry immediately after the disable so a re-run detects the half-state and completes it.
- **Client**: every new mutation surfaces failures through the existing `useToast` pattern; no silent catch.

---

# Security Considerations

- Every new owner-facing action is owner-gated twice: in the edge function against `user_roles`, and inside the `security definer` RPC against `auth.uid()`. The RPCs are granted to `authenticated`, so the in-function check is the real boundary — the edge-function check exists to return a clean 403 rather than a Postgres exception. (AC 2 — a non-owner has no cancel/resume action, and cannot obtain one by calling the RPC directly.)
- `billing_dunning_notices` has RLS enabled with **no** tenant-facing policy; it is service-role-only. It is exposed to backoffice solely through the existing `security definer` ledger functions, which already assert `is_backoffice_user(auth.uid())`.
- `migrate-chain-annual-billing` requires backoffice super-admin, defaults to `dryRun: true`, and must be explicitly passed `dryRun: false` to mutate anything.
- The lifecycle pass runs under the same `x-recurring-billing-secret` header check as the existing charge pass. No new secret, no new externally reachable unauthenticated surface.
- Paystack secret keys continue to be resolved per-currency via `getPaystackKeyForCurrency`; the new `disablePaystackSubscription`/`getPaystackSubscription` helpers take the key as a parameter like every existing helper and never read env directly.
- `cancellation_reason_note` is free text written by an owner and rendered in the backoffice ledger. Render it as text; React's default escaping covers this, but do not introduce `dangerouslySetInnerHTML` for it, and cap it at 1000 chars server-side.
- No card data is stored or handled; the masked card display uses only `last4`/`brand`/`exp` returned by Paystack, persisted on the tenant at authorization capture (`paystack_authorization_*`). If those display fields are not currently persisted, the surface shows "Card on file" without digits rather than calling Paystack from the client — the client must never hold a Paystack secret key.

---

# Performance Considerations

- **Lifecycle pass queries** are three narrow selects driven by the two partial indexes in migration 2 (`subscription_cancel_at`, `billing_grace_ends_at`), each matching a handful of rows. Select by the timestamp predicate; do not select all tenants and filter in TypeScript.
- **Dunning reminders**: fetch the already-recorded `notice_key`s for the tenants in grace with **one** query (`select tenant_id, notice_key from billing_dunning_notices where tenant_id in (...) and grace_started_at in (...)`) and build a set in memory, rather than one lookup per tenant per threshold. With N tenants in grace and K thresholds that is the difference between 1 query and N×K — the classic N+1 here.
- **Charge pass** is unchanged in shape and remains serial per tenant, which is correct: it makes one external Paystack call each, and parallelising it would risk rate limits for no meaningful gain at this tenant count.
- **`advance_billing_anchor`** is `stable`, called once per settlement. The loop is bounded at 100 iterations.
- **`compute_chain_price`** gains a parameter but no additional scans; the annual tier lookup reads the same `additional_location_pricing` rows already fetched, using `idx_additional_location_pricing_plan_currency_min`.
- **`get_backoffice_subscription_ledger`** already does a full tenant scan with laterals and is explicitly out of scope for redesign; the new columns are plain `tenants` columns on a row already being read, plus one `left join auth.users` for the requesting user's email — no new per-row subquery.
- **Client**: `useSubscriptionLifecycle` derives everything from the `currentTenant` object already in `useAuth`; it introduces no new fetch. `BillingStateBanner` mounts once in `SalonSidebar` (not per route), so "a banner on every authenticated screen" costs one render, not one per navigation.

---

# Compatibility

**Backward compatibility.**
- All new `tenants` columns are nullable with no default; existing rows read as "no cancellation pending, no grace, no anchor" — which is correct for them.
- `is_tenant_operational` keeps its signature, so the `public_booking_tenants` view and the `locations` RLS policy are unaffected. Its *behaviour* changes for `past_due` only, and only when a grace deadline is set — the backfill in migration 3 sets those deliberately, in the same file, before the replacement.
- `compute_chain_price`'s new parameter is defaulted, so all seven existing call sites keep compiling and behaving identically.
- `create-recurring-billing-retry-session` / `verify-recurring-billing-retry-session` keep their request and response shapes; the existing `?billing=update_payment_method` deep link in already-delivered dunning emails continues to work unchanged. This matters: those links are in inboxes right now.
- `SubscriptionBanner.tsx` is deleted rather than amended. It is imported nowhere (verified) — its `past_due` copy would otherwise contradict the new banner.

**Migration strategy.**
1. Migrations 1–4, 7 and the salon-admin/backoffice changes for scope items 1–2 ship first and are independent of Chain pricing. Deploy in the branch-promotion order the project already uses (`development-only` → `main` → `release`); never straight to production.
2. Chain-annual is a strictly ordered sequence with a hard gate: **migration 5 (pricing model) → backoffice enters annual Chain pricing → `migrate-chain-annual-billing --dryRun` reviewed → migration run for real → migration 6 (base-price inclusion) → `create-checkout-session` branch deleted.** Running migration 6 before the tenant migration double-charges every existing Chain-annual tenant (AD-9). If no Chain-annual tenants exist in an environment, the migration function still runs and reports zero, and the gate is satisfied trivially.
3. The Planning Brief's constraint that migration must not change any tenant's next payment date is met by reading `next_payment_date` off the live Paystack subscription and writing it to `next_billing_at`, then verifying it in the post-migration check below.

**Deprecation.** `usesPaystackNativeSubscription`, the `plan`/`paystackPlanCode` branch in `create-checkout-session`, and the `billing_mode: "paystack_subscription"` metadata value are removed outright at step 2's end. `plan_pricing.paystack_plan_code_monthly` / `_annual` and `sync-paystack-plan-pricing` are **retained** — they keep Paystack's dashboard plan list in sync for reporting and are not part of any billing path. Removing them is a separate cleanup, out of scope here.

**Rollback.** Scope items 1–2 roll back by reverting the `is_tenant_operational` body (one `create or replace`) and unmounting the banner; the extra columns are inert. Scope item 3 does **not** roll back cleanly after the tenant migration — a disabled Paystack Subscription cannot be un-disabled — which is precisely why the dry run and the post-migration verification are mandatory steps and not suggestions.

---

# Edge Cases

1. **Trialing tenant clicks Cancel.** No paid period exists, so there is nothing to cancel at period end. Cancel is not offered for `trialing`; the RPC raises `SUBSCRIPTION_NOT_CANCELLABLE`. A trialing tenant who does not convert already lapses via the existing trial lockout.
2. **Active tenant with `next_billing_at = null`** (activated but no card captured — the state the current surface calls "billing not scheduled"). No access-end date can be computed; Cancel is not offered, and the surface's primary action stays "Add payment method".
3. **Cancellation date arrives while the tenant is `past_due`.** Pass 1(a) only transitions tenants that are `active`, so a `past_due` tenant with a pending cancellation is left to the grace/suspension path. Their `subscription_cancel_at` remains set and is honoured if they settle back to `active`. Documented as intentional; the alternative (cancel wins) would let a tenant escape an outstanding balance.
4. **Owner resumes on the cancellation date itself, after the cron has run.** The cron already flipped them to `canceled`; `resume_subscription` requires `subscription_cancel_at` to be in the future, so it raises. The surface must therefore show the *cancelled* state, not a stale Resume button — hence the client always re-derives from refreshed tenant state after any lifecycle action, and `useSubscriptionLifecycle` treats `canceled` as terminal (primary action: Subscribe again).
5. **Settlement succeeds while `billing_period_due_at` is null** (a tenant suspended before this design shipped, or an anchor lost). `advance_billing_anchor` falls back to `now()`, restoring today's behaviour rather than failing. Explicitly coalesced, not accidental.
6. **Grace window shortened by config while tenants are mid-grace.** Deadlines are stamped on the row, so existing tenants keep the window they were promised (AD-6). Only tenants entering grace after the change get the new length.
7. **A tenant recovers, then fails again.** `billing_grace_ends_at` and `suspended_at` are cleared on settlement, and the second grace episode gets a new `grace_started_at`, so `billing_dunning_notices`' unique key does not suppress the second round of reminders.
8. **Cron runs twice in one day.** Every transition is a guarded UPDATE that also asserts the *from* state; the second run updates 0 rows and sends nothing. Dunning is guarded by the unique index. Settlement is guarded by the existing `audit_logs` reference check (AC 14).
9. **Zero amount due at settlement** (e.g. a promo covers the whole balance). `create-recurring-billing-retry-session` already returns "Nothing is currently due". A suspended tenant in that position cannot self-restore through the payment flow — the lifecycle pass therefore also restores any `past_due`/`suspended` tenant whose `compute_tenant_recurring_total` is 0 to `active`, matching the charge pass's existing `skipped_zero_total` behaviour.
10. **Chain-annual tenant with no reusable authorization** (native subscription created before authorization capture was added, or a non-reusable card). The migration reports `blocked_no_authorization` and does not disable their Paystack subscription. They must be contacted to re-add a card before migration; the function never leaves a tenant with neither mechanism.
11. **Chain-annual tenant mid-migration whose Paystack `next_payment_date` is in the past** (a native renewal already failed unnoticed — exactly the hole this work closes). Realign `next_billing_at` to that past date, which puts them in the very next charge pass. Report them separately in the dry run so it is a conscious decision, not a surprise charge.
12. **Suspended tenant's clients hitting the public storefront.** `public_booking_tenants` excludes them, so the storefront resolves as not-found — identical to the existing post-trial behaviour, no new client-facing concept.
13. **Suspended tenant exporting data.** Suspension touches only `is_tenant_operational`, which gates the public booking view and `create-public-booking`. Authenticated read and the existing export paths are untouched, satisfying the "a salon keeps its own records" constraint (AC 11). Confirm during QA that no export path routes through `public_booking_tenants`.
14. **Non-owner staff viewing a `past_due` or suspended tenant.** The banner is shown to every authenticated user (requirement 10) but its action is owner-only; for non-owners it renders the same information with a "contact the salon owner" line instead of the settle button, reusing `TrialBanner`'s existing `canAccessSettings` / contact-admin pattern.
15. **Currency mismatch between the tenant and a stale saved authorization.** Unchanged behaviour — `getPaystackKeyForCurrency` resolves off `compute_tenant_recurring_total`'s currency, as today.

---

# Tests Required

## Unit — Vitest, salon-admin (`apps/salon-admin/src`)

- `hooks/useSubscriptionLifecycle.test.ts` — the state → single-primary-action table, one case per state: `trialing`, `active`, `active` with no `next_billing_at`, cancellation-pending, `canceled`, `past_due` in grace, `suspended`. This is the test that protects requirement 22.
- `components/billing/BillingStateBanner.test.tsx` — renders for `past_due` and `suspended`, not for `active`/`trialing`; shows amount, deadline and consequence; owner sees the settle action, non-owner sees the contact line; not colour-only (an icon and text carry the state — assert on accessible text, not class names).
- `components/billing/CancelSubscriptionDialog.test.tsx` — Confirm disabled until a reason is chosen; access-end date rendered; invokes the function with the selected reason and trimmed note.
- `SalonSidebar.test.tsx` — extend the existing mock set with `BillingStateBanner` and assert it is mounted.

## Unit — Vitest, backoffice

- `hooks/useSubscriptionLedger.test.tsx` — the extended row type maps through; ledger page renders each new state label with reason and timestamps (AC 5).

## Integration — Postgres (`supabase/tests/` via `supabase db test`, or the project's existing SQL-test harness)

- `is_tenant_operational`: `active` → true; `trialing` in/out of grace → true/false; `past_due` with a future deadline → **true**; `past_due` with a past deadline → false; `past_due` with a null deadline → false; `suspended` → false; `canceled` → false. This is the highest-value test in the set — it is the one function that can take a paying salon's storefront down.
- `request_subscription_cancellation`: owner succeeds and sets `subscription_cancel_at = next_billing_at`; non-owner raises `OWNER_ROLE_REQUIRED`; `trialing` raises; already-pending raises; invalid reason violates the CHECK.
- `resume_subscription`: clears all `cancellation_*` fields and leaves `next_billing_at` untouched; raises when nothing is pending; raises when the date has passed.
- `advance_billing_anchor`: monthly anchor 3 days in the past → anchor + 30d; monthly anchor 45 days in the past → anchor + 60d (still future); annual; null anchor → now + cycle.
- `compute_chain_price(..., 'annual')`: returns a total when annual tiers are complete; returns null when any tier in range lacks `price_per_location_annual`; the 3-arg call sites are unaffected.
- `compute_tenant_recurring_total`: chain + monthly unchanged; chain + annual with pricing configured includes the annual base; chain + annual without pricing raises `CHAIN_ANNUAL_PRICING_NOT_CONFIGURED`; non-chain plans unchanged.
- `billing_dunning_notices` unique index rejects a duplicate `(tenant_id, grace_started_at, notice_key)`.

## Integration — edge functions (Deno, against a local Supabase with a stubbed Paystack)

- `process-recurring-addon-billing` lifecycle pass: cancellation due → `canceled` + `next_billing_at` null + exactly one audit row; **run twice → still exactly one audit row and one email** (AC 14); grace expiry → `suspended` + one email; dunning threshold → one notice row, one email, second run sends nothing.
- Charge pass: cancellation-pending tenant with a due `next_billing_at` is **not** charged; third consecutive failure stamps `billing_grace_ends_at` and `past_due`; `billing_period_due_at` is stamped before the attempt and cleared on success.
- `verify-recurring-billing-retry-session`: from `past_due` → `active` with `next_billing_at` equal to the *anchor*-derived date, not now+cycle (AC 9); from `suspended` → `active`; declined charge mutates nothing and preserves the deadline (AC 10); replayed reference is a no-op (existing guard).
- `manage-subscription-cancellation`: 401/403/409 paths; happy path writes the audit row and sends the email.
- `create-checkout-session`: chain + annual without pricing → 400; with pricing → a `transaction/initialize` body containing **no** `plan` key (AC 18/requirement 21 — assert on the absence).
- `migrate-chain-annual-billing`: dry run mutates nothing; real run disables the subscription then realigns; re-run detects the already-migrated tenant and skips; a tenant with no reusable authorization is reported blocked and left untouched.

## End-to-end (Playwright, salon-admin)

- Owner cancels → pending state with the correct date → resumes → back to normal active state, no payment prompt anywhere in the flow (AC 1, AC 3).
- Non-owner on a subscription with a pending cancellation sees neither Cancel nor Resume (AC 2).
- `past_due` tenant: banner visible on at least two different authenticated routes; clicking through reaches the settle flow without leaving the app (non-functional requirement: single flow, no support contact).

---

# Verification

```bash
# Types / lint / unit tests across the workspace
pnpm lint
pnpm test

# Per-app, while iterating
pnpm --filter salon-admin test
pnpm --filter backoffice test

# Edge function typecheck (each changed function)
deno check supabase/functions/process-recurring-addon-billing/index.ts
deno check supabase/functions/manage-subscription-cancellation/index.ts
deno check supabase/functions/migrate-chain-annual-billing/index.ts
deno check supabase/functions/verify-recurring-billing-retry-session/index.ts
deno check supabase/functions/create-checkout-session/index.ts

# Migrations apply cleanly from scratch (catches the AD-3 enum-in-transaction trap)
supabase db reset

# Build
pnpm build
```

**Manual verification, Chain-annual migration (mandatory, both before and after — AD-9, AC 17).** Before: record for every chain+annual tenant their `next_billing_at`, their Paystack subscription code, and Paystack's `next_payment_date`. Run with `dryRun: true` and reconcile the report against that list. After the real run, re-check each tenant: Paystack subscription status is `disabled`, `tenants.next_billing_at` equals the recorded `next_payment_date`, and the charge pass has produced exactly one `recurring_addon_billing_charged` audit row for the period. Only then apply migration 6.

---

# Implementation Order

Items 1–15 (scope items 1 and 2) are independent of the Chain pricing decision and ship first. Items 16–23 (scope item 3) are gated on it.

1. Migration 1 — `subscription_status` enum gains `'suspended'`, **in its own file** (AD-3).
2. Migration 2 — lifecycle columns on `tenants`, the reason CHECK, the two partial indexes, `billing_dunning_notices` + its unique index + RLS.
3. Migration 3 — the `past_due` backfill statement, then the `is_tenant_operational` replacement, in that order, same file.
4. Migration 4 — `advance_billing_anchor` (declared `stable`).
5. Migration 7 — `request_subscription_cancellation` / `resume_subscription`.
6. Postgres integration tests for items 3–5. Run them before writing any TypeScript; `is_tenant_operational` is the highest-risk edit in this design.
7. `_shared/receipts.ts` — the four new email senders, following the existing `sendPaymentFailedEmail` shape and currency formatting.
8. New edge function `manage-subscription-cancellation` (cancel + resume + confirmation email).
9. Split `process-recurring-addon-billing` into `index.ts` / `charge.ts` / `lifecycle.ts`, moving the existing loop into `charge.ts` **with no behaviour change**. Commit this separately so the refactor is reviewable on its own.
10. Charge pass amendments: the two new `where` clauses, `billing_period_due_at` stamping, `billing_grace_ends_at` on retry exhaustion, and the zero-total restore path (edge case 9).
11. Lifecycle pass: cancellations due → dunning reminders → grace expiry, all as guarded updates with row-count checks (`BILLING_GRACE_PERIOD_DAYS` env var, default 14).
12. `verify-recurring-billing-retry-session` — anchor-based `next_billing_at`, clearing of grace/suspension state, `suspended` accepted as a source state.
13. `create-recurring-billing-retry-session` — accept `suspended`.
14. salon-admin: `useSubscriptionLifecycle`, `BillingStateBanner` (mounted in `SalonSidebar` beside `TrialBanner`), `CancelSubscriptionDialog`, the `SettingsPage` subscription-card changes, and deletion of the dead `SubscriptionBanner.tsx`.
15. backoffice: ledger function migration 8, hook row type, `SubscriptionLedgerPage` rendering of the new states. **Scope items 1 and 2 are shippable at this point.**
16. Migration 5 — `price_per_location_annual` and the cycle-aware `compute_chain_price`, with its unit tests.
17. backoffice `PlansPage` — an annual per-location price input alongside the monthly one, so the commercial decision can be entered when it is made.
18. New edge function `migrate-chain-annual-billing` plus `getPaystackSubscription` / `disablePaystackSubscription` helpers. Dry run works and mutates nothing.
19. **Gate:** annual Chain pricing entered in backoffice for every live currency; dry-run report reviewed against the pre-migration record (see Verification).
20. Run `migrate-chain-annual-billing` for real; verify each tenant per the post-migration checklist.
21. Migration 6 — `compute_tenant_recurring_total` includes the annual chain base price. **Never before item 20.**
22. `create-checkout-session` — delete `usesPaystackNativeSubscription`, the `plan`-code branch, and the `billing_mode: "paystack_subscription"` metadata; gate chain-annual on configured pricing.
23. Repository sweep: `grep -rn "usesPaystackNativeSubscription\|paystack_subscription\|subscription/create" supabase/ apps/` returns nothing outside the migration function's disable call (AC 18).

---

# Open Questions

Both of these are recorded resolutions, not blockers — the Planning Brief left them open and this design proceeds on the answers below. Either can be reversed by a human without redesign.

- Q: What is the Chain plan's annual price, including the per-location add-on model? -> A: Not answerable in engineering, and deliberately not needed to ship the code. AD-8 makes availability a *data* condition, so the engineering for scope item 3 ships and is tested with fixture pricing; going live is items 19–21, performed when the commercial answer exists. (decided autonomously)
- Q: Does an annual tenant who cancels mid-term get a refund or prorated credit? -> A: No refund, end-of-period access, exactly as the Planning Brief assumes. Implementing prorated credit would require a credit-balance concept that does not exist in this schema, and the brief puts refunds out of scope. If finance later wants it, the change is contained to `request_subscription_cancellation` and the confirmation email. (decided autonomously)
- Q: Should the masked card (`last4`/`brand`) on the subscription surface come from persisted columns or a live Paystack read? -> A: Persisted. If the authorization's display fields are not currently stored on `tenants`, add them at authorization-capture time in the two activation paths and the retry-verify path; the client must never call Paystack. If implementation finds they are already stored, use them as-is. Requirement 22's masked-card display degrades to "Card on file" without digits rather than blocking, if neither is true at implementation time. (decided autonomously)

One genuine engineering uncertainty remains, and it is small: **whether any export path in salon-admin resolves tenants through `public_booking_tenants`** rather than an authenticated query. If one does, suspension would break the "a salon keeps its own records" constraint. Edge case 13 flags it and the E2E/QA pass must confirm it; the fix, if needed, is to route that export off the public view — contained, and not architectural.
