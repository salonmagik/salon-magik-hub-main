# Second Owner Foundation — Implementation Design

- slug: `co-owner-role`
- date: 2026-09-08

---

# References

- Planning Brief: `docs/prd/second-owner-foundation.prd.md`
- Technical Brief: `docs/research/2026-09-08-second-owner-foundation.md`
- Backlog: `docs/backlog-open-followups.md` → *co-owner-role*

Both are assumed open alongside this document. What the feature is, why, and its acceptance
criteria live there and are not restated here. FR-*/AC-* references below point at the Planning
Brief.

---

# Additional Investigation Findings

The Technical Brief left one item unresolved (`[engineering]`: how the payout/withdrawal surfaces
are authorised) and this design's own reading turned up two further single-owner assumptions the
brief did not reach. All three are settled here because they change the shape of the work.

### F-1 — The payout and withdrawal edge functions perform no authorization at all

`supabase/functions/create-payout-destination/index.ts` and
`supabase/functions/process-salon-withdrawal/index.ts` both verify that the caller holds a valid
JWT and then immediately switch to the service-role client. Neither ever reads `user_roles`, and
`tenantId` is taken **from the request body**. `salon_payout_destinations`, `salon_withdrawals`
and `salon_wallets` have **no RLS policies and no `enable row level security`** (verified: the
creating migrations `20260221120002` / `20260221120003` enable nothing, and no later migration
adds a policy to any of the three).

The only gate is client-side, in `apps/salon-admin/src/pages/salon/PayoutsPage.tsx:75-79`:
owner-hub context plus `currentRole ∈ {owner, manager, supervisor}`.

Consequences:
- FR-4/AC-4 are *trivially* satisfied today — either owner can already do this, because
  **anybody** can. That is not the answer FR-4 wants; "proven" has to mean proven against a real
  server-side check.
- This is a live cross-tenant authorization hole on the money path: any authenticated Salon Magik
  user can post another salon's `tenantId` and redirect that salon's payout destination or drain
  its wallet.

This design therefore adds the missing server-side check. It is in scope because FR-4 cannot be
satisfied honestly without it, and because shipping "two people can move the money" on top of an
unauthorised endpoint is not acceptable.

### F-2 — A second owner who already holds another role in the salon breaks every billing gate

The realistic co-owner is not a stranger: it is the salon's existing manager or supervisor. Adding
an `owner` row for them leaves them with **two active `user_roles` rows for the same tenant**
(`UNIQUE(user_id, tenant_id, role)` permits this — it is unique per *role*).

Ten owner-gated edge functions resolve the caller's role like
`create-checkout-session/index.ts:58-64`:

```ts
.from("user_roles").select("role").eq("user_id", user.id).eq("tenant_id", tenantId).single()
```

`.single()` **errors when more than one row matches**, `userRole` comes back `undefined`, and the
function returns `403 Only owners can manage billing`. So the co-owner would appear to have owner
access in the UI (`normalizeUserRoles` in `useAuth.tsx:95-117` collapses to the newest active row,
which is the new owner row) and then fail at checkout, cancellation, and every payment-verification
endpoint. That is exactly the "silent inequality" risk the Planning Brief names.

Affected: `create-checkout-session`, `create-plan-configuration-checkout-session`,
`create-theme-purchase-checkout-session`, `create-recurring-billing-retry-session`,
`verify-subscription-payment`, `verify-plan-configuration-payment`, `verify-theme-purchase-payment`,
`verify-recurring-billing-retry-session`, `manage-subscription-cancellation`, and
`revoke-staff-session` (`callerRole?.role === "owner"`).

### F-3 — Backoffice's tenant list resolves "the owner" as a singleton

`apps/backoffice/src/hooks/useTenants.tsx:46-53` keeps only the **first** `role === 'owner'` row it
encounters (`if (role.role === "owner" && !existing.owner_user_id)`), does not filter
`is_active`, and maps it through `profilesMap`, which is built from `profiles.full_name` — so the
field named `owner_email` has never contained an email. `TenantsPage.tsx:322,351,524` renders that
single value and gates the existing "Add owner" menu item on `!tenant.owner_email`.

---

# Architecture Decisions

### AD-1 — Ownership stays modelled as `user_roles` rows; no schema change for multiplicity

**Decision.** Keep `public.user_roles(user_id, tenant_id, role)` as the sole representation of
ownership. Do not add `tenants.owner_id`, an `owners` table, or a "primary owner" marker.

**Reasoning.** The table already permits N owner rows per tenant, and `has_role()`,
`is_tenant_owner()`, every per-caller role check, and both notification fan-out paths are already
set-based. The data model is not the thing that is single-owner; two guards and three lookups are.
Introducing any owner-pointer column would create exactly the "primary owner" tier FR-3 forbids.

**Rejected.** *A `tenants.primary_owner_id` column* — reintroduces ordering between owners, needs
backfill and a maintenance rule on owner removal, and buys nothing: no requirement here needs to
name one owner. *A partial unique index capping owners at two* — Postgres cannot express
"at most N rows per group" as an index; a trigger could, but see AD-4.

### AD-2 — A distinct `backoffice-add-tenant-co-owner` function, not a relaxed recovery guard

**Decision.** Add a new edge function `supabase/functions/backoffice-add-tenant-co-owner/`.
`backoffice-add-tenant-owner` keeps its 409 "This salon already has an owner." guard **byte for
byte** (FR-7/AC-5). The new function is the mirror image: it requires the salon to already have
exactly one active owner and refuses a salon with none, pointing support at the recovery action.

**Reasoning.** Two mutually exclusive preconditions make the pair self-checking — a mis-click
lands on a refusal instead of an unintended ownership grant. It also keeps the recovery function's
audit action (`backoffice.owner_added`) meaning what it has always meant, so history stays
readable.

**Rejected.** *Deleting the guard from the existing function* — the Planning Brief's Assumptions
already settled this at product level; at engineering level it would also collapse two distinct
audit actions into one and make the "silently converted a safety check into an ordinary operation"
failure mode invisible in the log. *Adding a `mode: "recover" | "co_owner"` parameter to the
existing function* — one handler with two authorisation preconditions and two email templates is
harder to reason about than two handlers, and a client-supplied mode flag is a strictly worse
guard than a server-derived precondition. The duplicated super-admin/TOTP preamble is extracted to
`_shared/` (AD-8) so the copy cost is small.

