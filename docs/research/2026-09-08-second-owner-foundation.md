# Original Request

> Topic: Support a second owner on a salon - data model and permission foundation. There is currently no concept of a co-owner anywhere in the codebase... This item covers the foundation only: letting a salon have more than one owner-level account, and making every owner-gated check treat them equivalently - RLS policies, edge functions, and the salon-admin UI's owner checks. Investigate how tenant ownership is currently modelled and every place that assumes exactly one owner... Out of scope: the invite/accept flow (co-owner-invite).

---

# Summary

Ownership is modelled as rows in `public.user_roles` (`user_id`, `tenant_id`, `role`), not as a column on `tenants`. There is no `tenants.owner_id` or similar FK — a tenant's owner(s) are found by querying `user_roles` where `role = 'owner'`. Because ownership is row-based per user, most of the codebase (RLS's `has_role()`, notification fan-out, per-user role checks in edge functions and the UI) already treats "owner" as a set, not a singleton, and needs no change to support a second owner.

The actual single-owner constraint is narrow and lives in exactly one place: `supabase/functions/backoffice-add-tenant-owner/index.ts`, which explicitly queries for any existing active `role = 'owner'` row on the tenant and returns `409 "This salon already has an owner."` if one exists. This is currently the *only* path (besides self-serve onboarding, which creates the first owner for a brand-new tenant) that can assign the `owner` role, so it is the sole enforcement point standing between today's behaviour and a second owner.

A separate, unrelated trigger (`enforce_single_owner_tenant`, migration `20260726000020`) restricts the *other* direction — one identity can't be active owner of two different tenants at once. That constraint is orthogonal to this item and should not be touched.

# Current Behaviour

**Schema** (`supabase/migrations/20260202153323_..._400.sql`):
- `public.tenants` has no owner reference at all.
- `public.user_roles(user_id, tenant_id, role)` with `UNIQUE(user_id, tenant_id, role)` and `app_role` enum `('owner','manager','supervisor','receptionist','staff')`. Multiple distinct users can each hold an `owner` row for the same `tenant_id` — nothing in the table schema prevents this.

**Permission checks** are per-caller, not "the owner":
- `public.has_role(_user_id, _tenant_id, _role)` (used pervasively in RLS policies) is `EXISTS (... user_id = ? AND tenant_id = ? AND role = ?)` — this is already correct for N owners with no change needed.
- Edge functions that gate an action to owners (e.g. `create-checkout-session/index.ts:57-70`) query the *caller's own* row (`eq("user_id", user.id).eq("tenant_id", tenantId)`) and compare `role === "owner"`. This works unchanged for any number of owners since each owner has their own row.
- `apps/salon-admin/src/hooks/useAuth.tsx` resolves `userRole` from the caller's own membership and checks `userRole === "owner"` (lines 355, 384, 475 etc.) — again per-caller, not tenant-singleton.

**Notification / recipient fan-out already handles multiple owners**:
- `supabase/functions/_shared/salon-notifications.ts:getSalonRecipients()` queries `user_roles` `.in("role", roles)` (default `["owner","manager"]`) and returns all matching rows — used by `send-daily-digest`.
- `supabase/functions/_shared/payment-webhook-processor.ts:891-898` queries all `user_roles` rows with `role = "owner"` for the tenant and loops over every one (`for (const owner of owners)`) to send payment emails.

**The one place that assumes exactly one owner** — `supabase/functions/backoffice-add-tenant-owner/index.ts:113-121`:
```ts
// This action is for salons missing an owner only — not for
// reassigning ownership away from an existing one.
const { data: existingOwnerRoles } = await admin
  .from("user_roles")
  .select("id, is_active")
  .eq("tenant_id", tenantId)
  .eq("role", "owner");
if ((existingOwnerRoles || []).some((r) => r.is_active ?? true)) {
  return json({ error: "This salon already has an owner." }, 409);
}
```
This is a `super_admin`-only, TOTP-gated backoffice action for salons whose owner account is missing/lost — it is deliberately scoped to "add a missing owner," not general ownership assignment. It is the only current server-side path that can insert an `owner` row outside of self-serve onboarding.

**Onboarding (first owner only)** — `apps/salon-admin/src/pages/onboarding/OnboardingPage.tsx:341,480` inserts the caller's own `user_roles` row with `role: "owner"` directly from the client (service-role edge function not involved). This is gated by RLS policy `"Users can create own user_role"` (migration `20260803105925_restrict_onboarding_role_and_tenant_insert.sql`):
```sql
create policy "Users can create own user_role"
on public.user_roles
for insert
with check (
  auth.uid() = user_id
  and role in ('owner', 'manager', 'supervisor')
);
```
Note `auth.uid() = user_id` — a caller can only ever insert a role row for *themselves*. There is currently no client-side (RLS-permitted) path for an existing owner to insert a second owner row for a different user; any such path would have to be a new service-role edge function (the co-owner-invite item, out of scope here).

