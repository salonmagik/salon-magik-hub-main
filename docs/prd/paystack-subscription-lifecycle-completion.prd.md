# Original Request

> i want to implement paystack subscriptions in this project, including the subscription and billing flow and everything required to support subscriptions end to end.

Upstream research: `docs/research/2026-09-06-paystack-subscriptions-billing.md`

---

# Summary

Salon Magik Hub already runs a mature, deliberately self-managed Paystack billing engine: checkout and card-authorization capture, activation via webhook and redirect paths, a daily cron that computes the correct current total (plan + add-ons + promo) and charges the saved card, retry and dunning emails, plan-change proration, trial gating, and a backoffice ledger. "Implement subscriptions end to end" is therefore not a greenfield build — it is a request to finish the subscription **lifecycle**, which today has no defined ending.

Three terminals are missing or incomplete, and together they are what "end to end" means for this system:

1. **No self-service cancellation.** An owner can start a subscription but cannot stop one. Every cancellation today is a manual backoffice action.
2. **No terminal state after dunning.** After three failed charges a tenant is set to `past_due` and `next_billing_at` is frozen to `null`. Nothing happens after that — the tenant is never suspended, never downgraded, never re-attempted, and never resolved. This is the "subscriptions could go permanently unbilled" gap recorded in project memory, and it is a live revenue leak.
3. **One plan still bypasses the engine.** Chain-plan annual tenants still use Paystack's native `Subscription` object, the exact pattern the codebase documents as having caused silent stale pricing and unmonitored renewal failures. It remains only because no annual price exists for Chain's per-location add-on.

This brief scopes those three. It does not re-open checkout, proration, trials, or the promo engine, all of which work.

---

# Problem Statement

The subscription lifecycle has a beginning but no defined end. Owners cannot cancel without contacting support, tenants who stop paying occupy the product indefinitely at zero revenue with no automated resolution, and one plan/cycle combination is billed by a mechanism the team has explicitly decided is unsafe. The result is manual support load, unrecoverable revenue leakage, and a known correctness gap sitting in production.

---

# Business Goal

- Stop revenue leakage from tenants who are `past_due` indefinitely: either recover payment or release the account.
- Remove manual backoffice work from every cancellation, and capture cancellation reasons so churn is measurable rather than anecdotal.
- Eliminate the last Paystack-native Subscription path so all tenants bill through one auditable, monitored mechanism, with pricing that cannot go stale on upgrade.
- Reduce involuntary churn by giving owners a clear, self-service way to fix a failed payment before losing access.

---

# User Goal

A salon owner should be able to:

- See their current plan, billing cycle, next charge date and amount, and payment status without contacting support.
- Cancel their subscription themselves, understand exactly when access ends and what happens to their data, and reverse the cancellation before it takes effect.
- Understand immediately when a payment has failed, how long they have to fix it, and what they lose if they do not.
- Update their card and be restored to good standing without support intervention.

A Chain-plan owner should be able to buy an annual subscription on the same terms and with the same billing behaviour as every other plan.

---

# Scope

### 1. Self-service cancellation

- Owner-initiated cancellation from the subscription surface in salon-admin.
- Cancellation is **effective at period end**, not immediate: the tenant retains full paid access until the already-paid period expires.
- A cancellation-pending state is visible in the UI, with the exact access-end date, and can be reversed ("resume subscription") at any point before that date without a new payment.
- Structured cancellation reason captured at cancellation time (selectable reason plus optional free text).
- At period end the tenant transitions to a non-paying state and no further charges are attempted.
- Confirmation email on cancellation, stating the access-end date and that it can be reversed until then.
- Backoffice ledger reflects cancellation-pending and cancelled states, with reason and requesting user.

### 2. Terminal dunning path (closing the "permanently unbilled" gap)

- After retries are exhausted, `past_due` becomes a **time-bounded grace period** rather than a permanent resting state.
- During grace: the tenant keeps working but sees a persistent, unmissable in-app banner stating the amount owed, the deadline, and what is lost at the deadline; escalating reminder emails are sent across the window.
- The owner can settle from that banner by updating the payment method, which triggers an immediate retry of the outstanding amount.
- On successful settlement: status returns to `active`, `next_billing_at` resumes on the original cycle anchor, retry counters reset.
- At grace expiry without settlement: the tenant is **suspended** — staff/owner sign-in and read/export of existing data remain available, the public storefront and new bookings are disabled, matching the existing post-trial storefront lockout behaviour.
- A suspended tenant can self-restore at any time by paying the outstanding amount.
- Every state transition is written to the billing audit log and surfaced in the backoffice ledger.

