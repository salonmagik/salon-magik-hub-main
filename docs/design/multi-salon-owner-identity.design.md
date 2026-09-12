Status: implemented

# Multi-Salon Owner Identity — Implementation Design

Relaxes the single-owner-per-identity rule as a reviewed, recorded exception; makes co-ownership
visible in salon-admin; and states the branch-versus-business distinction at the point of choice.

---

# References

- Planning Brief: `docs/prd/multi-salon-owner-identity.prd.md`
- Technical Brief: `docs/research/2026-09-09-multi-salon-owner-identity.md` (including its
  five-gaps addendum on pricing, trials, allowances, tenant creation and delinquency)
- Prior design this builds directly on: `docs/design/second-owner-foundation.design.md`
  (AD-1 ownership-as-`user_roles`, AD-2 distinct backoffice function, AD-3 one-active-role-per-
  tenant invariant, AD-8 shared super-admin + fresh-TOTP preamble, AD-9 correct home,
  AD-10 `is_active`-aware ownership)
- Backlog item: `multi-salon-owner-identity` in `docs/backlog-open-followups.md`

The "what" and the "as-is" live in those documents and are not restated here.

---

# Architecture Decisions

### AD-1 — Correct home: this repository, extending the co-owner foundation

**Decision.** Everything lands in `supabase/migrations`, `supabase/functions`,
`apps/backoffice/src` and `apps/salon-admin/src`. No shared package changes.

**Reasoning.** The Technical Brief's *Existing Implementation & Placement* section re-confirmed for
this item what `second-owner-foundation.design.md` AD-9 established for the last one: ownership
modelling is not owned by `packages/shared`, `packages/ui` or `packages/supabase-client`, and the
only consumers of `user_roles`, `locations`, `staff_locations` and the ownership RPCs are the two
apps and the SQL layer. The one exception is the role-label map (AD-8 below), which is
salon-admin-local today and stays salon-admin-local.

**Rejected.** *A new package for ownership policy* — there is one consumer app for the display
surface and one for the grant surface; a package would add a build edge for two small modules.

### AD-2 — The exception is a durable authorisation record, not a relaxed rule

**Decision.** Add `public.owner_multi_salon_grants` — one row per reviewed exception, carrying the
identity, the approving backoffice user, the stated business reason, and a snapshot of the standing
evidence the reviewer saw. `trg_enforce_single_owner_tenant` continues to refuse a second active
ownership *unless* a matching, unrevoked, unexpired grant row exists. The default stays "one salon
per owner" for every identity on the platform.

**Reasoning.** The Planning Brief makes requirements 24–29 load-bearing rather than documentary
(Revenue & Platform-Gaming Risks: "shipping any subset of them ships the arbitrage"), and names
gate erosion as the primary risk with the audit record as the only thing that makes erosion
detectable. A durable row makes the Success Criterion *"every identity holding more than one active
ownership has a matching approval record"* a single SQL query rather than a convention, and makes
the approval a fact about the world rather than a fact about one transaction. It also gives
requirement 28 (approver, identity, salon, reason) and requirement 29 (the standing the reviewer
saw) one home each.

**Rejected.**
- *A transaction-local GUC flag* (`set_config('app.multi_salon_grant', ...)` checked by the
  trigger). Cheapest to write and leaves no schema behind — and that is exactly the problem: the
  approval would exist only for the length of one transaction, so after the fact nothing
  distinguishes a reviewed grant from a bypass, and the erosion risk becomes undetectable.
- *Dropping the trigger and enforcing in the edge functions only.* The trigger is the reason
  `grant_tenant_co_owner` does not duplicate the check (its own call-site comment says so), and the
  Technical Brief confirms it is the only active control on this axis. Removing it would move the
  boundary into application code on the same day the boundary becomes load-bearing.
- *A boolean column on `profiles` or `user_roles`* (`may_own_multiple`). One bit cannot carry the
  approver, the reason, or the evidence, and cannot be consumed once.

### AD-3 — The trigger becomes grant-aware; its exception message stays byte-identical