**Orthogonal, do-not-touch constraint** — `enforce_single_owner_tenant` trigger (`supabase/migrations/20260726000020_single_owner_tenant.sql`) blocks one *user* from being active owner of two different *tenants* simultaneously. It does not restrict how many owners one tenant can have — that's a different axis from this item and its comment explicitly documents the "one person, one salon" intent, which should be preserved.

**`check_owner_invite_email` RPC** (`supabase/migrations/20260726000022_check_owner_invite_email.sql`) pre-validates an email for the onboarding "invite an owner" step, returning `already_owner` if that email already has *any* active owner row anywhere. Its `already_owner` semantics is about the single-owner-per-*person* trigger above, not per-tenant, so it does not need to change for this item — but is a related surface a future co-owner-invite flow will need to reason about (an email that's *already this tenant's* owner vs. *some other tenant's* owner are different cases it doesn't currently distinguish).

# Affected Surfaces

This item is data-model/permission foundation, not a new endpoint or contract change to external consumers, so there is no "breaking change" ripple to trace in the step-3 sense. The relevant surfaces that assume single ownership and would need to change to *permit* (not just tolerate) a second owner:

- `supabase/functions/backoffice-add-tenant-owner/index.ts` — the 409 "already has an owner" guard (lines 113-121) is the actual blocker. Needs a decision (left to principal/planner) on how backoffice should support adding a co-owner vs. its current "replace a missing owner" purpose.
- RLS policy `"Users can create own user_role"` (`20260803105925`) — restricts owner-role inserts to self (`auth.uid() = user_id`), so no existing owner can grant co-ownership without a new service-role edge function. This is infrastructure the co-owner-invite flow will need, but is out of scope to build here; noting it because it's part of "every owner-gated check."
- Everywhere else checked (RLS `has_role`, per-caller role checks in edge functions and `useAuth.tsx`, `getSalonRecipients`, payment-webhook owner notification loop) already operates per-row / per-caller and requires no change — confirmed by direct inspection, not assumption.

No frontend caller, external API consumer, or other codebase depends on "a tenant has exactly one owner" as a contract; the constraint is self-contained to the one backoffice function above.

# Existing Implementation & Placement

**Existing implementation**: No co-owner concept exists anywhere (confirmed: the only source hit for "co-owner" is unrelated marketing copy in `supabase/functions/send-welcome-email/index.ts`). However, the underlying data model (`user_roles` as a per-user-per-tenant-per-role table) already supports multiple `owner` rows per tenant with no schema change — the "foundation" is largely already in place at the DB and RLS level. What's missing is (a) removing/adjusting the one explicit single-owner guard in `backoffice-add-tenant-owner`, and (b) a way to actually create a second owner row (which is the separate, out-of-scope co-owner-invite item).

**Correct home**: This is a single-app (`salon-admin` + its Supabase backend), single-tenant-model concern — there are no shared/upstream packages in this workspace that own tenant/ownership modelling (`packages/shared`, `packages/supabase-client`, `packages/ui` were not implicated by any of the grep hits above; ownership logic lives entirely in `supabase/migrations`, `supabase/functions`, and `apps/salon-admin`). No `CLAUDE.md` or project doc was found stating a placement rule for this kind of change. Changes belong in: `supabase/migrations` (if any RLS/trigger adjustment is designed), `supabase/functions/backoffice-add-tenant-owner`, and `apps/salon-admin` for any UI that currently renders based on an implicit "one owner" assumption (none was found with hard-single-owner logic — see Unknowns).

**Prior memory notes**: None found — no `*-notes.md` file exists alongside ownership-related docs (no prior feature doc directory for tenant ownership was located).

# Execution Flow

```
Onboarding (first owner, self-serve)
  OnboardingPage.tsx → supabase.from("user_roles").insert({role:"owner", user_id: self})
    ↓ (RLS: "Users can create own user_role" — auth.uid() = user_id only)
  user_roles row created

Backoffice (missing-owner recovery, super_admin + TOTP only)
  backoffice-add-tenant-owner/index.ts
    ↓ guard: any active user_roles row with role='owner' for tenant? → 409 if yes
    ↓ else: create/find auth user → insert user_roles(role:'owner') → email

Runtime owner-gated checks (already multi-owner-safe)
  RLS: has_role(auth.uid(), tenant_id, 'owner')  → per-row EXISTS check
  Edge functions: query caller's own user_roles row → compare role
  useAuth.tsx: resolve caller's own role from user_roles → userRole === "owner"
  Notifications: query ALL user_roles rows role='owner' → fan out to each
```

# Relevant Files