### AD-3 — Invariant: one **active** `user_roles` row per (user, tenant); granting owner deactivates the rest

**Decision.** When the co-owner function grants ownership to someone who already holds an active
non-owner role in the same tenant, it first sets `is_active = false` on those rows in the same
logical operation, then inserts the `owner` row. The whole thing runs inside a new SECURITY DEFINER
RPC, `public.grant_tenant_co_owner(...)`, so deactivate-then-insert is one transaction.

**Reasoning.** F-2 shows the app *already* assumes one effective row per (user, tenant) in three
independent places — `normalizeUserRoles` (`useAuth.tsx:95`), `list_tenant_staff_members`'s
`canonical_roles` `distinct on (ur.user_id)` (`20260306170000_...sql:165-178`), and the `.single()`
role lookups. Promotion-in-place makes the data match that assumption instead of quietly violating
it. It is also the semantically correct outcome: the person is now an owner, not an
owner-and-a-manager.

**Rejected.** *Leaving both rows and teaching every consumer to pick the highest-privilege row* —
touches more code, leaves the DB in a state three existing readers disagree about, and means a
`staff_locations`-scoped manager row silently keeps narrowing an owner's location scope in
`list_tenant_staff_members`. *A DB trigger enforcing single-active-role globally* — would fire on
existing paths (staff invitation, `update_staff_role`) whose current data may already violate it,
turning an unrelated flow into a hard error on deploy. The invariant is enforced where ownership is
granted; hardening in AD-5 covers everything else defensively.

### AD-4 — The two-owner cap lives in the co-owner function, not in the database

**Decision.** Count active owners in `grant_tenant_co_owner` and raise if the count is already 2.
No trigger, no constraint.

