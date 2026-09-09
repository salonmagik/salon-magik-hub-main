# Original Request

> How should one person spanning several salons be modelled and represented? Two different
> scenarios are being conflated and the first job is to separate them with evidence: (a) Branches
> within one business — already supported (`locations`, `staff_locations`, the chain plan, Business
> Hub / `owner_hub`). Establish exactly what this already gives an owner and where it stops. (b) One
> identity holding roles at several separate businesses (`tenants`) — establish current facts, and
> whether it is a good idea. Also establish current facts for: owner removal being support-mediated
> (reassignment to an already-onboarded staff member); and the fact that the salon-admin co-ownership
> surface (owners list, invite entry point, role label in the sidenav profile block) is entirely
> unbuilt. Out of scope: co-owner-invite flow itself; payout-tables-rls.

---

# Summary

Two scenarios are already architecturally distinct in this codebase, not merely conflated in
conversation:

- **(a) Branches within one business** is fully built: a `chain`-plan tenant has multiple
  `locations`, staff are scoped to locations via `staff_locations`, and an owner (or a manager/
  supervisor with access to more than one location) gets a tenant-wide "Business Hub" (`owner_hub`)
  context alongside per-location contexts, all resolved server-side per `tenantId` by
  `resolve_user_contexts`. It stops at the tenant boundary — it has no concept of, and cannot cross
  into, a second `tenants` row.
- **(b) One identity across several separate tenants** is supported for every role *except*
  `owner`, and forbidden for `owner` by explicit, named, still-active design
  (`trg_enforce_single_owner_tenant`, `20260726000020`). Staff-role multi-tenancy already has its
  own UI (`TenantSwitcher.tsx`), its own storage key scheme, and is exercised in production; owner
  multi-tenancy has zero code path — it errors at the DB trigger.

Both connected, already-decided design questions have clear current-state answers, found below:
owner removal today is an untracked manual deactivation with no request surface and no audit trail
addition, and the co-owner UI surface (owners list, invite entry, sidenav role label) does not
exist anywhere in salon-admin — `UserProfileSection` renders only `user`/`profile`, never `role`.

---

# Current Behaviour

## (a) Branches within one business — built, tenant-scoped