- `supabase/migrations/20260202153323_b091afde-b00c-4426-be85-828353808400.sql` — core schema: `tenants`, `user_roles`, `has_role()`. Confirms no `owner_id` column and no per-tenant uniqueness constraint on `role='owner'`.
- `supabase/migrations/20260726000020_single_owner_tenant.sql` — the (orthogonal, keep-as-is) trigger preventing one user from owning two tenants.
- `supabase/migrations/20260726000022_check_owner_invite_email.sql` — RPC used by onboarding's owner-invite step; documents the "already_owner" semantics.
- `supabase/migrations/20260803105925_restrict_onboarding_role_and_tenant_insert.sql` — the RLS policy restricting `user_roles` inserts to self, which blocks any existing owner from client-side-granting co-ownership today.
- `supabase/functions/backoffice-add-tenant-owner/index.ts` — the one explicit single-owner-per-tenant guard (409 block) that must change to permit a second owner.
- `supabase/functions/_shared/salon-notifications.ts` — proof that recipient resolution already fans out across all owner rows.
- `supabase/functions/_shared/payment-webhook-processor.ts` — proof that payment-notification owner resolution already loops over all owner rows.
- `supabase/functions/create-checkout-session/index.ts` — representative example of a per-caller owner-only gate (unaffected by multiple owners).
- `apps/salon-admin/src/hooks/useAuth.tsx` — per-caller role resolution driving UI routing/permissions (`userRole === "owner"` checks); unaffected by multiple owners since it's always about the *current* caller.
- `apps/salon-admin/src/pages/onboarding/OnboardingPage.tsx` — where the first owner's `user_roles` row is inserted client-side during signup.
- `apps/salon-admin/src/components/banners/BannerContext.tsx` — "Owner Invitation Expired" banner; inspected because the ask named it explicitly. It keys off the *current user's own* `currentRole === "owner"` plus that user's pending invitation record, not a tenant-wide singular-owner lookup — not affected by a second owner existing.
- `supabase/functions/create-payout-destination/index.ts`, `supabase/functions/process-salon-withdrawal/index.ts` — inspected because the ask named payout destinations/withdrawals explicitly; neither contains any `owner`-literal role check or singular-owner lookup — access control for these is not enforced by an owner-identity match in these functions (see Unknowns for the RLS/permission layer actually gating them).

# Relevant Components

- Database: `user_roles` table, `has_role()` function, RLS policies on `user_roles` and `tenants`.
- Edge Functions: `backoffice-add-tenant-owner`, `_shared/salon-notifications.ts`, `_shared/payment-webhook-processor.ts`, billing checkout/verification functions that gate on `role === 'owner'`.
- Frontend: `useAuth.tsx` (role/context resolution), `BannerContext.tsx` (owner-targeted banners), onboarding flow.

# Existing Constraints

- `UNIQUE(user_id, tenant_id, role)` on `user_roles` — a given user can only have one `owner` row per tenant (irrelevant to multi-owner-per-tenant, just prevents duplicate identical rows).
- `enforce_single_owner_tenant` trigger — one user cannot be active owner of more than one tenant at a time. Must be preserved; it is not the mechanism to change.
- RLS `"Users can create own user_role"` — only self-inserts allowed, restricted to `role in ('owner','manager','supervisor')`. Any mechanism to grant co-ownership to a *different* user must go through a service-role function (none exists today besides the backoffice recovery path).
- `backoffice-add-tenant-owner`'s super_admin + fresh-TOTP gate is deliberately stricter than the rest of backoffice's permission-template system (per its own inline comment) — any change to this function should preserve that elevated bar rather than loosen it.

# Existing Behaviour

- Owner-only UI/route gating throughout `salon-admin` already keys off the *current session's* role row, so it requires no change to "treat multiple owners equivalently" — it already does, by construction, since it never looks at any other user's role.
- Notification fan-out (billing emails, daily digest) already sends to every owner row on the tenant, not just one — this is existing, correct-for-N-owners behaviour, not something to build.
- `check_owner_invite_email`'s `already_owner` reason string conflates "already owns *a* salon" — it doesn't currently distinguish "already owns *this* salon" (which would be a legitimate re-grant/no-op case for a second-owner flow) from "already owns a *different* salon" (which the `enforce_single_owner_tenant` trigger would reject). This nuance will matter to whoever designs the co-owner-invite flow, even though building it is out of scope here.

# Unknowns

- `[engineering - unresolved]` What actually gates `create-payout-destination` and `process-salon-withdrawal` at the authorization layer — no owner-literal check was found in either function body, and no RLS policy referencing `owner`/`has_role` was found for `salon_payout_destinations` in a targeted grep. It's possible authorization here is enforced entirely client-side via `usePermissions.tsx`/module-permission gating rather than an owner-identity check, which would mean this surface needs no server-side change for a second owner — but confirming that exhaustively would require reading the full permission-resolution chain (`usePermissions.tsx`, `contextAccess.ts`, and any RLS on `salon_payout_destinations` not caught by the "payout_destinations" substring search), which is beyond the minimal surface for this brief. Recommend principal/implementer verify this specific gap before considering payout/withdrawal "done" for co-owner equivalence.
- `[product]` Whether `backoffice-add-tenant-owner`'s guard should simply be removed/relaxed to "allow adding an owner as long as it's not a duplicate of an existing active owner for a *different* tenant" (i.e., just drop the per-tenant single-owner check but keep the per-user single-tenant check), or whether backoffice should get a distinct, separate action for "add a co-owner" versus its current "recover a missing owner" purpose. This is a product/UX call for planner or principal, not resolvable from the code.