**Reasoning.** The cap is a product policy the Planning Brief expects to raise later ("a one-line
product decision"), and the only path that can create a second owner is this one function —
onboarding creates the first owner of a brand-new tenant, and recovery requires zero owners. A DB
trigger would additionally have to be reasoned about by every future path and would surface as an
opaque `P0001` rather than the specific, support-actionable message FR-2 requires.

**Rejected.** *A trigger mirroring `enforce_single_owner_tenant`* — defence in depth is attractive
here, but the counter-argument is concrete: the message must name the current owners (FR-2), which
a trigger cannot do cleanly, and a stray future backfill or support SQL hitting a hard exception is
a worse failure than the cap being advisory at the DB layer. Revisit when `co-owner-invite` adds a
second write path.

### AD-5 — One shared caller-role resolver for edge functions, replacing `.single()`

**Decision.** Add `supabase/functions/_shared/tenant-auth.ts` exporting

```ts
resolveTenantRoles(client, userId, tenantId): Promise<string[]>   // active rows only
requireTenantRole(client, userId, tenantId, allowed: string[]): Promise<{ ok, role?, response? }>
```

implemented as a plain `select("role, is_active").eq(user).eq(tenant)` with no `.single()`,
filtering `coalesce(is_active, true)`. Replace the `.single()` role lookup in the ten functions
listed in F-2 with `requireTenantRole(..., ["owner"])`, preserving each function's existing 403
body and status verbatim.

**Reasoning.** This is the direct fix for F-2 and it is what makes FR-3/AC-3 true rather than
coincidentally true. Doing it in one shared helper rather than ten local edits means the next
owner-gated function inherits the correct behaviour, and it gives the payout functions (AD-6)
something to call. It is also strictly more correct than today independent of co-ownership:
`.single()` on a role lookup is a latent 403 for any user with two role rows, and none of these
functions currently filter `is_active`, so a deactivated ex-owner can still open a checkout session.

**Rejected.** *Adding `.eq("role", "owner").maybeSingle()` in each function* — fixes the crash but
still ignores `is_active` and does not generalise to the owner/manager/supervisor set the payout
functions need. *Moving these gates into RLS* — these functions deliberately use the service-role
client for their writes; converting them is a much larger change than this item warrants.

### AD-6 — Payout and withdrawal get the server-side gate they never had, mirroring the client gate

**Decision.** In both `create-payout-destination` and `process-salon-withdrawal`, immediately after
`auth.getUser()`, call `requireTenantRole(userClient, user.id, tenantId, ["owner","manager","supervisor"])`
and return `403 { error: "You don't have permission to manage payouts for this salon." }` on
failure. `process-salon-withdrawal` additionally verifies that `payoutDestinationId` belongs to
`tenantId` before use.

**Reasoning.** F-1. The allowed role set is copied from the existing client gate
(`PayoutsPage.tsx:77-79`) precisely so that no salon loses access it has today — this closes a hole
without changing anyone's permissions. Because the check is per-caller and set-based, it is
multi-owner-correct by construction, which is what AC-4 asks to be proven.

**Rejected.** *Restricting these to `owner` only* — would be a live regression for managers and
supervisors who configure payouts today, and the Planning Brief's Out of Scope explicitly forbids
changing what owner-level access means. *Enabling RLS on the three payout tables instead* — the
right long-term answer and worth its own item, but these functions run as service-role, so RLS
would not gate them; it would only harden direct client reads. Recorded in Open Questions.

### AD-7 — `check_owner_invite_email` becomes tenant-aware; existing callers keep working

**Decision.** Drop `public.check_owner_invite_email(text)` and create
`public.check_owner_invite_email(p_email text, p_tenant_id uuid default null)`. With
`p_tenant_id` null the returned reasons are byte-identical to today. With a tenant supplied, the
`already_owner` case splits into `already_owner_this_tenant` and `already_owner_other_tenant`, and
a target holding a non-owner role **in that same tenant** returns
`available: true, note: 'existing_member'` instead of the blanket `existing_account` rejection.

**Reasoning.** FR-12/AC-7 needs the two "already an owner" cases distinguished, and F-2's realistic
case (promoting the salon's own manager) is currently rejected outright by `existing_account`. Drop
and recreate rather than adding an overload: a 2-arg-with-default overload sitting beside the 1-arg
function makes single-argument calls ambiguous at resolution time. The two existing 1-arg
callers — `OnboardingPage.tsx:223` and `AddTenantOwnerDialog.tsx:78` — resolve to the new function
unchanged and see identical behaviour.

**Rejected.** *A separate `check_co_owner_email` function* — duplicates the auth-user lookup and
the enumeration-safety reasoning, and leaves two functions to keep in step. *Leaving the RPC alone
and doing the classification inside the edge function* — the edge function would need `auth.users`
access it otherwise does not need, and the backoffice dialog needs the same answer *before*
submitting, which is the whole reason the RPC exists.

### AD-8 — Shared super-admin + fresh-TOTP preamble

**Decision.** Extract the caller check from `backoffice-add-tenant-owner/index.ts:73-112` into
`supabase/functions/_shared/backoffice-elevated-auth.ts`
(`requireSuperAdminWithFreshTotp(admin, authClient, totpToken)`), and have both the recovery
function and the new co-owner function call it.

**Reasoning.** NFR "the path to add a co-owner must not be looser than the existing owner-recovery
action" is best guaranteed by it being *literally the same code*, not a copy that can drift. The
existing function's inline comments explaining why this bar is deliberately stricter than the
backoffice permission-template system move with it.

**Rejected.** *Copy-pasting the preamble* — the two would drift, and drift here is a privilege
escalation.

### AD-9 — Correct home

All changes land in this repository: `supabase/migrations`, `supabase/functions`,
`apps/backoffice`, and `apps/salon-admin`. Tenant/ownership modelling is not owned by any shared
package — `packages/shared`, `packages/ui` and `packages/supabase-client` contain no ownership
logic (`packages/supabase-client` holds only generated `types.ts`, which is regenerated, not
hand-edited). No `CLAUDE.md` or project doc states a placement rule for this kind of change. This
matches the Technical Brief's *Existing Implementation & Placement* conclusion.

### AD-10 — `is_tenant_owner` and `getSalonRecipients` start respecting `is_active`

**Decision.** Add `and coalesce(is_active, true)` to `public.is_tenant_owner` and an
`is_active` filter to `getSalonRecipients` (`_shared/salon-notifications.ts:26-30`).

**Reasoning.** Both currently treat a deactivated owner row as live. With one owner per salon that
was near-unreachable (deactivating the sole owner is not a flow that exists). With two owners,
deactivating one becomes the only mechanism support has to undo a co-owner grant — and today it
would leave that person holding RLS ownership and still receiving the salon's billing mail. Both
edits strictly narrow, so no active user loses anything.

**Rejected.** *Deferring to the owner-removal item* — that item does not exist yet, and this change
makes a wrong grant unrecoverable in the meantime.

---

# Components

**New**
- `supabase/functions/backoffice-add-tenant-co-owner/index.ts` — super-admin + fresh-TOTP action
  that grants a second owner (FR-5, FR-6, FR-13).
- `supabase/functions/_shared/tenant-auth.ts` — `resolveTenantRoles` / `requireTenantRole` (AD-5).
- `supabase/functions/_shared/backoffice-elevated-auth.ts` — `requireSuperAdminWithFreshTotp` (AD-8).
- `public.grant_tenant_co_owner(p_tenant_id uuid, p_user_id uuid)` — SECURITY DEFINER RPC:
  cap check, self-check, deactivate prior roles, insert owner row, all in one transaction (AD-3, AD-4).
- `public.get_tenant_owners(p_tenant_id uuid)` — SECURITY DEFINER RPC returning every active owner
  of a tenant (`user_id, full_name, email, granted_at`), gated on
  `has_backoffice_role(auth.uid(), 'super_admin')` (FR-6, F-3).
- `apps/backoffice/src/components/AddCoOwnerDialog.tsx` — the "Add co-owner" flow.

**Changed**
- `supabase/functions/create-payout-destination/index.ts`,
  `supabase/functions/process-salon-withdrawal/index.ts` — server-side authorization (AD-6) and
  all-owner notification (FR-10).
- The ten owner-gated functions in F-2 — `.single()` → `requireTenantRole` (AD-5).
- `supabase/functions/backoffice-add-tenant-owner/index.ts` — preamble extracted (AD-8); guard
  unchanged.
- `supabase/functions/_shared/salon-notifications.ts` — `is_active` filter (AD-10).
- `public.check_owner_invite_email` — tenant-aware (AD-7).
- `public.is_tenant_owner` — `is_active` filter (AD-10).
- `apps/backoffice/src/hooks/useTenants.tsx` — `owner_email: string | null` → `owners: TenantOwner[]`.
- `apps/backoffice/src/pages/TenantsPage.tsx` — render all owners; add the "Add co-owner" item.
- `packages/supabase-client/src/supabase/types.ts` — regenerated for the RPC signature changes.

**Unchanged, and verified so** — `public.has_role`, all RLS policies,
`apps/salon-admin/src/hooks/useAuth.tsx`, `usePermissions.tsx`,
`components/banners/BannerContext.tsx`, `pages/salon/StaffPage.tsx`,
`list_tenant_staff_members`, `_shared/payment-webhook-processor.ts`,
`enforce_single_owner_tenant`, and the `"Users can create own user_role"` RLS policy. FR-11 needs
no code: `canonical_roles` in `list_tenant_staff_members` is `distinct on (ur.user_id)` across the
whole tenant, so a second owner already appears in the salon-admin team listing with the Owner
label; AC-3's listing assertion is a test, not an edit.

---

# Data Flow

### Adding a co-owner

```
Backoffice ▸ Tenants ▸ ⋯ ▸ "Add co-owner"           (shown only when active owners == 1)
  │
  ├─ rpc get_tenant_owners(tenantId)                → renders "This salon's current owner: …"  (FR-6)
  ├─ rpc check_owner_invite_email(email, tenantId)  → inline validation before TOTP  (FR-12)
  │      already_owner_this_tenant  → "… is already an owner of this salon."   stop
  │      already_owner_other_tenant → "… already owns another salon."          stop
  │      existing_account           → "… has an account under a different role
  │                                     elsewhere and can't be added yet."     stop
  │      available (± existing_member note) → continue
  ├─ confirmation + 6-digit TOTP
  └─ invoke backoffice-add-tenant-co-owner
        │
        ├─ requireSuperAdminWithFreshTotp                              401/403/400
        ├─ tenant exists?                                              404
        ├─ get_tenant_owners → 0 owners  → 409 "use Add owner instead"
        │                   → 2 owners  → 409 "already has the maximum of two
        │                                       owners (A, B)"          (FR-2/AC-2)
        ├─ confirmedOwnerUserIds must equal the current owner set       409 (FR-6)
        ├─ resolve/create auth user for email  (+ profiles upsert)
        ├─ target already active owner of this tenant → 200 {status:"already_owner"} no-op (AC-7)
        ├─ rpc grant_tenant_co_owner(tenantId, userId)   ── one transaction ──
        │      re-count owners (cap)  ▸ deactivate the target's other active
        │      rows in this tenant  ▸ insert user_roles(role:'owner', is_active)
        │      trg_enforce_single_owner_tenant fires → P0001 if they own elsewhere (AC-6)
        ├─ audit_logs: action 'backoffice.co_owner_added'                       (FR-NFR/AC-13)
        ├─ email the new co-owner
        └─ email the existing owner: "<name> now has owner access to <salon>"
```

### Either owner using the money path

```
salon-admin PayoutsPage  (client gate: owner_hub ∧ role ∈ {owner,manager,supervisor})
  → usePayoutDestinations / useWithdrawals
    → create-payout-destination | process-salon-withdrawal
        auth.getUser()
        requireTenantRole(user.id, body.tenantId, [owner,manager,supervisor])   ← NEW, 403
        [withdrawal] payoutDestination.tenant_id === tenantId ?                 ← NEW, 403
        …existing Paystack + service-role work, unchanged…
        getSalonRecipients(tenantId, ["owner"])  → email every active owner     ← NEW (FR-10)
```

The runtime owner-gated read path is unchanged: RLS `has_role(auth.uid(), tenant_id, 'owner')` is a
per-row `EXISTS`, so it is already true for both owners.

---

# API Changes

Edge functions are the API surface; none of the changes below break an existing caller.

**New — `POST /functions/v1/backoffice-add-tenant-co-owner`**

```jsonc
// request
{ "tenantId": "uuid", "email": "string",
  "firstName": "string", "lastName": "string", "phone": "string|null",
  "confirmedOwnerUserIds": ["uuid"],   // must match the server's current owner set (FR-6)
  "totpToken": "123456" }

// 200
{ "success": true,
  "status": "new_account" | "existing_account" | "promoted_member" | "already_owner",
  "owners": [{ "userId": "uuid", "fullName": "string", "email": "string" }] }

// errors: 401 unauthenticated / bad TOTP · 403 not super_admin · 400 missing or invalid fields
//         404 salon not found · 409 policy refusal (see Error Handling) · 500 unexpected
```

`firstName`/`lastName` are required only when the email has no existing auth account; the server
decides, and returns 400 naming the missing field when it needs them.

**Changed — `check_owner_invite_email(p_email text, p_tenant_id uuid default null)`**

New reason values `already_owner_this_tenant`, `already_owner_other_tenant`, and the
`note: "existing_member"` field, all reachable only when `p_tenant_id` is supplied. One-argument
calls behave exactly as before. Grants: `authenticated` and `service_role`, as today.

**New RPCs** — `get_tenant_owners(p_tenant_id uuid)` (execute: `authenticated`, self-gated on
`has_backoffice_role(auth.uid(), 'super_admin')`) and `grant_tenant_co_owner(p_tenant_id uuid,
p_user_id uuid)` (execute: `service_role` **only** — never granted to `authenticated`, since it is
a raw ownership grant).

**Unchanged** — `backoffice-add-tenant-owner`'s contract, including its 409 body.

---

# Database Changes

One migration, `supabase/migrations/<ts>_co_owner_foundation.sql`. No table, column, index, or
enum changes; ownership multiplicity needs none (AD-1). No backfill: every existing salon keeps
exactly the owner rows it has (AC-12).

```sql
-- 1. is_active-aware ownership (AD-10). Strictly narrowing.
create or replace function public.is_tenant_owner(_user_id uuid, _tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and tenant_id = _tenant_id
      and role = 'owner' and coalesce(is_active, true)
  )
$$;

-- 2. Tenant-aware owner-email pre-check (AD-7). Drop-and-recreate, not an overload.
drop function if exists public.check_owner_invite_email(text);
create or replace function public.check_owner_invite_email(
  p_email text, p_tenant_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
  -- p_tenant_id null  → verbatim legacy behaviour for OnboardingPage / AddTenantOwnerDialog
  -- owner row on p_tenant_id        → available:false, reason 'already_owner_this_tenant'
  -- owner row on any other tenant   → available:false, reason 'already_owner_other_tenant'
  -- non-owner role on p_tenant_id   → available:true,  note 'existing_member'
  -- any other pre-existing account  → available:false, reason 'existing_account'
$$;
grant execute on function public.check_owner_invite_email(text, uuid) to authenticated, service_role;

-- 3. Owner roster for the confirmation step (FR-6, F-3).
create or replace function public.get_tenant_owners(p_tenant_id uuid)
returns table (user_id uuid, full_name text, email text, granted_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role) then
    raise exception 'BACKOFFICE_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return query
    select ur.user_id, p.full_name, u.email::text, ur.created_at
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.profiles p on p.user_id = ur.user_id
    where ur.tenant_id = p_tenant_id and ur.role = 'owner' and coalesce(ur.is_active, true)
    order by ur.created_at asc;   -- display order only; confers no precedence (FR-3)
end $$;
grant execute on function public.get_tenant_owners(uuid) to authenticated;

-- 4. Transactional grant (AD-3, AD-4). service_role only.
create or replace function public.grant_tenant_co_owner(p_tenant_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
  -- CO_OWNER_ALREADY_OWNER            target already owns this tenant → {status:'already_owner'}
  -- CO_OWNER_CAP_REACHED              active owners on tenant >= 2
  -- CO_OWNER_NO_EXISTING_OWNER        active owners on tenant = 0 (use recovery)
  -- otherwise: update user_roles set is_active=false
  --              where user_id=p_user_id and tenant_id=p_tenant_id
  --                and role <> 'owner' and coalesce(is_active,true);
  --            insert into user_roles(user_id, tenant_id, role, is_active)
  --              values (p_user_id, p_tenant_id, 'owner', true);
  --            → {status: 'promoted_member' | 'granted', deactivated_roles: [...]}
$$;
revoke all on function public.grant_tenant_co_owner(uuid, uuid) from public, authenticated;
grant execute on function public.grant_tenant_co_owner(uuid, uuid) to service_role;
```

**Indexes.** None added. Every new query filters `user_roles` on `tenant_id` and/or `user_id`;
`user_roles` already carries the `UNIQUE(user_id, tenant_id, role)` index, whose leading `user_id`
serves the per-caller lookups, and the tenant-scoped lookups here return at most a handful of rows
per salon. Verify with `explain` during implementation before assuming an index is unnecessary on
`(tenant_id, role)`; add `idx_user_roles_tenant_role` only if the plan shows a seq scan (see
Performance).

**Untouched, deliberately** — `enforce_single_owner_tenant` and the
`"Users can create own user_role"` RLS policy. The first is the "one person, one salon" rule the
Planning Brief preserves (FR-8) and is load-bearing for AC-6; the second is what stops any
client-side path from granting ownership to someone else, which the NFRs require to stay shut. The
co-owner grant reaches `user_roles` only through service-role, so the policy is not in its way.

---

# Validation

**`backoffice-add-tenant-co-owner`, in order** — each step returns before the next runs:

1. Bearer token present; `auth.getUser()` succeeds.
2. Caller is an active `super_admin` in `backoffice_users`.
3. `tenantId`, `email`, `totpToken`, `confirmedOwnerUserIds` present.
4. Email matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; normalise to `trim().toLowerCase()`.
5. TOTP validated fresh against `boUser.totp_secret`, `window: 1`.
6. Tenant exists.
7. `get_tenant_owners(tenantId)`: exactly 1 → proceed; 0 → refuse (recovery action); ≥2 → refuse (cap).
8. `confirmedOwnerUserIds` is set-equal to the returned owner ids — refuse otherwise, so a
   confirmation shown against stale state cannot be submitted.
9. `check_owner_invite_email(email, tenantId)` for the classification in Error Handling.
10. If creating a new account: `firstName` and `lastName` non-empty after trim.
11. `grant_tenant_co_owner` re-checks the cap, the no-existing-owner case, and the
    already-an-owner case **inside the transaction** — steps 7-9 are for messaging, not for safety.

**`create-payout-destination` / `process-salon-withdrawal`** — existing field validation is
unchanged and stays where it is; the new membership check runs *before* it, so an unauthorised
caller gets 403 rather than a 400 that confirms the shape of another salon's data.
`process-salon-withdrawal` additionally asserts
`payoutDestination.tenant_id === tenantId` before the transfer.

---

# Error Handling

| Condition | Status | Message |
|---|---|---|
| Not super_admin / inactive | 403 | `Super admin access required` (unchanged wording) |
| TOTP not configured | 400 | `TOTP is not configured for your account` |
| Bad TOTP | 401 | `Invalid verification code` |
| Salon not found | 404 | `Salon not found` |
| Salon has no active owner | 409 | `This salon has no owner yet. Use "Add owner" to assign the first one.` |
| Salon already has two owners | 409 | `This salon already has the maximum of two owners (Ama Mensah, Kofi Osei).` |
| Confirmed owner set is stale | 409 | `This salon's owners changed while you were confirming. Reopen the dialog and try again.` |
| Target already owns this salon | **200** | `{status:"already_owner"}` — `Kofi Osei is already an owner of this salon. No change was made.` |
| Target owns another salon | 409 | `This email already owns another salon on Salon Magik.` |
| Target has an account under another role elsewhere | 409 | `This email has a Salon Magik account under a different role at another salon and can't be made an owner yet.` |
| `createUser` fails | 500 | Paystack-style: log, return `Failed to create account` |
| `grant_tenant_co_owner` raises `P0001` | 409 | mapped by error code, never by substring match |

Three deliberate choices:

- **The already-an-owner case is a 200, not a 409.** AC-7 calls it a no-op with an explanatory
  message; support asked for an outcome ("is this person an owner?") and the answer is yes.
  Returning an error would push the dialog into a failure state for a situation where nothing is
  wrong.
- **`P0001` messages are mapped by `errcode`, not by string matching.** The existing function does
  `roleError.message?.includes("already owns")` (`backoffice-add-tenant-owner/index.ts:198`); the
  new code raises named exceptions and switches on them. The old call site keeps its substring
  check — changing it is not this item's business — but the new one does not copy the pattern.
- **Rollback on failure.** If `grant_tenant_co_owner` fails *after* a new auth user was created,
  delete that auth user, exactly as the recovery function does at `index.ts:200`. The RPC itself is
  a single transaction, so a partial grant is not reachable.

**Payout functions.** The new 403 body is `You don't have permission to manage payouts for this
salon.` — it must not distinguish "you aren't a member" from "that salon doesn't exist", which
would make the endpoint a tenant-enumeration oracle. Notification failures are logged and
swallowed; a Resend outage must never fail a withdrawal that has already moved money.

---

# Security Considerations

- **Elevated bar preserved by construction.** Both ownership-granting functions call the same
  `requireSuperAdminWithFreshTotp` (AD-8). Fresh TOTP every time, never the session-level
  "already verified" flag — the existing function's inline rationale carries over verbatim.
- **No client-side ownership grant.** `grant_tenant_co_owner` is granted to `service_role` only and
  explicitly revoked from `authenticated` and `public`. The `"Users can create own user_role"` RLS
  policy (`auth.uid() = user_id`) is untouched, so the only way a `user_roles` owner row appears
  for a *different* user remains a service-role edge function. This is the NFR requirement and is
  worth an explicit test (T-9).
- **Closing a live cross-tenant hole (F-1).** This is the highest-value security change in the
  item: today any authenticated user can redirect any salon's payout destination or request a
  withdrawal against any salon's wallet by supplying that salon's `tenantId`. Treat it as such
  during review, and prefer landing steps 1-2 of the Implementation Order ahead of the rest.
- **Deactivated owners lose access (AD-10).** With two owners, `is_active = false` becomes support's
  only undo for a mistaken grant; without the `is_tenant_owner` fix that undo does nothing at the
  RLS layer.
- **Auditability (AC-13).** `backoffice.co_owner_added` in `audit_logs` carries `tenant_id`,
  `actor_user_id`, `entity_id`, and metadata `{ email, target_user_id, status, deactivated_roles,
  prior_owner_user_ids }` — enough to reconstruct the grant and, if the co-owner was promoted from
  manager, to reverse it. Distinct from `backoffice.owner_added` so recovery and co-ownership stay
  separable in the log.
- **No enumeration surface added.** `check_owner_invite_email` keeps returning only a reason code,
  never account details; the new reasons distinguish states the caller (a super-admin acting on a
  named salon) already has the right to know. `get_tenant_owners` self-gates on
  `has_backoffice_role(auth.uid(), 'super_admin')` rather than trusting its `authenticated` grant.
- **`SET search_path` on every new SECURITY DEFINER function**, matching existing convention.
- **Money-movement visibility (FR-10).** Either owner can change a payout destination; the
  compensating control is that both are told. That mail is the mitigation for the Planning Brief's
  "financial exposure" risk, so it is a requirement, not a nicety.

---

# Performance Considerations

- **`requireTenantRole` adds one indexed query** to each gated function: `user_roles` filtered by
  `user_id` and `tenant_id`, served by the leading columns of `UNIQUE(user_id, tenant_id, role)`,
  returning ≤5 rows. For the ten billing functions this *replaces* a query rather than adding one.
  For the two payout functions it is one extra round trip on a flow that already makes several
  Paystack calls — immaterial.
- **Fetch by key, never scan-and-filter.** `get_tenant_owners` filters on `tenant_id`, `role`, and
  `is_active` **in the query**; the owner count for the cap comes from that same result set, not
  from loading `user_roles` and counting in TypeScript. `process-salon-withdrawal` looks the payout
  destination up by its `id` and asserts its `tenant_id`, rather than listing the tenant's
  destinations and searching.
- **Check the plan for `(tenant_id, role)`.** The tenant-scoped lookups
  (`get_tenant_owners`, `grant_tenant_co_owner`'s cap count, `getSalonRecipients`) have no leading
  `tenant_id` index — `idx_user_roles_tenant` may not exist on this table. Run `explain` on
  `get_tenant_owners` against a realistic `user_roles` before merging; if it seq-scans, add
  `create index idx_user_roles_tenant_role on public.user_roles(tenant_id, role) where coalesce(is_active, true);`
  in the same migration. Do not add it speculatively.
- **`useTenants` gets cheaper, not dearer.** It currently pulls **every `user_roles` row in the
  system** into the browser (`.select("tenant_id, user_id, role")` with no filter) to compute per-
  tenant staff counts and an owner. Replacing the owner half with a per-tenant `get_tenant_owners`
  call for the *selected* tenant only — rather than for all of them — keeps the list query as it is
  and moves owner resolution to the detail/dialog path where at most one tenant is involved.
- **No N+1 in the notification fan-out.** `getSalonRecipients` already batches: one `user_roles`
  query, one `profiles` query over the collected ids. It then loops `auth.admin.getUserById` per
  user — pre-existing, and bounded by 2 for an owners-only call, so not worth changing here.

---

# Compatibility

**Backward compatibility.**
- Single-owner salons are untouched: no migration writes to `user_roles`, and every guard added is
  a refusal path that a single-owner salon does not reach (AC-12).
- `check_owner_invite_email`'s one-argument callers (`OnboardingPage.tsx:223`,
  `AddTenantOwnerDialog.tsx:78`) get identical results. The drop-and-recreate is not
  transactionally visible to running clients in a way that matters — the function is recreated in
  the same migration transaction.
- `backoffice-add-tenant-owner`'s request and response contract, its 409 body, and its audit action
  are unchanged (AC-5).
- The ten billing functions keep their existing 403 status and message; only the query behind the
  decision changes.
- **The payout 403 is the one behaviour change to call out.** Callers who are not members of the
  salon they name will now be refused. No legitimate salon-admin user is in that set — the client
  already refuses to render the page for them — but it is a real change and belongs in the release
  note.

**Migration strategy.** One forward-only SQL migration plus edge-function deploys; no data
migration, no backfill, no dual-write window. Deploy order: migration first (the new RPCs must
exist before the functions that call them), then edge functions, then the two frontends. Steps 1-2
of the Implementation Order are independently deployable and carry the security fix, so they can
ship ahead of the rest.

**Deprecation strategy.** Nothing is deprecated. `backoffice-add-tenant-owner` keeps its narrow
recovery purpose indefinitely. `check_owner_invite_email`'s one-argument form stays supported;
`co-owner-invite` will be the first caller to pass a tenant.

**Rollback.** Reverting the edge functions restores today's behaviour completely. The migration is
safe to leave in place on rollback: every new function is additive, and the two modified functions
(`is_tenant_owner`, `check_owner_invite_email`) are supersets of, or strictly narrowing versions
of, what callers expect. Any co-owner rows already created remain valid and keep working — the
runtime permission path never depended on this item's changes.

---

# Edge Cases

1. **Co-owner is the salon's own manager.** The common case (F-2). Their manager row is deactivated
   and an owner row inserted, in one transaction; response `promoted_member`. Their
   `staff_locations` rows are left alone — harmless, since `list_tenant_staff_members` gives owners
   all tenant locations regardless (`20260306170000_...sql:190-198`), and leaving them preserves the
   history if the grant is ever reversed.
2. **Co-owner is a client-portal user or staff at an unrelated salon.** Rejected with the
   `existing_account` message. Supporting it means adding an existing account to a new tenant,
   which `send-staff-invitation` cannot do either — out of scope, recorded in Open Questions.
3. **Target email has no account.** Created with a temp password and
   `requires_password_change: true`, exactly as the recovery function does — consistent with the
   project's staff-onboarding convention. `profiles` is **upserted**, not inserted, because a DB
   trigger on `auth.users` already creates a stub row.
4. **Both owners deactivated.** The salon has zero active owners; the co-owner action refuses and
   points at the recovery action, which now correctly sees no active owner (AD-10 makes
   `is_tenant_owner` agree). The two actions stay mutually exclusive at every owner count.
5. **Concurrent grants for the same salon.** Two support agents could both pass the step-7 count.
   `grant_tenant_co_owner` re-counts inside the transaction; the loser gets `CO_OWNER_CAP_REACHED`.
   The cap is not enforced by a constraint (AD-4), so the re-count must use
   `select … from user_roles where tenant_id = … for update` semantics or an advisory lock on
   `p_tenant_id` — implementer should take `pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0))`,
   which is simpler than row-locking a set that may be empty.
6. **Target already owns another salon.** Caught at step 9 for a clean message, and again by
   `trg_enforce_single_owner_tenant` inside the transaction (AC-6). Both layers matter: the trigger
   is the guarantee, the pre-check is the message.
7. **Deactivated owner row exists for the target on this tenant.** They are not an active owner, so
   the cap count excludes them, and the insert hits `UNIQUE(user_id, tenant_id, role)`.
   `grant_tenant_co_owner` must therefore **reactivate** the existing row rather than insert, when
   one is present — an `on conflict (user_id, tenant_id, role) do update set is_active = true`.
8. **A user holding two role rows arrives at a billing endpoint.** Pre-existing data may already
   contain this. `requireTenantRole` returns the set and checks membership, so it succeeds where
   `.single()` returned 403 (AD-5). This is a fix, not a regression.
9. **Withdrawal against another salon's payout destination.** Blocked by the new
   `payoutDestination.tenant_id === tenantId` assertion, independently of the membership check.
10. **Notification to an owner with no email.** `getSalonRecipients` skips users it cannot resolve
    an email for; the send proceeds for the rest. A missing address must not fail the money
    operation.
11. **Owner changes the payout destination for a specific branch.** `salon_payout_destinations` has
    `location_id`; FR-10's notice goes to *tenant* owners regardless of branch — owners see all
    locations, so branch scoping does not narrow the audience.
12. **Backoffice list with two owners.** `TenantsPage` renders both; the "Add co-owner" item is
    hidden at 0 owners (recovery applies) and at 2 (cap reached), so the menu never offers an
    action that will be refused.

---

# Tests Required

**Unit (Deno, `supabase/functions/<fn>/index.test.ts`, following the existing
`verify-recurring-billing-retry-session/index.test.ts` mock-client pattern)**

- T-1 `_shared/tenant-auth.ts`: single owner row → allowed; owner + manager rows → allowed (the
  F-2 regression); manager only, `["owner"]` → denied; inactive owner row → denied; no rows →
  denied.
- T-2 `backoffice-add-tenant-co-owner`: non-super-admin → 403; bad TOTP → 401; unknown tenant →
  404; 0 owners → 409 recovery message; 2 owners → 409 cap message naming both; stale
  `confirmedOwnerUserIds` → 409; already-owner → 200 `already_owner`; owns-another-salon → 409;
  happy path → 200 and one `audit_logs` insert with action `backoffice.co_owner_added`;
  `grant_tenant_co_owner` failure after account creation → the auth user is deleted.
- T-3 `backoffice-add-tenant-owner`: unchanged — a tenant with an active owner still gets
  `409 "This salon already has an owner."` (AC-5). Pins AD-2.
- T-4 `create-payout-destination` / `process-salon-withdrawal`: non-member → 403 with the generic
  body; manager → allowed; **either** owner → allowed (AC-4); mismatched
  `payoutDestinationId`/`tenantId` → 403; successful call fans a notification out to both owners
  (AC-10); a throwing Resend call does not fail the withdrawal.
- T-5 `create-checkout-session` (representative of the ten): caller holding both an owner and a
  manager row is allowed. This is the test that would have caught F-2.

**Integration (pgTAP-style SQL, `supabase/tests/co_owner_foundation.sql`, alongside
`subscription_lifecycle.sql`)**

- T-6 `grant_tenant_co_owner`: 1 owner → second granted; 2 owners → `CO_OWNER_CAP_REACHED`
  (AC-2); 0 owners → `CO_OWNER_NO_EXISTING_OWNER`; promoting a manager deactivates the manager row
  and leaves exactly one active row (AD-3); a previously deactivated owner row is reactivated, not
  duplicated (edge case 7); granting to a user who owns another tenant raises from
  `trg_enforce_single_owner_tenant` (AC-6).
- T-7 `check_owner_invite_email`: one-argument calls return today's reasons verbatim; with a tenant,
  `already_owner_this_tenant` vs `already_owner_other_tenant` vs `existing_member` (AC-7, FR-12).
- T-8 `get_tenant_owners`: returns both owners in `created_at` order; excludes inactive rows;
  raises for a non-super-admin caller.
- T-9 **`grant_tenant_co_owner` is not executable by `authenticated`**, and the
  `"Users can create own user_role"` policy still rejects an owner row inserted for another
  `user_id`. This is the NFR "no client-side path may grant owner access" assertion.
- T-10 `is_tenant_owner` returns false for an `is_active = false` owner row (AD-10).
- T-11 `list_tenant_staff_members` returns both owners with `role = 'owner'` (AC-3 listing, FR-11) —
  asserting the no-change conclusion rather than trusting it.

**End-to-end (manual, on a staging salon with two owners — this item is `checkpoint: true`)**

- E-1 Sign in as owner B (who did not configure it): view the payout destination, change it,
  request a withdrawal. All three succeed, and owner A receives both notifications (AC-4, AC-10).
- E-2 Owner B opens billing: same navigation and owner-only routes as owner A; start a subscription
  checkout (AC-3).
- E-3 Backoffice: add a co-owner end to end, then confirm the third attempt is refused with the cap
  message (AC-1, AC-2, AC-8).
- E-4 Confirm the salon's plan, price, and staff limits are identical before and after (AC-11) —
  a read-only check; nothing in this design touches plan or seat counting, and the second owner is
  not inserted into any staff-count path that bills.

---

# Verification

```bash
# from the repo root
npm run lint
npm run test                                   # turbo → vitest across apps
npm run build                                  # type-checks salon-admin + backoffice

# edge functions (Deno)
deno test --allow-env --allow-net supabase/functions/backoffice-add-tenant-co-owner/index.test.ts
deno test --allow-env --allow-net supabase/functions/create-payout-destination/index.test.ts
deno test --allow-env --allow-net supabase/functions/process-salon-withdrawal/index.test.ts
deno test --allow-env --allow-net supabase/functions/_shared/tenant-auth.test.ts
deno test --allow-env --allow-net supabase/functions/                # full sweep, catches F-2 regressions

# database
supabase db reset                              # applies the new migration from scratch
psql "$SUPABASE_DB_URL" -f supabase/tests/co_owner_foundation.sql
psql "$SUPABASE_DB_URL" -c "explain analyze select * from public.get_tenant_owners('<tenant-uuid>')"

# regenerate types after the RPC signature changes
supabase gen types typescript --local > packages/supabase-client/src/supabase/types.ts
```

Branch promotion follows the project's standing rule: `development` → `main` → `release`. No direct
deploy to production.

---

# Implementation Order

Steps 1-2 are the security fix and are independently deployable; land and verify them before the
rest.

1. **`_shared/tenant-auth.ts`** — `resolveTenantRoles` / `requireTenantRole`, plus T-1.
2. **Payout and withdrawal authorization (AD-6)** — add `requireTenantRole` and the
   destination/tenant assertion to `create-payout-destination` and `process-salon-withdrawal`.
   T-4's authorization cases. *Deployable, and closes F-1.*
3. **Replace `.single()` in the ten owner-gated functions (AD-5)** — mechanical, one function at a
   time, preserving each 403 body. T-5.
4. **Migration `<ts>_co_owner_foundation.sql`** — `is_tenant_owner`, `check_owner_invite_email`,
   `get_tenant_owners`, `grant_tenant_co_owner`, grants and revokes. `explain` the owner lookup and
   add `idx_user_roles_tenant_role` only if warranted. T-6 – T-10.
5. **`_shared/backoffice-elevated-auth.ts` (AD-8)** — extract from `backoffice-add-tenant-owner`
   and have that function call it. Behaviour must not change: T-3 is the pin.
6. **`backoffice-add-tenant-co-owner/index.ts`** — the full validation ladder, the RPC call, the
   audit row, the new-co-owner email, and the existing-owner notice. T-2.
7. **`getSalonRecipients` `is_active` filter (AD-10)**, then FR-10 notifications in the two payout
   functions — email every active owner on destination create/change and on withdrawal request,
   failures logged and swallowed. T-4's notification cases.
8. **Regenerate `packages/supabase-client/src/supabase/types.ts`** — required before the frontend
   work type-checks.
9. **Backoffice `useTenants.tsx`** — `owner_email: string | null` → `owners: TenantOwner[]`
   (`{ userId, fullName, email }`), sourced from `get_tenant_owners` for the selected tenant; fix
   the field that was showing `full_name` under an `owner_email` name.
10. **Backoffice `TenantsPage.tsx`** — render all owners in the row and the detail panel; keep
    "Add owner" gated on zero owners; add "Add co-owner", visible to `super_admin` only when the
    active-owner count is exactly 1.
11. **`AddCoOwnerDialog.tsx`** — three steps: current owners + email (validated via
    `check_owner_invite_email(email, tenantId)`), confirmation showing the current owners, then
    TOTP. Submits `confirmedOwnerUserIds`. Renders `status: "already_owner"` as an informational
    result, not an error.
12. **Manual E2E (E-1 – E-4)** on staging, then stop for the checkpoint review.

Nothing here should require a design decision from the implementer. Where a judgement call remains
it is named in Open Questions.

---

# Open Questions

Resolved autonomously (`--think`), recorded for audit:

- **Q: Is fixing the missing authorization on the payout/withdrawal functions in scope, or is it a
  separate security item? → A: In scope, as steps 1-2 (decided autonomously).** FR-4 requires
  owner-equivalence on this surface to be *proven*, and there is nothing to prove against an
  endpoint with no authorization. Shipping co-ownership on the money path while leaving it open
  would be the wrong trade. Kept deliberately narrow: the allowed role set is copied from the
  existing client gate, so no user's access changes.
- **Q: Should the two-owner cap be a DB trigger as well as an application check? → A: Application
  only, for now (decided autonomously).** See AD-4 — the message must name the current owners, and
  only one write path can create a second owner. Revisit when `co-owner-invite` adds a second path.
- **Q: Promote in place (deactivate the prior role) or allow a user to hold owner + manager rows?
  → A: Promote in place (decided autonomously).** Three existing readers already assume one
  effective row per (user, tenant); AD-3.
- **Q: Should `check_owner_invite_email` gain an overload or be replaced? → A: Dropped and recreated
  with a defaulted second parameter (decided autonomously).** An overload makes one-argument calls
  ambiguous; AD-7.
- **Q: Should the already-an-owner case be an error? → A: A 200 with an explanatory status (decided
  autonomously).** AC-7 describes a no-op with a message, not a failure.

Genuinely open, and deliberately **not** resolved here:

- **RLS on `salon_payout_destinations`, `salon_withdrawals`, and `salon_wallets`.** All three have
  no RLS at all. Steps 1-2 close the edge-function hole, which is the reachable one, but any direct
  client read of these tables is ungated. Confirming whether salon-admin reads them directly (it
  appears to, via `usePayoutDestinations`/`useWithdrawals`) and adding tenant-scoped policies is a
  larger change than this item should absorb — **it should be filed as its own backlog item and
  raised at the checkpoint review.**
- **Adding an existing account from another salon as a co-owner** (edge case 2). Rejected today
  because no path can add a pre-existing account to a new tenant — the same limitation
  `send-staff-invitation` has. `co-owner-invite` will have to solve it; this item does not.
- **Whether `idx_user_roles_tenant_role` is needed.** Deliberately left to an `explain` during
  step 4 rather than guessed at.
