# Original Request

> i want to implement paystack subscriptions in this project, including the subscription and billing flow and everything required to support subscriptions end to end.

---

# Summary

Salon Magik Hub already has a mature, largely self-managed Paystack subscription and billing engine covering checkout, activation, recurring charging, retries, dunning emails, plan changes, add-ons, promo discounts, and a backoffice ledger. This is not a greenfield build. The system has been actively evolved as recently as today (`20260906140000_annual_billing_self_managed.sql`), moving annual tenants off Paystack's native `Subscription` object onto the same self-managed saved-card cron used for monthly billing. One deliberate, documented gap remains: Chain-plan annual tenants still use Paystack's native Subscription because there is no annual pricing model for Chain's per-location add-on. Before any new work is scoped, "subscriptions" needs disambiguating against this existing system — see Unknowns.

---

# Current Behaviour

**Checkout & activation** (`supabase/functions/create-checkout-session/index.ts`): Owner-only. Initializes a Paystack `transaction/initialize` (not `subscription/create`) for the tenant's plan/currency/billing cycle. For all plans except Chain-annual, no `plan` code is sent — Paystack never creates a native Subscription; instead a one-time transaction captures a reusable card authorization. Chain-annual sends `plan` and lets Paystack manage that one case natively (`usesPaystackNativeSubscription`).

**Payment verification / activation** (`supabase/functions/verify-subscription-payment/index.ts`, and the `subscription_activation` branch in `_shared/payment-webhook-processor.ts` around line 301): sets `tenants.subscription_status = 'active'` and stores the returned `authorization_code`/`authorization_email` on the tenant for future off-session charging.

**Recurring billing** (`supabase/functions/process-recurring-addon-billing/index.ts`): a daily pg_cron job (`supabase/migrations/20260629000000_schedule_recurring_addon_billing.sql`) queries tenants with `next_billing_at <= now()` and a saved `paystack_authorization_code`, computes the total via `compute_tenant_recurring_total` (base plan price + add-ons + promo discount, in `supabase/migrations/20260906140000_annual_billing_self_managed.sql`), and calls Paystack's `charge_authorization` endpoint directly. On success it schedules the next charge (30 days for monthly, 365 for annual, via `getNextBillingAt`), logs an audit entry, consumes any promo use, and emails a receipt. On failure it increments `billing_retry_count`, retries daily up to `MAX_RETRY_ATTEMPTS = 3`, then sets `subscription_status = 'past_due'`, freezes `next_billing_at` to `null` (so it stops being picked up), and emails a payment-failed notice with a link to `/salon/subscription?billing=update_payment_method`.

**Plan pricing & management**: `plans` / `plan_pricing` tables hold monthly/annual prices per currency plus `paystack_plan_code_monthly` / `paystack_plan_code_annual`; backoffice's `PlansPage.tsx` and `sync-paystack-plan-pricing` edge function keep Paystack plan codes and local prices in sync. `create-plan-configuration-checkout-session` / `verify-plan-configuration-payment` handle mid-cycle plan/tier changes with proration ("quote and apply", `20260622030000_plan_configuration_quote_and_apply.sql`).

**Trial handling**: `useTrialEnforcement.tsx`, `TrialBanner.tsx`, `send-trial-expiry-reminders`, `send-trial-extension-notice`, and post-trial storefront lockout (`20260726000012_post_trial_storefront_lockout.sql`) gate access before a tenant ever reaches paid billing.

**Backoffice oversight**: `SubscriptionLedgerPage.tsx` / `useSubscriptionLedger.tsx` backed by `20260805130000_backoffice_subscription_ledger.sql` gives internal staff visibility into tenant billing state; `MigrateTenantBillingDialog.tsx` handles backfilling/migrating a tenant's billing record.

**UI entry point**: `apps/salon-admin/src/pages/salon/SubscriptionPage.tsx` is a thin wrapper rendering `SettingsPage scope="subscription"` — the actual subscription/billing UI (plan display, payment method, invoices, upgrade/downgrade) lives inside the large `SettingsPage.tsx` (4,587 lines, not fully read — out of scope for this brief per minimum-necessary-traversal).