### 3. Chain-annual onto self-managed billing

- Define an annual pricing model for the Chain plan, including its per-location add-on component, in the existing `plans` / `plan_pricing` structure.
- Move Chain-annual checkout onto the same authorization-capture path as every other plan/cycle.
- Retire the `usesPaystackNativeSubscription` branch and the native-Subscription code path entirely once no tenant depends on it.
- Migrate existing Chain-annual tenants off their native Paystack Subscriptions onto self-managed billing without double-charging, without gaps in coverage, and without changing the date they next pay.

### 4. Cross-cutting

- The subscription surface must clearly show: current plan and cycle, next billing date and amount, payment status, card on file (masked), and the primary action available in the current state (subscribe / update card / settle / cancel / resume).
- All new states are represented in the backoffice subscription ledger.

---

# Out of Scope

- Rewriting checkout initialization, plan-change proration ("quote and apply"), the promo-discount engine, add-on computation, or trial enforcement — all working and deliberately designed.
- Reintroducing Paystack-native Subscription objects anywhere.
- Any additional payment provider, or additional currency/market beyond the existing NG/GH split.
- Formal invoice or tax-document generation, receipt PDFs, or accounting-system integration.
- Pausing/snoozing a subscription (distinct from cancelling) — a separate feature if wanted later.
- Refunds or prorated credits on cancellation (see Constraints and Open Questions).
- Redesigning the backoffice ledger; only new states are added to it.
- Data deletion or retention policy changes for cancelled/suspended tenants beyond what already exists.
- Splitting the 4,587-line `SettingsPage.tsx` — a refactor decision that belongs to engineering, not to this brief.

---

# Functional Requirements

**Cancellation**

1. A user with the tenant `owner` role can request cancellation of an active subscription from the salon-admin subscription surface. No other role can.
2. Requesting cancellation records the cancellation reason (one selection from a fixed list, plus optional free text) and the requesting user.
3. A cancellation request sets an access-end date equal to the end of the currently paid period, and does not remove access before that date.
4. While cancellation is pending, no further recurring charge is attempted for that tenant.
5. While cancellation is pending, the subscription surface displays the pending state and the exact access-end date.
6. The owner can reverse a pending cancellation at any time before the access-end date, restoring normal billing on the original schedule with no new payment required.
7. On reaching the access-end date, the tenant transitions to a non-paying state and the storefront/booking lockout applies.
8. A cancellation confirmation email is sent on request, stating the access-end date and that the request can be reversed until then.

**Dunning terminal path**

9. When recurring-billing retries are exhausted, the tenant enters `past_due` with a recorded grace-period end date.
10. A tenant in `past_due` sees a persistent in-app banner on every authenticated screen showing the outstanding amount, the grace deadline, and the consequence of the deadline passing.
11. Reminder emails are sent at defined intervals during the grace period, each linking directly to the settle/update-payment action.
12. Updating the payment method while `past_due` immediately attempts a charge for the outstanding amount.
13. A successful settlement charge returns the tenant to `active`, resets the retry counter, and resumes `next_billing_at` on the original cycle anchor (the owner does not gain or lose paid days from the failure).
14. A failed settlement charge leaves the tenant in `past_due` with the grace deadline unchanged, and surfaces the failure reason in the UI.
15. At grace expiry without settlement, the tenant is suspended: authenticated sign-in and read/export of existing data remain available; the public storefront and new-booking creation are disabled.
16. A suspended tenant can pay the outstanding amount at any time and be restored to `active`.
17. Every billing state transition (active → past_due → suspended → active, and all cancellation transitions) writes an audit entry identifying the trigger (cron, owner action, or backoffice action).

**Chain-annual**

18. The Chain plan has an annual price, inclusive of its per-location add-on model, defined in the same pricing structure as every other plan.
19. Chain-annual checkout captures a reusable card authorization on the same path as every other plan and cycle, and creates no Paystack-native Subscription.
20. Existing Chain-annual tenants are migrated to self-managed billing such that they are charged exactly once for their next period, on the same date they would have been charged natively.
21. After migration, no code path creates or depends on a Paystack-native Subscription object.

**Surface**

22. The subscription surface displays, for every state: current plan, billing cycle, next billing date, next billing amount, payment status, masked card on file, and the single primary action valid in that state.
23. The backoffice subscription ledger displays cancellation-pending, cancelled, past_due-with-deadline, and suspended states, with reason and timestamps.

---

# Non-functional Requirements