A tenant's `locations` table holds its branches; `staff_locations` (composite key `tenant_id,
user_id, location_id`) assigns staff members to one or more of them
(`apps/salon-admin/src/hooks/useAuth.tsx:339-346`). Every read is scoped to a single `tenantId` —
there is no cross-tenant join anywhere in this path.

Context resolution (`useAuth.tsx:270-420`, function `resolveContexts`) calls the RPC
`resolve_user_contexts(p_tenant_id)` first, and falls back to an equivalent client-side computation
(`staff_locations` + `locations` queries, lines 328-420) if the RPC errors. Both paths compute the
same three things for a **single tenant**:

- `canUseOwnerHub`: true if `role === 'owner'`, or if `role` is `manager`/`supervisor` **and** they
  are assigned to more than one location (`useAuth.tsx:383-385`, client-fallback branch — the RPC
  path trusts `rpcData.can_use_owner_hub` from the server).
- `availableContexts`: an optional `{ type: "owner_hub", label: "Business Hub" }` entry, followed by
  one `{ type: "location", locationId, label }` entry per assigned location.
- `activeContextType` / `activeLocationId`: which context is currently active, persisted in
  `localStorage` per tenant (`getContextStorageKey(tenantId)`, `saveStoredContext`,
  `useAuth.tsx:198-208`) and revalidated against the current assignment set on every load
  (`ownerHubIsValid`, `locationIsValid`, lines 301-305 and 388-390) — a stale stored context (e.g.
  from a location the user was since unassigned from) is silently discarded.

`SalonSidebar.tsx` consumes this to switch the entire left-nav between a business-wide view
(`owner_hub`) and a location-scoped view; `TenantSwitcher.tsx:112` renders nothing tenant-switching
at all when the identity has only one tenant (`tenants.length <= 1`) — it degrades to a static
tenant-name display, confirming the switcher's actual job is scenario (b), not (a).

`subscription_plan` (`solo | studio | chain`, `packages/supabase-client/src/supabase/types.ts:9940`)
is the commercial gate referenced by the backlog as "the chain plan" — it was not re-verified here
beyond confirming the enum exists, since scenario (a)'s access-control mechanics (owner_hub,
locations, staff_locations) do not read `subscription_plan` directly in any file inspected; the
plan gates location-count/feature entitlement upstream of this access layer, not the per-branch
role resolution documented above.

**Where it stops:** every one of the mechanisms above takes a single `tenantId` as its scope.
`locations`, `staff_locations`, `resolve_user_contexts`, and the `localStorage` key are all
per-tenant. Nothing in this path reads or aggregates across more than one `tenants` row. Business
Hub is "all of this owner's locations in this one business" — it has no notion of a second
business at all. This is exactly the boundary the request asked to establish.

## (b) One identity across several separate tenants — supported for staff, forbidden for owner

`TenantSwitcher.tsx:109` destructures `tenants` (plural) from `useAuth`, and
`fetchTenantsAndRoles` (`useAuth.tsx:238-266`) builds that list from **every** `user_roles` row for
the signed-in `userId`, across all tenants, with no tenant filter — this is the genuine
multi-tenant identity path, and it already has UI: a dropdown listing every tenant the identity
holds a role at, with per-tenant role labels drawn from a local `ROLE_LABELS` map
(`TenantSwitcher.tsx:14-19`) and a `setCurrentTenant` switch.

This works today for `manager`, `supervisor`, `receptionist`, and `staff` roles — the comment in
the enforcing migration confirms this is a known, intentional case: *"a freelance stylist or
manager working across unrelated businesses"* (`20260726000020_single_owner_tenant.sql`).

It is explicitly and currently blocked for `owner`:

- `trg_enforce_single_owner_tenant` (migration `20260726000020`, function
  `enforce_single_owner_tenant()`) fires `before insert or update on user_roles` and raises
  `P0001` — *"This account already owns another salon. Each owner can only own one active salon at
  a time."* — whenever an insert/update would leave the same `user_id` an active owner of two
  different tenants.
- `check_owner_invite_email` (`20260908063000_co_owner_foundation.sql`) enforces the same rule one
  layer up, pre-flight, in the co-owner invite path: an identity that is already an active owner of
  a *different* tenant is reported `already_owner_other_tenant` and the invite flow stops before it
  would ever reach the trigger.
- `grant_tenant_co_owner` (same migration) does not re-check this itself — it relies on the trigger
  firing on its own `insert ... on conflict do update` (comment at the call site: *"trg_... fires on
  this insert/update and raises if the target already actively owns a different tenant (AC-6)"*).

So today, an identity can be `owner` of tenant A and simultaneously `manager` of tenant B (the
trigger only restricts the `owner` role; per AD-1/AD-3 of the second-owner-foundation design, a
non-owner role is untouched by these guards), but cannot be `owner` of both A and B. There is no
code path anywhere that grants a second active owner-role tenant to one identity; the only way to
observe the rule is the trigger raising on an attempt.

**Whether it is a good idea:** this is the product/UX decision the request itself frames as open —
see Unknowns. No repository evidence resolves it; the trigger's own comment documents the current
policy's rationale (owner is treated as a single-business identity) but not whether relaxing it is
desirable.

## Owner removal — support-mediated, decided; today unbuilt

No request surface, reassignment action, or audit trail exists for this. The only operative
mechanism today is what the design doc for the sibling item names directly: *"Today the only
mechanism is staff deactivating a `user_roles` row by hand — no request surface, no reassignment
path, no audit trail on a change of this consequence"* (`docs/backlog-open-followups.md`,
`owner-removal-support` entry — this is a direct statement of current fact, not a proposal).

Verified independently from the schema: `user_roles.is_active` is the deactivation flag consumed
throughout the just-shipped co-owner work (`is_tenant_owner`, `grant_tenant_co_owner`,
`getSalonRecipients`) — so "deactivating a row by hand" means flipping this column, most plausibly
today only reachable via direct database/backoffice SQL access, since no edge function in
`supabase/functions/` was found (grep of the co-owner design's Components/Changed lists) that
deactivates an *owner* row specifically; the nearest analogue, `update_staff_role`, is referenced
in the design doc (AD-3 "Rejected" note) only for non-owner roles.

Two backoffice functions exist for owner *grants*:
`backoffice-add-tenant-owner` (recovery — requires **zero** active owners) and
`backoffice-add-tenant-co-owner` (requires **exactly one**), each writing a distinct
`audit_logs` action (`backoffice.owner_added` vs. `backoffice.co_owner_added` per AD-2/AD-3 of the
co-owner design). Neither function removes/deactivates an owner as part of its own operation
(`backoffice-add-tenant-owner`'s zero-owner precondition presumes removal already happened by some
other means). So: an audit trail convention already exists and is actively used for *additions*
(`audit_logs`, keyed by a named `action` string) — a removal/reassignment action would extend that
same table and convention, not invent a new one. No code path writes an `audit_logs` row for a
`user_roles` deactivation today.

## Co-ownership salon-admin surface — entirely unbuilt

Verified by direct inspection, not inference:

- **No owners list.** `get_tenant_owners` (the RPC that lists a tenant's active owners) is
  `security definer`, self-gated on `has_backoffice_role(auth.uid(), 'super_admin')`
  (`20260908063000_co_owner_foundation.sql`) — it is callable only from backoffice, by design (F-3
  / AD-2 in the co-owner design doc), and no salon-admin file references it. `grep` for
  `get_tenant_owners` outside `supabase/migrations` and the backoffice `AddCoOwnerDialog.tsx` /
  `useTenants.tsx` / `TenantsPage.tsx` files named in the design doc's Components section returns
  nothing in `apps/salon-admin`.
- **No invite entry point.** The invite/grant flow (`backoffice-add-tenant-co-owner`) is invoked
  only from `apps/backoffice/src/components/AddCoOwnerDialog.tsx` per the design doc's Components
  list; `co-owner-invite` (the backlog item that would build an owner-facing, in-salon-admin invite
  flow) is explicitly listed `status: pending`, `requires: co-owner-role` — i.e. not started.
- **No role label in the sidenav profile block.** `UserProfileSection`
  (`apps/salon-admin/src/components/layout/SalonSidebar.tsx:96-146`) destructures only `{ user,
  profile }` from `useAuth()` — `currentRole` (which the hook does expose, consumed elsewhere by
  `TenantSwitcher.tsx:109` and `CopyBookingLinkButton`) is never read here. The rendered block shows
  `displayName` (from `profile.full_name`, falling back to the email's local part) and
  `displayEmail` only; no role, no "Owner"/"Co-owner" distinction, for any user regardless of role.

**What a role label would affect if added:** purely additive/presentational — `currentRole` is
already computed and threaded through `AuthContext` (confirmed by its use two call sites away in
the same file's sibling component); adding it to `UserProfileSection` requires no new data
fetching, no RLS change, and touches no permission check (permission checks read `currentRole` /
`user_roles` directly server-side and client-side elsewhere, never through this sidenav display).
The existing `ROLE_LABELS` map in `TenantSwitcher.tsx:14-19` (`owner: "Owner"`, etc.) is the only
place a human-readable role string is currently produced in salon-admin; it is a local `const`, not
an export, so a sidenav label would need its own copy or a shared extraction — neither exists yet.

---

# Affected Surfaces

This is an investigation-only request with no change implied (per the task framing: "INVESTIGATION
ONLY... Produce the Technical Brief; do not write product code"). Step 3 (consumer search) is
therefore not applicable — no contract is being changed here.

---

# Existing Implementation & Placement

**Existing implementation:** Scenario (a) is fully implemented (`locations`, `staff_locations`,
`resolve_user_contexts`, `owner_hub` context in `useAuth.tsx`/`SalonSidebar.tsx`). Scenario (b) is
half-implemented: the multi-tenant-identity mechanism (`user_roles` with no owner restriction,
`TenantSwitcher.tsx`, `fetchTenantsAndRoles`) exists and is live for non-owner roles; the owner
case is deliberately *prevented*, not unbuilt — `trg_enforce_single_owner_tenant` is active,
tested-by-comment code, not a gap. Owner removal/reassignment has no implementation beyond raw
`user_roles.is_active` toggling. The co-owner *display* surface in salon-admin (as opposed to the
already-shipped backoffice grant surface) has no implementation at all.

**Correct home:** All of the above lives in this repository under `apps/salon-admin`,
`apps/backoffice`, and `supabase/migrations`/`supabase/functions` — the same placement the sibling
`second-owner-foundation.design.md` (AD-9) already established for co-ownership: *"Tenant/ownership
modelling is not owned by any shared package — `packages/shared`, `packages/ui` and
`packages/supabase-client` contain no ownership logic... No `CLAUDE.md` or project doc states a
placement rule for this kind of change."* Nothing found during this investigation contradicts that
conclusion for the multi-salon-identity question either: `locations`, `staff_locations`,
`user_roles`, and the context-resolution RPCs are all in `supabase/`, and their only consumers are
`apps/salon-admin` and `apps/backoffice`.

## Prior memory note

`docs/design/second-owner-foundation.design.md` is the relevant prior design doc in this same
directory tree (`docs/design/`, `docs/research/`, `docs/prd/` for this feature family). It is not a
separate "notes" file in the reviewer-memory naming convention, but it directly bears on this
investigation and was read in full: it names three findings (F-1 payout/withdrawal
authorization gap, F-2 dual-role-row billing breakage, F-3 backoffice singleton-owner assumption)
and ten architecture decisions (AD-1 through AD-10), all already implemented in
`20260908063000_co_owner_foundation.sql` and the associated edge functions. It also explicitly
scoped out `payout-tables-rls` and named `co-owner-invite` as the very next item — both confirmed
still `pending`/listed as out-of-scope in `docs/backlog-open-followups.md`, consistent with this
investigation's Out of Scope instruction.

---

# Execution Flow

Scenario (a), one business, per-tenant:

```
useAuth (tenantId fixed)
    ↓