---

# Affected Surfaces

No contract is being changed by this request as posed — it is a request to build a capability, and step 3b found that capability already substantially exists. No consumer-impact analysis applies until a concrete, incremental change is scoped against the existing system (see Unknowns). Skipping a full call-site sweep here; there is no schema/contract diff to trace yet.

---

# Existing Implementation & Placement

**Existing implementation**: Extensive and active. Paystack subscription/billing is implemented as a **self-managed billing engine**, not Paystack's native recurring-subscription product, deliberately: comments in `create-checkout-session/index.ts` and `compute_tenant_recurring_total` explain that Paystack-native subscriptions previously let tier upgrades silently keep billing the old price, and nothing monitored native renewal success/failure. The engine covers: checkout initialization, authorization capture, activation via webhook + verify function, a daily cron that computes and charges the correct current total (plan + add-ons + promo discounts) against the saved card, retry/dunning logic with emails, plan-change proration, trial gating, and backoffice ledger visibility. The one remaining native-Paystack-Subscription usage is Chain-annual, explicitly flagged in code as a known gap pending an annual Chain pricing model.

Relevant prior gaps already tracked in memory ([[project-payout-and-billing-gaps]]): withdrawal OTP routing to the platform's own Paystack contact rather than the salon's, and a note that "subscriptions could go permanently unbilled" — worth checking whether `20260906140000_annual_billing_self_managed.sql` (today's migration) already addresses the annual portion of that gap, since it explicitly closes the "unmonitored native renewal" hole for non-Chain annual tenants.

**Correct home**: This is a single-codebase project (Supabase edge functions + `apps/salon-admin`), not a monorepo with a shared/upstream package boundary for billing — there is no separate billing package to route this to. All billing logic already lives under `supabase/functions/` (edge functions), `supabase/migrations/` (schema + Postgres functions), and `apps/salon-admin/src/pages/salon/SettingsPage.tsx` + `apps/backoffice` (UI). Any new billing work belongs in these same locations, following the self-managed pattern already established rather than introducing Paystack-native subscriptions, per the explicit reasoning left in the code.

---

# Execution Flow

```
Owner clicks "Subscribe" (SettingsPage, scope=subscription)
    ↓
create-checkout-session (edge fn)
    → resolves plan_pricing + promo discount
    → Paystack transaction/initialize (one-time txn, saves card auth)
    ↓
Owner completes payment on Paystack-hosted page
    ↓
payment-webhook-gh / payment-webhook-ng → _shared/payment-webhook-processor.ts
    (intent === "subscription_activation")
    → tenants.subscription_status = 'active', stores authorization_code
  (verify-subscription-payment: same effect, for the browser-redirect/poll path)
    ↓
Daily cron → process-recurring-addon-billing (edge fn)
    → compute_tenant_recurring_total (Postgres fn: base price + add-ons + promo)
    → Paystack charge_authorization (off-session, saved card)
    → success: advance next_billing_at, log audit, send receipt email
    → failure: increment billing_retry_count, retry ≤3x, else subscription_status='past_due' + payment-failed email
```

---

# Relevant Files

- `supabase/functions/create-checkout-session/index.ts` — subscription checkout initialization; self-managed vs. Chain-annual native-subscription branching
- `supabase/functions/verify-subscription-payment/index.ts` — activation on redirect/poll path
- `supabase/functions/_shared/payment-webhook-processor.ts` — activation on webhook path (`subscription_activation` intent), invoice payment handling
- `supabase/functions/process-recurring-addon-billing/index.ts` — the recurring billing cron job: charge, retry, dunning, receipts
- `supabase/functions/_shared/paystack-helpers.ts` — `getPaystackKeyForCurrency`, `chargeAuthorization`, `getNextBillingAt`
- `supabase/migrations/20260906140000_annual_billing_self_managed.sql` — most recent change: moves annual tenants onto self-managed billing; documents the Chain-annual carve-out
- `supabase/migrations/20260629000000_schedule_recurring_addon_billing.sql` — pg_cron schedule for the recurring billing function
- `supabase/migrations/20260622030000_plan_configuration_quote_and_apply.sql` — plan/tier change proration
- `supabase/migrations/20260805130000_backoffice_subscription_ledger.sql` — backoffice ledger schema
- `apps/salon-admin/src/pages/salon/SubscriptionPage.tsx` — thin wrapper into `SettingsPage`
- `apps/backoffice/src/pages/SubscriptionLedgerPage.tsx`, `useSubscriptionLedger.tsx` — internal billing oversight
- `apps/salon-admin/src/hooks/useTrialEnforcement.tsx`, `TrialBanner.tsx` — trial-to-paid gating

---

# Relevant Components

- Edge Functions: `create-checkout-session`, `verify-subscription-payment`, `process-recurring-addon-billing`, `create-plan-configuration-checkout-session`, `verify-plan-configuration-payment`, `sync-paystack-plan-pricing`, `payment-webhook-gh`/`payment-webhook-ng`
- Postgres functions: `compute_tenant_recurring_total`, `compute_current_addon_total`, `compute_chain_price`, `get_active_subscription_promo_discount`, `consume_tenant_sales_promo_use`
- pg_cron job: `process-recurring-addon-billing` (daily)
- UI: `SettingsPage.tsx` (scope=subscription), `TrialBanner`, `PlanChangeBanner`, `SubscriptionBanner`
- Backoffice: `PlansPage`, `SubscriptionLedgerPage`, `MigrateTenantBillingDialog`

---

# Existing Constraints

- Only tenant `owner` role may initiate checkout (`create-checkout-session`, role check against `user_roles`).
- Currency-specific Paystack keys are resolved via `getPaystackKeyForCurrency` (NG/GH split, per SMS-provider-style dual-market pattern — see [[project-sms-provider-arkesel]] for the analogous NG/GH split elsewhere in the codebase).
- Native Paystack Subscription objects are deliberately avoided except for Chain-annual, due to a documented prior incident (silent stale pricing on tier upgrade, unmonitored renewal failures).
- Recurring billing retries a maximum of 3 times (daily cadence) before marking `past_due` and freezing `next_billing_at`.
- `next_billing_at IS NULL` tenants are excluded from the due-tenants query — this is the intentional freeze mechanism after retries are exhausted, not a bug.

---

# Existing Behaviour

- `next_billing_at` doubles as both the schedule and the "stop retrying" flag (set to `null` on exhausted retries) — any future change to the due-tenants query must preserve this or past_due tenants will start being retried again.
- Promo discounts on the subscription surface are computed pre-charge and only "consumed" (`consume_tenant_sales_promo_use`) after a successful charge — a failed charge does not consume promo usage.
- Chain-annual is the sole path still relying on Paystack-native Subscriptions; any change to the checkout/recurring-billing logic must special-case or explicitly extend this path rather than assuming the self-managed flow covers all plans.

---

# Unknowns

- `[product]` The request is described as "implement Paystack subscriptions... end to end," but investigation shows this already exists and has been recently and deliberately extended. It's unclear what incremental capability is actually wanted — e.g., closing the Chain-annual native-subscription gap, building the missing UI in `SettingsPage.tsx` for payment-method updates, adding subscription cancellation/downgrade-to-free flows, or something else not yet identified in code. A Planning Brief cannot proceed without this being narrowed.
- `[engineering - unresolved]` Whether `20260906140000_annual_billing_self_managed.sql` fully resolves the "subscriptions could go permanently unbilled" gap noted in [[project-payout-and-billing-gaps]], or only the annual-native-Subscription portion of it, was not verified — would require tracing the full history of that memory note's origin, which is out of scope for minimum-necessary investigation until the product question above is answered.

---

Routing: **planner** (default). The core `[product]` unknown — what specific subscription capability is actually being requested, given the mature existing system — is a scope/intent question, not something repository investigation can resolve, and it materially changes what gets built next.