- **Reliability**: no tenant may be charged twice for the same period during the Chain-annual migration; no tenant may lose paid days they have already purchased.
- **Reliability**: state transitions must be idempotent — a re-run of the daily job must not double-apply a suspension, a cancellation, or a settlement.
- **Auditability**: every billing state change must be reconstructable after the fact from the audit log, including who or what caused it.
- **Usability**: from seeing a payment-failure banner, an owner must be able to reach a successful settlement in a single flow without leaving the app or contacting support.
- **Accessibility**: banners and state messaging must meet the accessibility standard already applied across salon-admin, and must not rely on colour alone to convey payment state.
- **Communication**: dunning and cancellation emails must state amounts and dates in the tenant's own billing currency (NG/GH).

---

# User Flow

**Cancelling**

Owner opens Subscription → sees plan, next charge date and amount → chooses Cancel → is shown the access-end date and what is lost → selects a reason → confirms → surface shows "Cancellation pending, access until <date>" with a Resume action → confirmation email arrives → on the access-end date access to storefront/bookings ends.

**Reversing**

Owner opens Subscription during pending cancellation → chooses Resume → billing resumes on the original schedule → surface returns to normal active state.

**Failed payment**

Daily charge fails → retried daily up to 3 times (existing behaviour) → retries exhausted → tenant enters past_due with a grace deadline → banner appears everywhere in-app, payment-failed email sent → reminder emails escalate across the window → owner clicks through, updates card → outstanding amount is charged immediately → success returns tenant to active on the original cycle anchor, banner clears.

**Grace expiry**

Grace deadline passes unsettled → tenant is suspended → storefront and new bookings disabled, existing data still readable and exportable → owner is shown a settle-to-restore screen → paying restores full access.

**Chain annual**

Chain owner selects annual at checkout → sees the annual price including per-location cost → pays → card authorization is captured → billing thereafter runs on the same self-managed annual cron as every other annual tenant.

---

# Constraints

- Only the tenant `owner` role may take billing actions (existing platform rule).
- All pricing and messaging must respect the existing NG/GH currency split; a tenant is billed in one currency only.
- Cancellation is end-of-period; the business does not refund unused time (see Open Questions for the annual case).
- A suspended or cancelled tenant must retain read and export access to their own data — the business does not withhold a salon's own records over a billing dispute.
- The Chain-annual migration must not change any existing tenant's next payment date or amount without prior notice to that tenant.

---

# Assumptions

*Autonomous-mode decisions. Each is a question that would otherwise have been asked; any one can be reversed by a human.*

- Q: The research brief could not determine what incremental capability "implement subscriptions end to end" actually means, given the mature existing engine. -> A: It means completing the subscription **lifecycle** — cancellation, a terminal dunning path, and eliminating the last native-Subscription carve-out — not rebuilding checkout or recurring billing, which already work and were deliberately designed. Rebuilding would contradict explicit reasoning left in the code. (decided autonomously)
- Q: Should cancellation be immediate or effective at period end? -> A: Period end. The customer has already paid for the period; immediate cutoff invites refund disputes and is the less conventional choice. (decided autonomously)
- Q: Should a `past_due` tenant be hard-locked out at grace expiry, or partially restricted? -> A: Partially restricted — suspend the public storefront and new bookings, keep authenticated read/export. This mirrors the existing post-trial storefront lockout, so it introduces no new lockout concept, and withholding a salon's own client records over billing is not defensible. (decided autonomously)
- Q: How long is the grace period after retries are exhausted? -> A: Scoped as a configurable window with a default of 14 days; the exact default is a business dial, not a structural decision, and is safe to change later. (decided autonomously)
- Q: Does a settled `past_due` tenant get their billing anchor moved forward, or keep the original? -> A: Original anchor. Moving it gives away free days on every payment failure and drifts every tenant's billing date over time. (decided autonomously)
- Q: Should the Chain-annual native-Subscription path be retained alongside the new one? -> A: No — retire it entirely once migrated. Leaving two billing mechanisms alive preserves exactly the failure mode (stale pricing on upgrade, unmonitored renewals) the codebase documents as the reason for the self-managed design. (decided autonomously)
- Q: Is a payment-method update UI already present in `SettingsPage.tsx`? -> A: Assumed yes, at least partially — shipped dunning emails already link to `/salon/subscription?billing=update_payment_method`. Engineering should verify and complete rather than build from scratch. Flagged because `SettingsPage.tsx` was not fully read during research. (decided autonomously)
- Q: Should cancellation reasons be free text or structured? -> A: Structured list plus optional free text, so churn reasons are countable. (decided autonomously)

Non-autonomous assumptions:

- The `20260906140000_annual_billing_self_managed.sql` migration closes the *annual native-Subscription* portion of the "permanently unbilled" gap in project memory, but not the *post-dunning terminal* portion, which is why requirement set 9–17 exists.
- Existing trial enforcement, promo consumption, and plan-change proration continue to behave as they do today; this work does not alter them.