**Decision.** `enforce_single_owner_tenant()` keeps its shape, its `P0001` errcode and its exact
message text. Only its condition changes: when the write would leave the identity an active owner
of more than one tenant, it is permitted if **either** an unrevoked grant covers
`(new.user_id, new.tenant_id)`, **or** every *other* active ownership that identity holds is itself
covered by a grant (i.e. the row being written is the identity's original, ungranted ownership).

**Reasoning.** The second clause is not decoration. Without it, any later write to the original
ownership row — a support reactivation, a backfill, `grant_tenant_co_owner`'s
`on conflict do update` — would fail, because from that row's point of view "another salon" is now
owned. The invariant we actually want is *"at most one ungranted active ownership per identity"*,
and these two clauses are that invariant expressed in a `before` trigger.

The message must not change because `backoffice-add-tenant-co-owner` distinguishes this exception
from its own named ones by substring-matching `"already owns another salon"` — a deliberate
compromise recorded in the prior design (AD-9 there). Changing the text would silently downgrade
that 409 to a generic 500.

**Rejected.** *Giving the trigger its own named error code now* — worth doing, but it is a change
to a shared error contract that touches a function this item otherwise only extends; it belongs
with `co-owner-invite`, which adds the next write path. Recorded in Open Questions.

### AD-4 — A grant may be bound to a salon or unbound and consumed once

**Decision.** `owner_multi_salon_grants.tenant_id` is nullable.
- **Bound** (`tenant_id` set at creation): the salon already exists; the exception authorises this
  identity to become an owner of *that* salon. This is the `backoffice-add-tenant-co-owner` /
  `backoffice-add-tenant-owner` case.
- **Unbound** (`tenant_id` null): the exception authorises the identity's *next* new ownership,
  whichever salon that turns out to be. The trigger binds it — sets `tenant_id` and `consumed_at` —
  in the same transaction that creates the ownership row, and an unbound grant can be consumed
  exactly once.

**Reasoning.** The Planning Brief's own user flow requires this: *"If all are in good standing, the
additional ownership is granted... and the new salon is billed from the start"* — the salon does not
exist yet at approval time. The brief also scopes out any new creation flow ("additional salons are
created through whatever path creates salons today"). Today's path is `OnboardingPage.handleSubmit`,
which inserts the tenant and then the owner `user_roles` row; with an unbound grant in place that
second insert passes the trigger and the customer completes their own onboarding. Without unbound
grants there is no executable path from "approved" to "salon exists", because backoffice has no
tenant-creation function and this item is not the place to add one.

This does not weaken AC-7. The self-serve path gains no capability of its own — it can only complete
an authorisation a super-admin already made, with a reason and a standing snapshot on record. An
identity with no grant is refused by onboarding exactly as today.

**Rejected.**
- *Bound-only grants.* Strictly matches AC-7's wording, and is unimplementable for the brief's own
  primary flow without inventing a backoffice tenant-creation surface — which is both out of scope
  and a much larger change than the one being asked for.
- *Standing grants with no consumption* (the identity is simply flagged "may own many"). Requirement
  2's "each additional grant is reviewed on its own merits rather than allowed up to a number" means
  each additional salon needs its own decision. One row, one salon.

### AD-5 — Standing, trial and promo gates are enforced in the database, inside the grant transaction

**Decision.** A new `public.assess_owner_multi_salon_standing(p_user_id uuid) returns jsonb` returns
every tenant the identity actively owns with its `plan`, `subscription_status`, `trial_ends_at`,
`billing_grace_ends_at`, a per-salon `in_good_standing`, and an overall verdict. Good standing means
`subscription_status = 'active'` — nothing else qualifies. `create_owner_multi_salon_grant(...)`
calls it again inside its own transaction and raises rather than trusting what the caller was shown.

**Reasoning.** The same function serves requirement 29 / AC-12 (the reviewer sees every salon and
its standing before deciding) and requirements 25–26 / AC-8–AC-9 (the gate itself), so there is one
definition of "good standing" rather than a display one and an enforcement one that can drift.
Re-running it inside the transaction closes the window between the reviewer looking and the reviewer
confirming — the same reasoning that produced `confirmedOwnerUserIds` in the co-owner flow.

Deliberately **not** reusing `is_tenant_operational()`: that function treats `trialing` and
in-grace `past_due` as operational, which is right for the storefront and wrong here — requirement
25 excludes failed-payment and grace states, and requirement 26 excludes trials. Extending
`is_tenant_operational` to mean two things would break its one existing caller
(`create-public-booking`).

**Rejected.** *Enforcing in the edge function only.* The gate is the entire commercial safety of the
feature; a second write path added later (or a support script) would bypass it.

### AD-6 — No trial and no promotional pricing on an additional salon, enforced server-side

**Decision.** Four narrow server-side guards, all keyed on "the acting identity already actively owns
a salon" or "this tenant was obtained through a grant":

1. `before insert on public.tenants` — if `auth.uid()` already holds an active `owner` role at any
   tenant, force `trial_ends_at := null` and `subscription_status := 'past_due'` with
   `billing_grace_ends_at := null`.
2. `before update on public.tenants` — if a consumed, unrevoked grant is bound to this tenant,
   refuse a transition to `trialing` and refuse setting `trial_ends_at`.
3. `validate_sales_promo_code_for_email` returns `{valid:false, message:'Promotional codes aren't
   available on an additional salon.'}` when `auth.uid()` already actively owns a tenant.
4. `tenant_trial_overrides` gains the same refusal for grant-bound tenants.

**Reasoning.** Requirement 27 and AC-10 are absolute ("no free trial and no introductory,
promotional, referral, or discount pricing"), and the Technical Brief established that the trial is
written client-side in a raw `tenants` insert (`OnboardingPage.tsx:332-336`) with no server check —
so a client-side change would be advisory only. Guard 1 also closes the trial-farming route (R-2) for
existing owners specifically, which is a free by-product of doing this correctly.

`past_due` with a null `billing_grace_ends_at` is used because it is the only existing
`subscription_status` value that means "owes money, not operational" — `is_tenant_operational`
returns false for it in exactly that shape (`past_due` requires a future grace deadline to pass), so
the storefront stays closed until the subscription is paid, while salon-admin stays usable for setup
and `BillingStateBanner` already renders the correct "update payment method" CTA for it. Adding a
new enum value would touch every consumer of the lifecycle.

**Rejected.**
- *A dedicated `awaiting_first_payment` status.* Semantically cleaner and materially larger: the
  enum is read by `is_tenant_operational`, the lifecycle worker, the banners, and backoffice
  filtering. Recorded in Open Questions as the tidier follow-up.
- *Doing this in `OnboardingPage.tsx` only.* The insert is client-side; a client-side rule is not a
  rule.

### AD-7 — The salon-admin owners list gets its own RPC, not a relaxed `get_tenant_owners`

**Decision.** Add `public.get_salon_owners(p_tenant_id uuid)`, `security definer`, self-gated on
`is_tenant_owner(auth.uid(), p_tenant_id)`. `get_tenant_owners` is left exactly as it is.

**Reasoning.** `get_tenant_owners` is self-gated on `has_backoffice_role(..., 'super_admin')` by
design (prior AD-2, and the Technical Brief's *Existing Constraints* names this as the reason it
cannot be called from salon-admin). Relaxing it would widen a function backoffice depends on to
serve a different audience with different rules — the backoffice caller must see any salon's owners,
the salon-admin caller must see only their own salon's (AC-24) and only if they are an owner of it
(AC-25). Two audiences, two gates, two functions; the shared part is the one-line body.

**Rejected.** *One function with an `or is_tenant_owner(auth.uid(), p_tenant_id)` branch.* It makes
one function's blast radius the union of two, and a future change to the backoffice contract would
silently change what salon owners can see.

### AD-8 — Role labels move to one shared module; the sidebar label is purely presentational

**Decision.** Extract `ROLE_LABELS` from `TenantSwitcher.tsx` into
`apps/salon-admin/src/lib/roleLabels.ts` exporting `ROLE_LABELS` and `roleLabel(role)`.
`TenantSwitcher` imports it; `UserProfileSection` reads `currentRole` from `useAuth()` and renders
`roleLabel(currentRole)`.

**Reasoning.** The Technical Brief confirmed `currentRole` is already computed and threaded through
`AuthContext` and consumed two components away in the same file, so this needs no fetch, no RLS
change and no permission check. It also confirmed `ROLE_LABELS` is a local `const` in
`TenantSwitcher` and the only human-readable role map in salon-admin — so the second consumer is the
moment to extract it rather than copy it (FR-22: labels consistent wherever a role is displayed).
Owner and co-owner both render "Owner" for free: they are the same `role` value (FR-21).

### AD-9 — The salon switcher, Business Hub and context resolution are reused unchanged

**Decision.** No change to `fetchTenantsAndRoles`, `resolve_user_contexts`, `resolveContexts`,
`TenantSwitcher`'s rendering, or the per-tenant `localStorage` context keys.

**Reasoning.** The Technical Brief established that `fetchTenantsAndRoles` already builds the tenant
list from every `user_roles` row for the identity with no tenant filter, that `TenantSwitcher`
already labels each tenant with the role held there, and that every context mechanism is already
scoped to a single `tenantId`. AC-13, AC-14, AC-15 and AC-18 are therefore satisfied by existing
code the moment an owner can hold two roles — which is the whole point of relaxing the trigger.
Verification, not implementation, is what this needs (see Tests Required).

This decision is also what delivers the brief's exclusion of any cross-salon combined view: there is
nothing to exclude, because nothing aggregates.

### AD-10 — Last-used salon is remembered per user and survives sign-out

**Decision.** Replace the single `localStorage` key `currentTenantId` with a per-user key
`salonmagik.lastTenantId.<userId>`, and stop clearing it in `signOut`. `forceSignOut` (the
deleted-account path) still clears everything. The existing
`tenants.find(...) || tenants[0] || null` fallback is kept verbatim.

**Reasoning.** AC-16 requires returning to the last-used salon after signing out and back in;
`signOut` currently removes `currentTenantId` (`useAuth.tsx:782`), so it fails today. A per-user key
is what makes it safe to keep across sign-out on a shared device — user B never reads user A's
value — and it is what FR-10 ("remembered per user") literally asks for. The retained fallback is
AC-17, and it already handles a salon the user has lost access to by silently choosing an available
one, matching the self-healing behaviour the Technical Brief flagged as worth preserving.

### AD-11 — Grant creation reuses the backoffice elevated-auth and audit conventions verbatim

**Decision.** `backoffice-grant-multi-salon-ownership` uses `requireSuperAdminWithFreshTotp` from
`_shared/backoffice-elevated-auth.ts`, in the same auth-before-payload-validation order as its two
siblings, and writes one `audit_logs` row with `action: 'backoffice.multi_salon_ownership_granted'`.

**Reasoning.** Prior AD-8 established the shared preamble precisely so the ownership-granting
functions agree on what an unauthorized caller sees; this is a third function of the same
consequence tier. Requirement 28 says "using the same audit convention as existing ownership
additions", and the Technical Brief documented that convention as `audit_logs` keyed by a distinct
`action` string per operation type.

---

# Components

**Database (one migration)**
- `owner_multi_salon_grants` — new table, the authorisation record.
- `enforce_single_owner_tenant()` — replaced body, grant-aware (AD-3); trigger definition unchanged.
- `assess_owner_multi_salon_standing(uuid)` — new, backoffice-gated read (AD-5).
- `create_owner_multi_salon_grant(uuid, uuid, uuid, text)` — new, `service_role` only (AD-5).
- `revoke_owner_multi_salon_grant(uuid, uuid, text)` — new, `service_role` only; unconsumed grants
  only.
- `get_salon_owners(uuid)` — new, owner-gated salon-admin roster (AD-7).
- `check_owner_invite_email(text, uuid)` — replaced body: `already_owner_other_tenant` is suppressed
  when a grant covers the target.
- `enforce_no_trial_for_additional_salon()` + `enforce_no_trial_on_granted_tenant()` — new triggers
  on `tenants` (AD-6).
- `validate_sales_promo_code_for_email(text)` — replaced body, one added guard (AD-6).

**Edge functions**
- `supabase/functions/backoffice-grant-multi-salon-ownership/` — new; creates a bound or unbound
  grant after the standing gate, writes the audit row, emails nothing (a grant is not yet an
  ownership).
- `supabase/functions/backoffice-add-tenant-co-owner/index.ts` — unchanged logic; its
  `already_owner_other_tenant` and substring-match branches now simply stop firing when a grant
  exists, because the RPC and the trigger both defer to the grant.

**Backoffice (`apps/backoffice/src`)**
- `components/MultiSalonOwnershipDialog.tsx` — new: standing table (every salon the identity owns +
  status), required business-reason field, fresh-TOTP step, bound/unbound choice.
- `hooks/useOwnerStanding.tsx` — new: wraps `assess_owner_multi_salon_standing`.
- `pages/TenantsPage.tsx` — new row action "Grant additional-salon ownership"; owner column already
  renders a list.

**salon-admin (`apps/salon-admin/src`)**
- `lib/roleLabels.ts` — new (AD-8).
- `components/layout/TenantSwitcher.tsx` — imports the extracted map; no other change.
- `components/layout/SalonSidebar.tsx` — `UserProfileSection` renders the role label.
- `components/settings/SalonOwnersTab.tsx` — new, self-contained, modelled on `ActiveSessionsTab`.
- `pages/salon/SettingsPage.tsx` — one tab entry in `BASE_SETTINGS_TABS` and in the `business`
  scope list, plus one render line. No other change to this 4.6k-line file.
- `components/dialogs/AddSalonDialog.tsx` — branch-versus-business guidance block (FR-23).
- `hooks/useAuth.tsx` — per-user last-tenant key (AD-10).

---

# Data Flow

### Granting an additional-salon ownership (reviewed path)

```
Backoffice super_admin opens MultiSalonOwnershipDialog for an identity
    ↓
assess_owner_multi_salon_standing(user_id)      [RPC, self-gated on super_admin]
    → every actively-owned salon + plan + subscription_status + in_good_standing
    ↓  reviewer reads it, types a business reason, optionally picks a target salon
backoffice-grant-multi-salon-ownership          [edge fn]
    → requireSuperAdminWithFreshTotp
    → create_owner_multi_salon_grant(user, tenant|null, approver, reason)   [service_role]
         · re-runs assess_owner_multi_salon_standing INSIDE the transaction
         · raises MULTI_SALON_STANDING_FAILED / MULTI_SALON_TARGET_IN_TRIAL if the gate fails
         · inserts owner_multi_salon_grants row with the standing snapshot
    → audit_logs: backoffice.multi_salon_ownership_granted
```

### Consuming the grant — bound (salon B already exists)

```
Backoffice "Add co-owner" / "Add owner" on salon B, target = the granted identity
    ↓
check_owner_invite_email(email, B)  → no longer reports already_owner_other_tenant
    ↓
grant_tenant_co_owner(B, user)  →  insert into user_roles (owner, active)
    ↓
trg_enforce_single_owner_tenant  →  finds the bound grant, permits, stamps consumed_at
```

### Consuming the grant — unbound (customer creates salon B themselves)

```
OnboardingPage.handleSubmit
    ↓ insert into tenants
      trg_enforce_no_trial_for_additional_salon → auth.uid() already owns a salon
          → trial_ends_at := null, subscription_status := 'past_due', grace := null
    ↓ insert into user_roles (owner, active, tenant B)
      trg_enforce_single_owner_tenant → finds the unbound grant, binds it to B,
                                        stamps consumed_at, permits
    ↓ salon B exists, unbilled, not operational until subscribed
```

With no grant, the second insert raises exactly as today and onboarding fails unchanged.

### Owner opening the owners list

```
SettingsPage (tab=owners, rendered only when currentRole === 'owner')
    ↓
get_salon_owners(currentTenant.id)   [RPC, self-gated on is_tenant_owner(auth.uid(), tenant)]
    ↓
[{ user_id, full_name, email, granted_at }]  ordered by granted_at asc, no ranking
```

---

# API Changes

New edge function `POST /functions/v1/backoffice-grant-multi-salon-ownership`:

```jsonc
// request
{ "userId": "uuid",
  "tenantId": "uuid | null",     // null = unbound, consumed by the identity's next new salon
  "reason": "string, required, >= 10 chars",
  "totpToken": "123456" }

// 200
{ "success": true, "grantId": "uuid", "bound": false,
  "standing": { "allGood": true, "salons": [ { "tenantId": "...", "name": "...",
                 "plan": "solo", "subscriptionStatus": "active", "inGoodStanding": true } ] } }

// 409 — the gate refused, naming the offending salon (AC-8)
{ "error": "Bright Cuts is past_due. Every salon this owner already holds must be on an active
             paid subscription before an additional salon can be granted." }
// 409 — target salon is in trial (AC-9 / requirement 26)
{ "error": "Sunset Braids is still in a trial. An additional salon must be billed from the start." }
// 401 / 403 — identical shape to backoffice-add-tenant-co-owner (shared preamble)
```

RPC signature changes requiring a `supabase gen types` regeneration:
`get_salon_owners`, `assess_owner_multi_salon_standing`, `create_owner_multi_salon_grant`,
`revoke_owner_multi_salon_grant`. `check_owner_invite_email(text, uuid)` keeps its signature and its
return shape; only the conditions under which `already_owner_other_tenant` is returned narrow.

No salon-admin API changes beyond `get_salon_owners`.

---

# Database Changes

```sql
create table public.owner_multi_salon_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tenant_id     uuid references public.tenants(id) on delete set null,  -- null until consumed
  approved_by   uuid not null,                 -- backoffice user id (actor_user_id convention)
  reason        text not null check (length(btrim(reason)) >= 10),
  standing_snapshot jsonb not null,            -- what the reviewer saw (requirement 29)
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text,
  check (revoked_at is null or consumed_at is null)   -- consumed grants are immutable history
);

-- The trigger's hot path: "is there a live grant for this identity (and maybe this tenant)?"
create index owner_multi_salon_grants_live_idx
  on public.owner_multi_salon_grants (user_id, tenant_id)
  where revoked_at is null;

create index owner_multi_salon_grants_unbound_idx
  on public.owner_multi_salon_grants (user_id)
  where tenant_id is null and consumed_at is null and revoked_at is null;

alter table public.owner_multi_salon_grants enable row level security;
-- No policies, deliberately: reachable only through security-definer functions and service_role.
revoke all on public.owner_multi_salon_grants from public, authenticated;
```

**Migrations.** One migration file, `supabase/migrations/<ts>_multi_salon_owner_identity.sql`,
containing the table, the indexes, and the `create or replace` of every function listed in
Components. Ordering inside the file: table and indexes first, then
`assess_owner_multi_salon_standing`, then the grant/revoke functions, then the replaced
`enforce_single_owner_tenant`, then the `tenants` triggers, then `check_owner_invite_email`,
`validate_sales_promo_code_for_email` and `get_salon_owners`.

**No backfill.** Every existing identity owns at most one salon by construction, so there is nothing
to grant retroactively and the "every multi-owner has an approval record" invariant is true from the
first row.

**Indexes relied on.** `user_roles` is already queried by `(user_id, role, is_active)` in the
existing trigger and in `check_owner_invite_email`; confirm a supporting index exists on
`user_roles(user_id)` before merging (`\d public.user_roles`) and add
`create index if not exists user_roles_user_active_owner_idx on public.user_roles (user_id) where
role = 'owner' and coalesce(is_active, true)` if not — the trigger now runs two such lookups per
owner-row write instead of one.

---

# Validation

**Grant creation** — server is the boundary; the dialog only mirrors it.
- `reason` trimmed, ≥ 10 characters. A blank or token reason defeats requirement 28.
- `userId` must currently hold at least one active `owner` role — a grant for a non-owner is
  meaningless and is refused.
- Every salon the identity actively owns must be `subscription_status = 'active'` (requirement 25 /
  AC-8). `trialing`, `past_due`, `paused`, `canceled`, `suspended`, `permanently_deactivated` all
  fail, and the error names the first failing salon.
- If `tenantId` is supplied: the tenant must exist, must not be `trialing` (requirement 26 / AC-9),
  and must not already have the identity as an active owner.
- The identity must not already hold a live unconsumed grant — one open authorisation at a time.

**Owners list** — `p_tenant_id` is not trusted from the client; the function gates on
`is_tenant_owner(auth.uid(), p_tenant_id)`, so passing another salon's id returns
`OWNER_ACCESS_DENIED` rather than that salon's owners (AC-24, AC-25).

**Role label** — no validation surface; an unknown role string falls back to the raw value, matching
`TenantSwitcher`'s existing `ROLE_LABELS[role] || role`.

---

# Error Handling

| Raised | Where | Surfaced as |
|---|---|---|
| `MULTI_SALON_STANDING_FAILED:<tenant_id>` | `create_owner_multi_salon_grant` | 409 naming the salon and its status |
| `MULTI_SALON_TARGET_IN_TRIAL` | same | 409 "must be billed from the start" |
| `MULTI_SALON_GRANT_ALREADY_OPEN` | same | 409 "this owner already has an open authorisation" |
| `MULTI_SALON_NOT_AN_OWNER` | same | 409 "this person does not own a salon yet" |
| `This account already owns another salon…` (`P0001`, unchanged text) | `enforce_single_owner_tenant` | unchanged: 409 in `backoffice-add-tenant-co-owner` via its existing substring match; a raw insert error in onboarding, as today |
| `MULTI_SALON_TRIAL_NOT_ALLOWED` | `enforce_no_trial_on_granted_tenant` | 400 from whatever attempted the update; not expected from any UI path |
| `OWNER_ACCESS_DENIED` (`P0001`) | `get_salon_owners` | The owners tab renders "You don't have access to this" rather than an empty list — an empty list would read as "this salon has no owners" |
| `BACKOFFICE_ACCESS_DENIED` | `assess_owner_multi_salon_standing` | unchanged convention from `get_tenant_owners` |

The grant edge function follows `backoffice-add-tenant-co-owner`'s precedent of logging the raw
error and returning a generic 500 for anything unrecognised — named exceptions only are translated.

---

# Security Considerations

- **The exception table is unreachable from the client.** RLS enabled with no policies, all grants
  revoked from `public`/`authenticated`. Reads happen through `assess_owner_multi_salon_standing`
  (super-admin gated) and writes through `service_role`-only functions called by an edge function
  that already requires a fresh TOTP. This mirrors `grant_tenant_co_owner`'s posture exactly.
- **Fresh TOTP, not session TOTP.** Granting an ownership exception is the same consequence tier as
  granting an ownership; `requireSuperAdminWithFreshTotp` is used for the same reason
  `AddCoOwnerDialog` uses it.
- **The trigger stays the boundary.** Application code never decides whether a second ownership is
  allowed; it only creates the record that lets the database decide. A future write path — the
  `co-owner-invite` flow, a support script — inherits the gate without knowing about it.
- **Owner emails do not leak.** `get_salon_owners` gates on the caller's own ownership of the tenant
  it is asked about, so a person owning salons A and B cannot read B's owners while acting in A, and
  a manager cannot read them at all (AC-24, AC-25, and the brief's "Revealing owner identities"
  risk).
- **Separation holds at the server, not the UI.** Nothing in this design introduces a cross-tenant
  query. The only function that reads across tenants for one identity is
  `assess_owner_multi_salon_standing`, which is backoffice-only and returns standing, not salon data
  (non-functional requirement "Safety of separation").
- **The no-trial guard is not an authorization control** and must not be mistaken for one — it keys
  on `auth.uid()` and exists to enforce a commercial rule on the honest path. The anti-gaming control
  is the grant gate; the Technical Brief's finding that sequential create-and-abandon remains open is
  unchanged by this design and is explicitly out of scope.

---

# Performance Considerations

- **Trigger cost.** `enforce_single_owner_tenant` fires on every `user_roles` insert/update — staff
  onboarding, role changes, deactivations. It currently runs one `exists` on `user_roles`; it will
  run at most three small lookups, and only when the row being written is an active `owner` row.
  Every other write short-circuits on the first `if` exactly as today. Fetch is by
  `(user_id, role, is_active)` and `(user_id, tenant_id)` — both indexed (see Database Changes); no
  sequential scan and no per-row application-side filtering.
- **Standing assessment.** One indexed lookup of the identity's active owner rows (at most a handful)
  joined to `tenants` by primary key. Not an N+1: the salons are fetched in one query with
  `tenant_id = any(...)`, never one round trip per salon.
- **Owners list.** At most two rows, one indexed `user_roles` lookup joined to `auth.users` and
  `profiles` by primary key — the same shape as `get_tenant_owners`, whose plan was already checked
  in the prior item.
- **Backoffice tenants list is untouched.** `useTenants` already fetches all `user_roles` in one
  query; the new dialog fetches standing only for the one identity it is opened on, never for the
  list.
- **No new client fetch in salon-admin's hot path.** The role label reads `currentRole` from context;
  the owners list is lazy, behind a settings tab.

---

# Compatibility

**Backward compatible by construction.**
- Every identity currently owns at most one salon, so the replaced trigger's new clauses are
  unreachable for existing data and its behaviour is byte-identical for every current row.
- `enforce_single_owner_tenant`'s message text is preserved, so
  `backoffice-add-tenant-co-owner`'s substring match keeps working (AD-3).
- `check_owner_invite_email` keeps its `(text, uuid)` signature and its `p_tenant_id default null`
  behaviour, so `OnboardingPage.tsx` and `AddTenantOwnerDialog.tsx` are unaffected.
- `get_tenant_owners` is untouched, so backoffice is unaffected.
- The `tenants` insert guard changes behaviour only for an identity that already owns a salon —
  today an impossible state, so no existing signup path changes.
- Single-salon users see exactly one new element, the role label (non-functional requirement "No
  regression for single-salon users").

**The one behaviour change for existing users** is AD-10: the last-used salon now survives sign-out.
Multi-salon *staff* already exist in production and are the population affected. The key rename means
their first sign-in after deploy falls back to `tenants[0]` once, then remembers. This is acceptable
and does not warrant a migration shim; note it in the release notes.

**Deprecation.** None. Nothing is removed. `ROLE_LABELS` moves rather than changes.

**Migration strategy.** One forward migration, no backfill, no data rewrite. Rollback is a
`create or replace` restoring the previous `enforce_single_owner_tenant` body plus dropping the two
`tenants` triggers — safe as long as no grant has been consumed; once one has, rolling back would
leave an unenforceable state, so the rollback note is "revoke the grants and end the extra ownership
first". Branch promotion follows the project rule: `development` → `main` → `release`, never a
direct production deploy.

---

# Edge Cases

1. **Reactivating the original ownership row while a granted second one is active.** Handled by
   AD-3's second clause: permitted because every *other* active ownership is granted.
2. **Two owners of salon A, both granted salon B.** Grants are per-identity and salon B's two-owner
   cap is enforced independently in `grant_tenant_co_owner`. The second one fails on the cap, not on
   the exception.
3. **Grant approved, then one of the identity's salons goes delinquent before the grant is used.**
   The trigger does not re-check standing — requirement 25 gates the *grant*, not the consumption.
   `expires_at` (30 days) bounds how stale an authorisation can get; a lapsed grant is simply refused
   and a new review is needed.
4. **Two concurrent attempts to consume one unbound grant.** The trigger's binding update selects the
   grant row `for update skip locked`; the loser sees no available grant and raises the standard
   message.
5. **Revoking a grant after it has been consumed.** Refused by the table check constraint —
   consumed grants are immutable history. Ending the resulting ownership is
   `owner-removal-support`'s job, not this one's (constraint carried from the brief).
6. **Onboarding creates the tenant, then the owner insert fails.** Pre-existing behaviour (the two
   inserts are separate client calls) and an orphan tenant results. Unchanged by this design, and
   *less* likely now, because the only identity that used to hit it is the one that now has a grant.
   Recorded, not fixed.
7. **The granted salon's owner subscribes, then cancels, then creates a third salon.** No open grant
   exists, so the third salon's owner insert is refused. The gate applies per additional salon
   (requirement 2, no numeric cap, each grant reviewed on its merits).
8. **A user with no role at any salon opens the owners tab by URL.** `is_tenant_owner` is false,
   `OWNER_ACCESS_DENIED` is raised, the tab is not in their nav to begin with (`currentRole !==
   'owner'`), and the page renders the access message rather than an empty roster.
9. **Owner switches from salon A to salon B while the owners tab is open.** The tab keys its query on
   `currentTenant.id`, so it refetches for B — AC-24 in the live case, not just on load.
10. **Role label for a user whose role row was deactivated mid-session.** `currentRole` is null;
    the label is omitted rather than rendering a placeholder, and the existing assignment-pending /
    access-denied paths take over on the next context resolve.
11. **A granted, unbilled salon (`past_due`, null grace) receiving a payment.** The existing
    subscription activation path sets `active`; the `before update` guard only blocks `trialing` and
    `trial_ends_at`, so nothing interferes.
12. **A promo code entered during an additional salon's onboarding.** Refused by the
    `validate_sales_promo_code_for_email` guard with a specific message, before any trial arithmetic
    runs.

---

# Tests Required

**Database (`supabase/tests/multi_salon_owner_identity.sql`, following
`supabase/tests/co_owner_foundation.sql`'s shape)**
- No grant → second active owner row raises `P0001` with the unchanged message (AC-7 at the DB
  layer).
- Bound grant → the second ownership succeeds and both remain active (AC-1); `consumed_at` stamped.
- Unbound grant → consumed and bound by the first new ownership; a second attempt is refused
  (AD-4).
- Original ownership row can be deactivated and reactivated while a granted one is active (AD-3
  clause two, edge case 1).
- Ending one ownership leaves the other active (AC-5).
- Owner at A + manager at B, in both orders, unaffected throughout (AC-3).
- `create_owner_multi_salon_grant` refuses when any owned salon is `past_due` / `suspended` /
  `canceled` / `trialing`, naming it (AC-8, AC-9).
- `create_owner_multi_salon_grant` refuses a `trialing` target tenant (requirement 26).
- `tenants` insert by an existing owner lands with `trial_ends_at` null and `subscription_status`
  `past_due` (AC-10); a later update to `trialing` is refused.
- `validate_sales_promo_code_for_email` refuses for an existing owner (AC-10).
- `get_salon_owners` returns both owners for an owner of that salon, ordered, unranked (AC-23);
  raises for a manager (AC-25); returns only the queried salon's owners for a multi-salon owner
  (AC-24).
- Expired and revoked grants do not permit a second ownership (edge case 3).

**Edge function (`deno test`)**
- `backoffice-grant-multi-salon-ownership/index.test.ts` — new, modelled on
  `backoffice-add-tenant-co-owner/index.test.ts`: unauthorized before payload validation, stale
  TOTP, standing refusal shapes, audit row written on success, no audit row on refusal.
- `backoffice-add-tenant-co-owner/index.test.ts` — extend: a target with a bound grant is no longer
  refused with `already_owner_other_tenant` (AC-6), and is still refused without one.

**salon-admin (vitest)**
- `UserProfileSection` renders the role label for owner, manager, receptionist and staff (AC-26,
  AC-28), and omits it when `currentRole` is null.
- `SalonOwnersTab` renders two owners with name and email and no ranking; renders the access message
  on `OWNER_ACCESS_DENIED`.
- `roleLabels` — `TenantSwitcher` and `UserProfileSection` produce the same string for the same role
  (FR-22).
- `AddSalonDialog` shows the branch-versus-business text before the submit control in every one of
  its four render branches (AC-29).

**Integration / manual (documented in the PR)**
- Sign in as a two-salon owner, switch, confirm the role label and the owners list follow the salon
  (AC-15, AC-24, AC-27), and that nothing from the other salon is reachable (AC-2).
- Sign out and back in; land in the last salon (AC-16). Revoke access to it; land in the other with
  no error (AC-17).
- A single-salon user sees no switcher and no other change (AC-14).

---

# Verification

```bash
# from the repo root
npm run lint
npm run test                                   # turbo → vitest across apps
npm run build                                  # type-checks salon-admin + backoffice

# edge functions (Deno)
deno test --allow-env --allow-net supabase/functions/backoffice-grant-multi-salon-ownership/index.test.ts
deno test --allow-env --allow-net supabase/functions/backoffice-add-tenant-co-owner/index.test.ts
deno test --allow-env --allow-net supabase/functions/          # full sweep

# database
supabase db reset                              # applies the new migration from scratch
psql "$SUPABASE_DB_URL" -f supabase/tests/multi_salon_owner_identity.sql
psql "$SUPABASE_DB_URL" -f supabase/tests/co_owner_foundation.sql    # regression: unchanged
psql "$SUPABASE_DB_URL" -c "\d public.user_roles"                    # confirm the user_id index
psql "$SUPABASE_DB_URL" -c "explain analyze select * from public.get_salon_owners('<tenant-uuid>')"

# the gate-erosion audit query this design exists to make possible
psql "$SUPABASE_DB_URL" -c "
  select ur.user_id, count(*) as active_ownerships
  from public.user_roles ur
  where ur.role = 'owner' and coalesce(ur.is_active, true)
  group by 1 having count(*) > 1
  and not exists (select 1 from public.owner_multi_salon_grants g
                  where g.user_id = ur.user_id and g.consumed_at is not null);"
# must return zero rows, always

# regenerate types after the new/changed RPCs
supabase gen types typescript --local > packages/supabase-client/src/supabase/types.ts
```

Branch promotion follows the project's standing rule: `development` → `main` → `release`. No direct
deploy to production.

---

# Implementation Order

Each step is independently reviewable and leaves the tree working. Steps 6–9 are presentational and
have no dependency on 1–5, so they can be split into a second PR if the first grows large.

1. **Migration, part one — the record and the gate.** `owner_multi_salon_grants` + indexes + RLS;
   `assess_owner_multi_salon_standing`; `create_owner_multi_salon_grant`;
   `revoke_owner_multi_salon_grant`. Nothing consumes them yet, so this is additive and inert.
2. **Migration, part two — the trigger.** Replace `enforce_single_owner_tenant`'s body (AD-3),
   preserving the message text exactly. Add the `user_roles(user_id)` partial index if absent.
3. **Migration, part three — the commercial guards.** The two `tenants` triggers, the
   `validate_sales_promo_code_for_email` guard, and the `tenant_trial_overrides` refusal (AD-6).
4. **Migration, part four — the consumers.** `check_owner_invite_email` grant-awareness and
   `get_salon_owners`. Regenerate `packages/supabase-client/src/supabase/types.ts`.
5. **Write `supabase/tests/multi_salon_owner_identity.sql` and make it pass** before any UI exists.
   The gate is the feature; it is verified first.
6. **Edge function `backoffice-grant-multi-salon-ownership`** + its Deno test, reusing
   `requireSuperAdminWithFreshTotp` and the `audit_logs` convention (AD-11).
7. **Backoffice UI** — `useOwnerStanding`, `MultiSalonOwnershipDialog`, the `TenantsPage` row
   action. Extend `backoffice-add-tenant-co-owner/index.test.ts` for AC-6.
8. **salon-admin representation** — `lib/roleLabels.ts`, `TenantSwitcher` import swap,
   `UserProfileSection` label, `SalonOwnersTab`, the two `SettingsPage` tab-list entries and the one
   render line, plus the sidebar sub-nav entries. Vitest for each.
9. **salon-admin context and guidance** — the per-user last-tenant key in `useAuth` (AD-10) and the
   branch-versus-business block in `AddSalonDialog` (FR-23).
10. **Verification sweep** — the full block above, including the gate-erosion query, plus the manual
    two-salon walkthrough listed under Tests Required.

---

# Open Questions

Genuine engineering uncertainty only; none blocks implementation.

- Q: Does the trigger's `P0001` deserve its own named error code now that a third caller
  distinguishes it by substring? -> A: Not in this item. Changing the message breaks
  `backoffice-add-tenant-co-owner`'s existing match (AD-3), and the right moment is
  `co-owner-invite`, which adds the next write path and can update both call sites at once.
  (decided autonomously)
- Q: Should an additional salon get a new `awaiting_first_payment` subscription status rather than
  `past_due` with a null grace deadline? -> A: `past_due` for now (AD-6). The new enum value is
  cleaner and touches `is_tenant_operational`, the lifecycle worker, both banner components and
  backoffice filtering — a lifecycle change, not an ownership change. Worth raising as its own item
  once granted salons actually exist. (decided autonomously)
- Q: Where exactly should the branch-versus-business guidance live, given `AddSalonDialog` has four
  render branches? -> A: In all four, as a shared block above the footer, because the at-limit and
  chain-unlock branches are precisely where an owner is most likely to conclude "I'll just open a
  separate salon instead". (decided autonomously)
- Q: Does `validate_sales_promo_code_for_email` block the same email reusing a code across signups?
  -> The Technical Brief left this unread. It does not affect this design — the new guard refuses the
  RPC outright for an existing owner regardless — but it remains open for whoever picks up the
  self-serve creation item.
- The free-message allowance never resetting, suspension not gating salon-admin, and self-serve
  sequential salon creation are all scoped out by the Planning Brief and unchanged here. They are
  recorded in that brief's Open Questions and each needs its own backlog item.