resolve_user_contexts(p_tenant_id)  [RPC, falls back to client-side staff_locations+locations query]
    ↓
{ canUseOwnerHub, availableContexts[], activeContextType, activeLocationId }
    ↓
SalonSidebar — Business Hub vs. per-location nav
```

Scenario (b), several businesses, per-identity:

```
useAuth.fetchTenantsAndRoles(userId)   [no tenant filter — every user_roles row for this user]
    ↓
tenants[], roles[]
    ↓
TenantSwitcher — dropdown of every tenant this identity holds a role at
    ↓
setCurrentTenant(tenantId) → re-enters scenario (a)'s flow scoped to the new tenantId
```

Owner-specific guard on (b):

```
insert/update user_roles (role='owner', is_active=true)
    ↓
trg_enforce_single_owner_tenant  → P0001 if already an active owner of a different tenant
```

---

# Relevant Files

- `apps/salon-admin/src/hooks/useAuth.tsx` — `fetchTenantsAndRoles` (multi-tenant identity list,
  no owner restriction), `resolveContexts`/`resolveContexts` fallback (per-tenant Business Hub /
  location resolution), `parseStoredContext`/`saveStoredContext` (per-tenant `localStorage` keys).
- `apps/salon-admin/src/components/layout/TenantSwitcher.tsx` — the actual scenario-(b) UI; also
  holds the only existing role-label map (`ROLE_LABELS`) and the `tenants.length <= 1` degrade path
  that shows scenario (a) has no separate switcher of its own.
- `apps/salon-admin/src/components/layout/SalonSidebar.tsx` — `UserProfileSection` (confirmed:
  reads only `user`/`profile`, never `currentRole`), consumes `owner_hub` context for nav shape.
- `supabase/migrations/20260726000020_single_owner_tenant.sql` — the active owner-multi-tenancy
  restriction and its stated rationale.
- `supabase/migrations/20260908063000_co_owner_foundation.sql` — `is_tenant_owner`,
  `check_owner_invite_email`, `get_tenant_owners`, `grant_tenant_co_owner`; confirms the trigger is
  still relied upon (not superseded) by the newly-shipped co-owner grant path.
- `docs/design/second-owner-foundation.design.md` — prior design decisions this item builds on;
  read for AD-1–AD-10, F-1–F-3, and explicit scope exclusions.
- `docs/backlog-open-followups.md` — source of the owner-removal-support current-state statement
  and confirmation of what remains out of scope (`payout-tables-rls`, `co-owner-invite`).

---

# Relevant Components

- **Context resolution**: `resolve_user_contexts` RPC + `useAuth.tsx` client fallback — scenario
  (a)'s engine.
- **Identity/role fetch**: `fetchTenantsAndRoles`, `normalizeUserRoles` — scenario (b)'s engine.
- **DB trigger**: `enforce_single_owner_tenant` — the active policy boundary for scenario (b).
- **RPCs**: `is_tenant_owner`, `check_owner_invite_email`, `get_tenant_owners`,
  `grant_tenant_co_owner` — all tenant-scoped, all shipped for co-ownership, none aware of
  cross-tenant identity beyond the single-owner-tenant check.
- **UI**: `TenantSwitcher.tsx` (scenario b), `SalonSidebar.tsx`/`UserProfileSection` (no role
  display today).

---

# Existing Constraints

- `trg_enforce_single_owner_tenant`: an identity may be active `owner` of at most one tenant. Not a
  bug or oversight — named, commented, and still depended upon by the just-shipped
  `grant_tenant_co_owner` path (which relies on it firing rather than duplicating the check).
- Non-owner roles are unrestricted across tenants today — any relaxation of the owner restriction
  would be extending existing precedent, not introducing a wholly new capability class.
- `UNIQUE(user_id, tenant_id, role)` on `user_roles` permits one row per role per tenant, not one
  row per tenant — this is what allowed the F-2 dual-role-row bug the co-owner design fixed with
  AD-3's promote-in-place invariant. Any future change here should preserve that invariant rather
  than reopen it.
- `get_tenant_owners` is gated to backoffice/`super_admin` only, by design (AD-2) — it cannot be
  called from salon-admin as-is if an owners list were ever wanted there; that would need either a
  new RPC or a relaxed grant, which is itself a design decision, not investigated further here as
  it is out of scope (co-owner-invite territory).

---

# Existing Behaviour

- Stale stored contexts (a `localStorage` context pointing at a location the user lost access to)
  are silently discarded and replaced with a safe default, both in the RPC path and the client
  fallback (`useAuth.tsx:301-305`, `388-390`) — any future change to who "counts" as valid for a
  context should preserve this self-healing behaviour rather than surface a broken context.
- Audit logging for ownership changes currently only exists for *additions*
  (`backoffice.owner_added`, `backoffice.co_owner_added`), keyed by a distinct `action` string per
  operation type — this is the established convention a future removal/reassignment audit entry
  should follow.

---

# Unknowns

- Whether relaxing `trg_enforce_single_owner_tenant` to allow one identity to actively own multiple
  separate tenants is desirable, and if so under what conditions (e.g. does the Business Hub
  concept need to extend across tenants, or would multi-tenant owners just use the existing
  `TenantSwitcher` the way multi-tenant staff do today). **[product]** — no repository evidence
  resolves this; it is exactly the "whether it is a good idea" question the request poses.
- Whether an owners list / role label in salon-admin is wanted now, and what it should show for
  co-owners specifically (both owners equally, or some visual distinction despite AD-1/AD-3's
  explicit "no primary owner" stance). **[product]** — the *feasibility* is answered above
  (cheap, additive, no schema/permission change required); *whether and what to show* is a product
  call.
- Scope and trigger of the owner-removal request surface (who can initiate it in-product, what
  information support needs to act on it, what "already-onboarded staff member" is checked against
  at the point of reassignment). **[product]** — `owner-removal-support` in the backlog is `status:
  pending` with scope described only at the level quoted above; no design or planning artifact for
  it exists yet to investigate further.

---

# Addendum: multi-tenant "salon-splitting" gaming surface (planner follow-up, five facts)

Planner's follow-up question: since one identity can hold `owner` role sequentially (though not
simultaneously) across many tenants, and can self-serve create tenants, does splitting one business
into several separate solo-plan tenants let that identity extract more value (cheaper pricing, more
free allowance, fresh trials) than running one correctly-plan-sized tenant? Five sub-questions,
answered below with direct evidence. Out of scope, unchanged: `co-owner-invite`, `payout-tables-rls`.

## 1. Plan price ladder — splitting into N solo tenants is cheaper than one chain tenant with N locations

Two parallel pricing definitions exist:
- `apps/salon-admin/src/lib/pricing.ts` — hardcoded `PRICING` map (USD/NGN/GHS ×
  solo/studio/chain), used only by `SettingsPage.tsx` for in-app plan display.
- DB tables `plans`/`plan_pricing`/`plan_limits`/`plan_features`
  (`supabase/migrations/20260204102647_9be81454-7f7d-4c60-806f-9d024961a614.sql`) — the live source
  at onboarding: `usePlans.tsx` is read by `components/onboarding/PlanStep.tsx`, not the hardcoded
  file.

Representative USD figures (`pricing.ts:12-32`): solo $15/mo, studio $30/mo, chain $45/mo base
(chain has no annual option — `annual: 0`) plus additional-location pricing of +$30/location for
locations 2-3, +$20/location for 4-10, custom quote above that (also DB-backed via
`additional_location_pricing` / `compute_chain_price`).

Solo-splitting is cheaper at every location count checked:
- N=2: 2×solo = $30/mo vs. chain(2) = $45+$30 = $75/mo
- N=3: 3×solo = $45/mo vs. chain(3) = $45+$30+$30 = $105/mo
- N=10: 10×solo = $150/mo vs. chain(10) = $45+(2×$30)+(7×$20) = $245/mo

The gap widens with N. This is a verified, decisive fact, not a hypothetical.

## 2. Trials and promo codes — each new tenant gets a fresh trial; no cross-tenant identity check

`TRIAL_DAYS = 14` (`pricing.ts:34`; DB `plans.trial_days` defaults to 14 in the same migration,
DB authoritative at runtime). `trial_ends_at` is set once per **tenant** at signup
(`OnboardingPage.tsx:332-336`, written directly into the `tenants` insert) — nothing in this path
checks the signing-up identity's email/phone against any *prior* tenant before granting a fresh
trial. A promo-code mechanism (`validate_sales_promo_code_for_email` RPC,
`OnboardingPage.tsx:283`; migrations `20260726000014_promo_trial_bonus.sql`,
`20260726000021_gate_promo_code_permission.sql`) can add bonus days on top of the base 14 via
`trial_ends_at = coalesce(trial_ends_at, now()) + make_interval(days => v_bonus_days)`. The RPC's
own body (whether it blocks the same email reusing the same promo code across multiple tenant
signups) was not read — **[engineering - unresolved]**, listed below, not blocking the finding
above. `tenant_trial_overrides` (`useActiveTrialOverride.tsx`) is a separate, backoffice-gifted,
per-tenant, support-mediated extension mechanism, not self-serve.

## 3. Free SMS/message allowance — resets by name only; no code path performs the reset

`plan_limits.monthly_messages` (default 30) is the per-plan free-message ceiling
(`usePlans.tsx:17`); `pricing.ts` display strings match it (solo 30/mo, studio 100/mo, chain
500/mo, `pricing.ts:53,60,69`). Actual consumption is tracked in a separate, per-tenant table,
`communication_credits` (`balance integer`, `free_monthly_allocation integer default 30`,
`last_reset_at timestamptz default now()` —
`supabase/migrations/20260202153323_b091afde-b00c-4426-be85-828353808400.sql:349-355`). Every
message send (`send-bulk-message/index.ts`, `send-manual-message/index.ts`) checks and decrements
this same `communication_credits.balance` via the atomic RPC `deduct_communication_credits`
(`supabase/migrations/20260704000002_deduct_communication_credits_fn.sql`) — i.e. free allowance
and paid top-up credits share one balance, not two separate counters.

**No reset mechanism exists.** Grepped every migration and function referencing
`free_monthly_allocation` or `last_reset_at`
(`20260202153323_...sql`, `20260805140000_comms_credits_backoffice.sql`) — the only other hit is a
backoffice read RPC (`get_tenant_comms_credits` equivalent in `comms_credits_backoffice.sql:12-41`)
that surfaces these three columns for display; nothing writes to `balance` or `last_reset_at` on a
monthly cadence. Cross-checked every `cron.schedule` call in `supabase/migrations` (birthday
messages, daily digest, appointment reminders, trial-expiry reminders, plan-change batch,
recurring addon billing) — none touches `communication_credits`. `sms-credit-pricing.ts` (the
other file with "credit" in its name) computes only paid-bundle pricing tiers from
`platform_settings`, unrelated to the free allowance or its reset.

So `free_monthly_allocation` and `last_reset_at` are schema present, written once at row creation,
and never referenced again — the free quota is effectively a one-time balance for the life of the
tenant, not a monthly-resetting one, for every tenant regardless of plan. This means: (a) the
"resets per salon" premise in the follow-up question doesn't hold today — it doesn't reset at all,
for anyone; and (b) whatever the true behaviour, one identity creating N solo tenants each starts
its own fresh `communication_credits` row at 30, i.e. `30×N` starting balance versus 500 on one
chain tenant, the same multiplication shape as the price-ladder finding, just against a
one-time balance rather than a monthly one.

## 4. Tenant creation — self-serve, client-driven, not backoffice-gated

Confirmed by direct inspection, not inference:
- `apps/salon-admin/src/App.tsx:181-187` — `/signup` is `PublicOnlyRoute` (open to anyone not
  already logged in).
- `apps/salon-admin/src/App.tsx:202-209` — `/onboarding` requires only auth (`OnboardingRoute`),
  no completion gate, no backoffice approval step.
- `OnboardingPage.tsx:320-333` (`handleSubmit`) inserts directly into `tenants` from the client
  (`plan: selectedPlan, subscription_status: "trialing", trial_ends_at: onboardingTrialEndsAt`),
  then immediately inserts the `owner` `user_roles` row for that same user on the new tenant
  (`OnboardingPage.tsx:339-343`) — no edge function or backoffice approval in between either step.

Any authenticated identity can create an arbitrary number of tenants, each immediately self-owned,
each starting its own fresh trial and its own fresh `communication_credits` balance, with no human
review. The only currently-active guard is `trg_enforce_single_owner_tenant` (documented in Current
Behaviour above) — and it blocks holding two tenants as active `owner` *simultaneously*, not
creating many tenants *sequentially* (create → own solo-plan → let trial/credits lapse or downgrade
→ repeat), and does not check email/phone against the identity's own tenant history. This directly
answers the planner follow-up's framing question: tenant creation is not a process gate that closes
off the gaming routes in findings 1-3.

## 5. Delinquency/suspension — tenant-scoped only; no cross-tenant effect, and does not lock salon-admin itself

Lifecycle (`tenants.subscription_status`: `trialing`, `active`, `past_due`, `canceled`, `paused`,
`suspended`, `permanently_deactivated`):
- `active → past_due` on payment failure; a 14-day grace period is granted
  (`billing_grace_ends_at`, set in `process-recurring-addon-billing`'s billing-failure path; backfill
  reference in `supabase/migrations/20260906180200_is_tenant_operational_lifecycle.sql:6-10`).
- Within grace, `is_tenant_operational()` still returns true
  (`is_tenant_operational_lifecycle.sql:39-40`).
- Grace expiry moves the tenant to `suspended`
  (`supabase/functions/process-recurring-addon-billing/lifecycle.ts:223`,
  `subscription_status: "suspended", suspended_at: now()`).
- `suspended` (and `canceled`/`paused`) → `is_tenant_operational()` returns false
  (`is_tenant_operational_lifecycle.sql:41-45`, scoped to a single `p_tenant_id` — `from
  public.tenants t where t.id = p_tenant_id`, no identity/user join anywhere in this function).
- The only consumer of `is_tenant_operational` found is
  `supabase/functions/create-public-booking/index.ts:251` — the customer-facing public booking
  storefront. `grep -rn "is_tenant_operational" apps/salon-admin/src` returns only comments
  (`BannerContext.tsx`, `useActiveTrialOverride.tsx`), never an actual gating call.
- **Salon-admin itself is not route-gated by suspension.** `BannerContext.tsx:206-224` documents
  (in its own inline comment) that a prior blocking overlay for `past_due` was deliberately removed
  — replaced by `BillingStateBanner` (mounted in `SalonSidebar`), confirmed non-blocking:
  `BillingStateBanner.tsx:36` renders only for `state === "past_due" || state === "suspended"`, and
  its only `navigate()` call fires solely from an explicit CTA click
  (`BillingStateBanner.tsx:46`, `navigate("/salon/subscription?billing=update_payment_method")`) —
  there is no redirect-on-mount, no route guard, and no `ProtectedRoute`/`OnboardingRoute` check on
  `subscription_status` anywhere grepped. A suspended owner can still log into salon-admin and use
  every internal tool; only new public bookings are blocked.

**Cross-tenant effect (the follow-up's actual question): none.** `is_tenant_operational` reads only
the one tenant row it's given; nothing in the delinquency/suspension path is keyed by user/identity.
A delinquent or suspended owner can operate — or, per finding 4, create — a different tenant with
zero cross-tenant consequence, and can keep using salon-admin's internal tools on the suspended
tenant itself, not just switch away from it.

## Addendum — Relevant Files (additive)

- `apps/salon-admin/src/lib/pricing.ts` — hardcoded plan price/allowance display figures (solo/
  studio/chain), cross-checked against the DB-backed tables below.
- `supabase/migrations/20260204102647_9be81454-7f7d-4c60-806f-9d024961a614.sql` — `plans`,
  `plan_pricing`, `plan_limits` (incl. `monthly_messages`), `plan_features` — the live, DB-backed
  pricing/allowance source read at onboarding.
- `apps/salon-admin/src/hooks/usePlans.tsx` — reads the DB plan tables; consumed by
  `PlanStep.tsx` at onboarding, not the hardcoded `pricing.ts`.
- `apps/salon-admin/src/pages/onboarding/OnboardingPage.tsx` — `handleSubmit`: direct client-side
  `tenants` insert (plan, trial_ends_at) immediately followed by the owner `user_roles` insert; the
  self-serve creation path with no backoffice gate.
- `supabase/migrations/20260202153323_b091afde-b00c-4426-be85-828353808400.sql` — `communication_credits`
  table definition (`balance`, `free_monthly_allocation`, `last_reset_at`).
- `supabase/migrations/20260704000002_deduct_communication_credits_fn.sql` — `deduct_communication_credits`,
  the atomic RPC every message-send path calls against the same balance.
- `supabase/functions/send-bulk-message/index.ts`, `supabase/functions/send-manual-message/index.ts` —
  both check/decrement `communication_credits.balance`, confirmed no separate free-quota counter.
- `supabase/functions/_shared/sms-credit-pricing.ts` — paid-bundle pricing only; confirmed
  unrelated to the free allowance or any reset.
- `supabase/migrations/20260805140000_comms_credits_backoffice.sql` — the only other reference to
  `free_monthly_allocation`/`last_reset_at`, a read-only backoffice display RPC, not a resetter.
- `supabase/migrations/20260906180200_is_tenant_operational_lifecycle.sql` — `is_tenant_operational()`,
  single-tenant-scoped, the delinquency/suspension gate function.
- `supabase/functions/process-recurring-addon-billing/lifecycle.ts` — grace-expiry → `suspended`
  transition.
- `supabase/functions/create-public-booking/index.ts` — the only consumer of
  `is_tenant_operational` found; confirms the gate is storefront-only.
- `apps/salon-admin/src/components/banners/BannerContext.tsx` — inline comment documents the prior
  blocking `past_due` overlay was deliberately removed in favour of a non-blocking banner.
- `apps/salon-admin/src/components/billing/BillingStateBanner.tsx` — the current non-blocking
  suspended/past_due banner; confirmed no redirect-on-mount, CTA-triggered navigation only.

## Addendum — Existing Constraints (additive)

- `communication_credits.balance` is the single ledger for both free allowance and purchased
  credits — a design decision already in place (not something a future change needs to introduce),
  but one with no monthly-reset behaviour attached to it today for any tenant.
- `trg_enforce_single_owner_tenant` (see Current Behaviour above) blocks concurrent multi-tenant
  ownership but has no bearing on sequential tenant creation/abandonment — it is not, and was never
  designed to be, an anti-gaming control for findings 1-3 or 4.
- `is_tenant_operational` is tenant-scoped by construction (`p_tenant_id` parameter, single-row
  query) — extending delinquency consequences across an identity's other tenants would require a
  new mechanism, not a change to this function's existing contract.

## Addendum — Unknowns

- Whether `validate_sales_promo_code_for_email`'s RPC body blocks the same email from reusing the
  same promo code across multiple tenant signups. **[engineering - unresolved]** — the RPC body was
  not read; grep confirms the RPC exists and is called from `OnboardingPage.tsx:283`, but its
  internal reuse-limiting logic was not verified. Does not block findings 1-4 above, which stand on
  their own evidence.
- Whether `communication_credits.free_monthly_allocation`/`last_reset_at` are dead schema (reset
  logic never shipped) or a regression (a resetter existed and was removed). **[engineering -
  unresolved]** — no migration history was searched for a dropped function/cron job of this shape;
  the verified fact (no reset happens today, for any tenant) stands regardless of which it is.
- Whether the pricing/allowance gaming surface documented here (cheaper solo-splitting, one-time
  rather than monthly free-message balance per tenant, no cross-tenant creation or delinquency
  check) is a product priority to close, and if so which lever (creation gating, identity-level
  tenant-count/history checks, cross-tenant delinquency consequences, or accepting it as a
  known/acceptable limitation). **[product]** — this is exactly the "is it a good idea to allow"
  question the planner follow-up raised; no repository evidence resolves it.