---

# Risks

- **Churn acceleration**: making cancellation self-service removes a friction point that currently retains some tenants. Mitigated by the reversible pending-cancellation window and by capturing reasons, but a measurable churn increase is a real possibility and should be watched.
- **Goodwill damage from wrongful suspension**: suspending a paying salon's storefront because of a card issue on the salon's side is highly visible to *their* customers. The grace window, escalating warnings, and one-click settlement exist to make this rare; the risk is not zero.
- **Migration exposure**: moving live Chain-annual tenants between billing mechanisms risks a double charge or a missed period. Either is a direct customer-trust cost and needs an explicit verification step before and after.
- **Pricing decision blocks delivery**: the Chain annual price does not exist yet and is a business call. If it is not made, scope item 3 cannot ship, though items 1 and 2 can ship independently.
- **Support-load shift**: suspension introduces a new "why is my storefront down" contact reason. Messaging quality directly determines whether this nets out positive.

---

# Open Questions

*Genuinely undecidable without information nobody has yet — these do not block the rest of the brief.*

- **What is the Chain plan's annual price, including the per-location add-on model?** A pricing/commercial decision. Required before scope item 3 can ship; items 1 and 2 are unaffected.
- **Does an annual tenant who cancels mid-term get any refund or credit?** A finance/policy decision. This brief assumes no refund and end-of-period access; if the business wants prorated credit, requirement 3 changes.
- **How long should a suspended tenant's account persist before any further action?** Not decided here and deliberately out of scope, but the business will eventually need an answer.

---

# Acceptance Criteria

**Cancellation**

1. Given an active subscription, when the owner cancels and confirms, then the surface shows "cancellation pending" with the access-end date, a confirmation email is sent, and no further charge is attempted.
2. Given a pending cancellation, when a non-owner opens the subscription surface, then no cancel or resume action is available to them.
3. Given a pending cancellation, when the owner resumes before the access-end date, then billing resumes on the original schedule and no new payment is taken.
4. Given a pending cancellation, when the access-end date passes, then the storefront and new bookings are disabled and no charge is attempted.
5. Given a cancellation, when backoffice opens the subscription ledger, then the cancellation reason, requesting user, and access-end date are visible.

**Dunning**

6. Given a tenant whose retries are exhausted, when the daily job runs, then the tenant is `past_due` with a grace deadline recorded and a payment-failed email sent.
7. Given a `past_due` tenant, when any authenticated user opens any screen, then a banner shows the outstanding amount, the deadline, and the consequence.
8. Given a `past_due` tenant, when the owner updates the payment method, then the outstanding amount is charged immediately and the result is shown inline.
9. Given a successful settlement, then the tenant is `active`, the retry counter is zero, and the next billing date is the original cycle anchor — not shifted by the failure.
10. Given a failed settlement, then the tenant remains `past_due` with the same deadline and the failure reason is shown.
11. Given a `past_due` tenant, when the grace deadline passes unsettled, then the storefront and new bookings are disabled while authenticated read and export still succeed.
12. Given a suspended tenant, when the outstanding amount is paid, then full access is restored.
13. Given any of the transitions above, when the audit log is inspected, then each transition appears exactly once with its trigger identified.
14. Given the daily job is run twice in the same day, then no state transition, charge, or email is applied twice.

**Chain-annual**

15. Given a Chain-plan owner at checkout, when annual is selected, then an annual price including per-location cost is shown and payment captures a card authorization.
16. Given a Chain-annual tenant, when the recurring job runs on their due date, then they are charged via the saved card by the same path as every other annual tenant.
17. Given an existing Chain-annual tenant, when migration runs, then their next charge date and amount are unchanged and exactly one charge occurs for that period.
18. Given the full codebase after migration, then no path creates a Paystack-native Subscription.

---

# Success Criteria

- **Revenue recovery**: the count of tenants sitting in an unresolved non-paying state for more than 30 days trends to approximately zero. This is the primary measure.
- **Dunning recovery rate**: a measurable share of tenants entering `past_due` settle before grace expiry. Establish the baseline in the first full cycle post-launch and track it thereafter.
- **Support deflection**: cancellations and payment-method updates handled without a support contact — targeting the large majority of both.
- **Billing uniformity**: zero tenants billed via Paystack-native Subscriptions.
- **Billing correctness**: zero double-charges and zero missed periods attributable to the Chain-annual migration.
- **Churn visibility**: every cancellation carries a structured reason, making churn reportable rather than anecdotal.
