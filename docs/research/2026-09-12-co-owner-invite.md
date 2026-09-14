# Original Request

> Invite and accept flow for a co-owner (backlog item: co-owner-invite). Let an existing owner
> invite someone as a second owner, and let that person accept and get in. Should follow the
> existing staff-invitation patterns (`supabase/functions/send-staff-invitation`), including the
> temp-password onboarding convention already used for staff rather than magic links. Covers the
> invite UI in salon-admin, sending, acceptance, and revoking a pending invite. Dependencies
> `co-owner-role` and `multi-salon-owner-identity` are already done and merged on this branch.

---

# Summary

The pieces this feature needs to compose already exist and were built for two adjacent items:
`grant_tenant_co_owner`/`get_tenant_owners`/`check_owner_invite_email` (co-owner-role, backoffice-only
today) and the generic staff-invitation pipeline (`staff_invitations` table, `send-staff-invitation`,
`complete-password-change`, `useStaffInvitations`, `InviteStaffDialog`, `StaffPage`'s revoke action).
No new schema is needed for acceptance/revocation — `staff_invitations` and its accept mechanism are
already role-agnostic. The one thing that does **not** already exist, and is the crux of this
feature: nothing enforces the co-owner cap, the promote-in-place invariant, or the audit trail when
a `user_roles` row is inserted from the salon-admin side. `send-staff-invitation` inserts directly
into `user_roles` with the client-supplied `role` value and no role whitelist — reusing it unmodified
for `role: "owner"` would silently bypass every guarantee `grant_tenant_co_owner` was built to
provide (two-owner cap, single-active-role-per-tenant invariant, `backoffice.co_owner_added`-style
audit entry, the promote-in-place email logic). This is the central engineering constraint the
implementation must not miss.

---

# Current Behaviour

## Staff invitation pipeline (the pattern to follow)

`send-staff-invitation` (`supabase/functions/send-staff-invitation/index.ts`) is invoked from
`InviteStaffDialog.tsx` (`apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx`). Flow for
a new invite:

1. Verifies the caller's JWT, looks up their `user_roles` row for their tenant (`.limit(1)`, not
   `.single()` — tolerant of multiple rows), and only allows `owner`/`manager`/`supervisor` to
   invite (lines ~120-135).
2. Calls `assert_tenant_can_add_staff` RPC (seat gate) before proceeding.
3. Checks `auth.users` for an existing account with that email via
   `serviceRoleClient.auth.admin.listUsers()` — **rejects if found** (`"An account with this email
   already exists"`), unlike the co-owner backoffice flow which can resolve an existing account and
   promote it in place.
4. Creates the auth user immediately (`email_confirm: true`, `user_metadata.requires_password_change:
   true`), upserts `profiles`, inserts a `user_roles` row with **whatever `role` string the client
   sent, unchecked against any whitelist**, then inserts the `staff_invitations` row (temp password,
   7-day expiry, `token` kept "for backwards compatibility" but unused in the login flow).
5. Sends an email with a plain `/login` link (not a token-bearing accept-invite URL) and the temp
   password in the body, via Resend + the shared email template helpers.
6. `resend=true` path: looks up the existing `staff_invitations` row by id, reuses/regenerates the
   temp password, extends `expires_at`, and updates the already-created user's password.

`InviteStaffDialog.tsx`'s `roleOptions` (lines 35-40) hardcodes exactly four values — `manager`,
`supervisor`, `receptionist`, `staff` — **`owner` is never offered**, so today's UI cannot produce an
owner invite. But the edge function itself performs no server-side check that `role !== "owner"`; the
UI is the only reason this hasn't happened yet.

## Acceptance

There is no token-based "accept invite" page. `complete-password-change`
(`supabase/functions/complete-password-change/index.ts`) is the de facto acceptance step: it's called
from wherever the app forces a first-login password change (gated by
`user.user_metadata.requires_password_change === true`), and on success it flips the matching
`staff_invitations` row (`eq("user_id", user.id).eq("status", "pending")`) to
`status: "accepted"`, `accepted_at`, `password_changed_at`, `temp_password_used: true`. This lookup is
by `user_id` + `status`, with no role filter — it already works for any role stored in
`staff_invitations`, including a hypothetical `owner` row, without modification. Login itself goes to
`/login` (no magic link, no separate accept-invite route), matching the project convention already
recorded in memory (`feedback-staff-onboarding-temp-password.md`) and independently confirmed by
`getBaseUrlFromRequest`'s `loginLink = ${baseUrl}/login` in `send-staff-invitation`.

## Revocation

`useStaffInvitations.tsx` (`apps/salon-admin/src/hooks/useStaffInvitations.tsx`) exposes
`cancelInvitation(id)`: a plain client-side `update({status:"cancelled"}).eq("id", id)` against
`staff_invitations`, gated only by the table's RLS `USING (tenant_id IN
(SELECT get_user_tenant_ids(auth.uid())))` — **any tenant member**, not just owner/manager/supervisor,
can cancel any pending invitation for their tenant today (no role check in this RLS policy or in the
hook). `StaffPage.tsx` wires this to a revoke action in the pending-invitations list (line ~252). This
only flips the `staff_invitations.status` column — it does **not** touch the already-created
`auth.users` row or the `user_roles` row that `send-staff-invitation` inserted synchronously at invite
time (the account is created immediately, before acceptance); a cancelled invitation therefore leaves
behind a live, already-role-granted account unless something else deactivates it.

## The co-owner grant primitives (co-owner-role, already shipped)

`supabase/migrations/20260908063000_co_owner_foundation.sql` and
`supabase/functions/backoffice-add-tenant-co-owner/index.ts` (backoffice-only today) provide:

- `check_owner_invite_email(p_email, p_tenant_id)` — pre-flight classification: `already_owner_this_tenant`,
  `already_owner_other_tenant`, `existing_account` (a different-role account elsewhere), or
  `available` (optionally with `note: "existing_member"` if the target already holds a non-owner role
  in *this* tenant).
- `get_tenant_owners(p_tenant_id)` — self-gated on `has_backoffice_role(auth.uid(), 'super_admin')`,
  **not callable from salon-admin as-is**.
- `grant_tenant_co_owner(p_tenant_id, p_user_id)` — `service_role`-only SECURITY DEFINER RPC: advisory
  tenant lock, no-op if already owner, raises `CO_OWNER_NO_EXISTING_OWNER` / `CO_OWNER_CAP_REACHED`,
  otherwise deactivates the target's other active roles on that tenant and upserts the `owner` row.
  `trg_enforce_single_owner_tenant` fires on that same insert and raises if the target actively owns a
  *different* tenant.
- The backoffice edge function itself (`handleAddTenantCoOwner`) is the only place all of the above are
  composed today: super-admin+fresh-TOTP auth, tenant lookup, owner-count/staleness checks, the
  availability check, create-or-resolve the target account, call the RPC, write
  `audit_logs` (`backoffice.co_owner_added`), and send two emails (new/promoted/existing co-owner, and
  a notice to the existing owner).

None of this is wired to any owner-facing, in-salon-admin surface — confirmed by grep: outside
`supabase/migrations` and the backoffice files above, nothing in `apps/salon-admin` references
`grant_tenant_co_owner`, `check_owner_invite_email`, or `get_tenant_owners`.

---

# Affected Surfaces

This request adds new capability rather than changing an existing contract that other callers
depend on, so there is no repository-wide "who calls this today" surface to break. The two existing
contracts this feature must **not** regress, both already grepped clean of any other caller:

- `send-staff-invitation` — its own contract (staff-only role set) is unaffected if the new flow is a
  separate function/RPC path rather than an extension of this one's `role` parameter; if the
  implementation instead chooses to extend this same function to accept `role: "owner"`, every one of
  its existing behaviours (no-cap-check, immediate-create-account-and-reject-if-exists, plain-role
  insert) would need to be reconciled with the co-owner invariants, which is a materially bigger and
  riskier change than adding a new path.
- `staff_invitations` table / `useStaffInvitations` hook / `complete-password-change` — both already
  role-agnostic (see Current Behaviour); no consumer filters or assumes `role !== 'owner'`, so a new
  co-owner invite reusing this table needs no changes here beyond, at most, a UI label for the
  `owner` role.

---

# Existing Implementation & Placement

**Existing implementation.** No owner-facing invite/accept/revoke flow exists anywhere in
`apps/salon-admin`. What exists and should be extended rather than duplicated:

- The **generic invitation lifecycle** (`staff_invitations` table, `useStaffInvitations.tsx`,
  `complete-password-change`, the temp-password/`/login` acceptance convention) — role-agnostic
  already, reusable as-is for storing/tracking/accepting/revoking an owner invite.
- The **grant primitives** (`grant_tenant_co_owner`, `check_owner_invite_email`,
  `get_tenant_owners`) — built for exactly this cap/invariant/audit problem, currently only reachable
  from backoffice.
- `backoffice-add-tenant-co-owner/index.ts`'s `handleAddTenantCoOwner` is the closest existing analog
  to the edge function this item needs — same composition (availability check → resolve/create
  account → call the RPC → audit → email both parties), different caller-authorization bar
  (super-admin+TOTP there vs. tenant-owner there for this item) and different UI (backoffice dialog vs.
  salon-admin `InviteStaffDialog`-style form).

Nothing found duplicates or partially builds the owner-invite UI itself; it is genuinely unbuilt, as
the prior Technical Brief (`docs/research/2026-09-09-multi-salon-owner-identity.md`, "Co-ownership
salon-admin surface — entirely unbuilt") already established and this investigation re-confirms by
the same greps.

**Correct home.** `apps/salon-admin` (invite UI, revoke UI), `supabase/functions` (new edge function
for send/accept-adjacent logic, or a shared RPC call), and `supabase/migrations` (only if a new RPC
wrapper needs adding — no new table/column appears necessary, see Existing Constraints). This matches
AD-9 of `docs/design/second-owner-foundation.design.md`: *"Tenant/ownership modelling is not owned by
any shared package — `packages/shared`, `packages/ui` and `packages/supabase-client` contain no
ownership logic... No `CLAUDE.md` or project doc states a placement rule for this kind of change."*
Nothing found during this investigation contradicts that.

## Prior memory / design notes read

- `docs/design/multi-salon-owner-identity-notes.md` — reviewer memory note for the sibling item;
  documents two residual gaps (owner-label-by-email fetch, un-run SQL test files) that are not
  directly load-bearing for this item but confirm the co-owner grant path has been through one full
  review cycle already and is considered stable to build on.
- `docs/design/second-owner-foundation.design.md` — the design doc that produced the RPCs this item
  reuses; its AD-2/AD-3/AD-4 (separate function per precondition; promote-in-place invariant;
  cap enforced in the RPC, not a trigger) are the decisions this item's own design must not silently
  undermine by adding a second, unguarded write path to `user_roles`.
- `docs/research/2026-09-09-multi-salon-owner-identity.md` — establishes that the salon-admin
  co-ownership surface (owners list, invite entry point, sidenav role label) is entirely unbuilt, and
  that `get_tenant_owners` is backoffice-only by design (AD-2), a fact this item's design will need to
  address (new RPC vs. relaxed grant) since an owner-facing invite flow plausibly wants to show "your
  current co-owner" the same way the backoffice dialog does.

---

# Execution Flow

Today's staff-invite flow (the pattern being followed):

```
InviteStaffDialog (role ∈ {manager,supervisor,receptionist,staff})
    ↓ supabase.functions.invoke("send-staff-invitation")
send-staff-invitation
    ↓ caller role check (owner/manager/supervisor) + seat gate
    ↓ reject if auth.users already has this email
    ↓ auth.admin.createUser (temp password, requires_password_change:true)
    ↓ profiles.upsert + user_roles.insert(role, is_active:true)   ← unchecked role value
    ↓ staff_invitations.insert(status:"pending", temp_password, ...)
    ↓ email: temp password + /login link
        ↓ (later) user logs in, forced password change
complete-password-change
    ↓ requires_password_change flag check
    ↓ auth.admin.updateUserById (new password, clears flag)
    ↓ staff_invitations.update(status:"accepted") by user_id+status  ← role-agnostic already
```

Today's backoffice co-owner grant (the guarantees to preserve):

```
AddCoOwnerDialog (backoffice)
    ↓ invoke backoffice-add-tenant-co-owner
requireSuperAdminWithFreshTotp
    ↓ get_tenant_owners  (exactly 1 → proceed; else refuse)
    ↓ confirmedOwnerUserIds must match current owner set
    ↓ check_owner_invite_email(email, tenantId)
    ↓ resolve-or-create auth user
    ↓ grant_tenant_co_owner(tenantId, userId)   ← cap check, promote-in-place, single-owner trigger
    ↓ audit_logs: backoffice.co_owner_added
    ↓ email new co-owner + email existing owner
```

The feature under investigation needs to produce a third flow that reuses the invitation-lifecycle
pieces from the first diagram and the grant-primitive pieces from the second, from an
owner-in-salon-admin caller rather than a super-admin-in-backoffice one.

---

# Relevant Files

- `supabase/functions/send-staff-invitation/index.ts` — the pattern to follow for invite UI wiring,
  temp-password generation, and email sending; also the file showing the exact gap (unchecked `role`
  insert, no cap awareness) that must not be carried over unchanged for an owner invite.
- `apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx` — confirms `owner` is excluded from
  today's role dropdown, and is the closest existing UI to extend or mirror.
- `apps/salon-admin/src/hooks/useStaffInvitations.tsx` — `cancelInvitation`, `resendInvitation`,
  pending/accepted/expired derivations; already role-agnostic, reusable for an owner invite's list.
- `apps/salon-admin/src/pages/salon/StaffPage.tsx` — wires the revoke action; confirms revoke is a
  simple status flip with no cascading cleanup of the already-created account/role.
- `supabase/functions/complete-password-change/index.ts` — the de facto "accept invite" step; confirmed
  role-agnostic (matches by `user_id` + `status`, no role filter).
- `supabase/migrations/20260202235626_2e938aca-1b9f-48fd-8e37-afa9fe7f3350.sql` — `staff_invitations`
  table definition and its RLS policies (read/insert/update all gated only on tenant membership, no
  role check — this is what lets any tenant member cancel any pending invitation today).
- `supabase/migrations/20260908063000_co_owner_foundation.sql` — `is_tenant_owner`,
  `check_owner_invite_email`, `get_tenant_owners`, `grant_tenant_co_owner` — the grant primitives to
  reuse.
- `supabase/functions/backoffice-add-tenant-co-owner/index.ts` — the closest existing composition of
  those primitives into a full invite/grant flow; the authorization bar and caller context differ but
  the sequencing (availability check → resolve/create account → RPC → audit → dual email) is directly
  transferable.
- `docs/design/second-owner-foundation.design.md`, `docs/prd/multi-salon-owner-identity.prd.md`,
  `docs/design/multi-salon-owner-identity.design.md`, `docs/research/2026-09-09-multi-salon-owner-identity.md`,
  `docs/design/multi-salon-owner-identity-notes.md` — prior decisions and confirmed-unbuilt status for
  the salon-admin co-ownership surface this item fills in.
- `docs/backlog-open-followups.md` — the `co-owner-invite` entry itself (`status: in-progress`,
  `requires: co-owner-role`).

---

# Relevant Components

- **Invitation lifecycle**: `staff_invitations` table, `useStaffInvitations.tsx`,
  `send-staff-invitation`, `complete-password-change` — role-agnostic infrastructure to extend, not
  replace.
- **Grant primitives**: `is_tenant_owner`, `check_owner_invite_email`, `get_tenant_owners`,
  `grant_tenant_co_owner` — the safety-critical RPCs a co-owner invite/accept flow must route through.
- **UI**: `InviteStaffDialog.tsx` (pattern to mirror), `StaffPage.tsx` (pending-invitation list +
  revoke action to extend).
- **DB trigger**: `trg_enforce_single_owner_tenant` — fires on any `user_roles` insert/update
  regardless of caller; still the safety net for cross-tenant owner uniqueness, but does not enforce
  the two-owner-per-tenant cap or the promote-in-place invariant — only `grant_tenant_co_owner` does.

---

# Existing Constraints

- **`grant_tenant_co_owner` is `service_role`-only** — `revoke all ... from public, authenticated`.
  Any acceptance-time or invite-time grant of the `owner` role must go through a server-side edge
  function calling this RPC with the service-role client; it cannot be called directly from
  salon-admin's client.
- **`get_tenant_owners` is gated to `super_admin`** (`has_backoffice_role` self-check) — an owner-facing
  "who is my co-owner" surface cannot call this RPC as-is; it needs either a new, differently-gated
  RPC or a relaxed grant, which is a design decision, not something to route around by querying
  `user_roles` directly from the client (RLS on `user_roles` is not fully characterized in this
  investigation, and even if readable, duplicating the owner-filter logic client-side re-creates the
  `is_active`/role-precedence bugs `is_tenant_owner`/`get_tenant_owners` were built to fix centrally).
- **The two-owner cap and the promote-in-place invariant live only inside `grant_tenant_co_owner`**,
  not in a trigger (AD-4 of the co-owner design, deliberately). Any code path that inserts a `owner`
  `user_roles` row *without* going through this RPC — including, notably, `send-staff-invitation`'s
  existing unchecked-`role` insert — bypasses both. This is the single most important constraint for
  this feature's design to respect.
- **`send-staff-invitation` performs no server-side role whitelist check today.** The UI is the only
  reason `role: "owner"` has never been sent to it. If the implementation extends this same function
  rather than adding a new path, it must add that check itself; if it adds a new function, this
  existing one is untouched and the gap it has today is pre-existing, unrelated behaviour outside this
  item's scope to fix incidentally.
- **`staff_invitations` RLS permits any tenant member to insert, read, or update (cancel) any
  invitation row for their tenant** — no role restriction in the policy itself. A co-owner invite
  reusing this table for tracking inherits this: revocation and even initial insertion are not
  restricted to owners at the RLS layer today (the restriction, where it exists at all, is
  client-side/edge-function-side, as in `send-staff-invitation`'s inviter-role check). A design
  choosing to let a non-owner revoke a pending co-owner invite, or insert one, would need an explicit
  decision given the added sensitivity, not silent inheritance of the existing broad policy.
- **`check_owner_invite_email`'s `already_owner_this_tenant` case is meant to fall through to
  `grant_tenant_co_owner`'s own no-op**, per the backoffice function's inline comment — this messaging
  vs. safety-boundary split is a decision already made once (AD-7/AD-3) and should be mirrored rather
  than re-litigated.
- **`trg_enforce_single_owner_tenant`** still applies regardless of entry point — an owner invite for
  someone who actively owns a *different* tenant will fail at the trigger with its fixed P0001 message
  if the invite/accept path ever reaches an actual `user_roles` insert for that user with
  `role='owner'`; whatever this feature builds needs to surface that failure coherently (the backoffice
  function does this today via a substring match on the trigger's fixed message, since it isn't a named
  exception — AD-9 in the design doc explains why the trigger itself is left untouched).

---

# Existing Behaviour

- Staff invitations create the `auth.users` account **immediately at invite time**, not at acceptance
  — acceptance only changes the password and flips `staff_invitations.status`. A revoked/cancelled
  invitation therefore does not undo the account creation or the `user_roles` grant that already
  happened; any co-owner invite flow following this same pattern inherits the same shape (revoking
  "un-invites" only in the sense of marking the tracking row cancelled, not in undoing access already
  granted) unless the design explicitly changes this.
- The temp-password acceptance convention never generates a token-bearing "accept" URL — the email
  link always goes straight to `/login`, and the temp password itself, shown in the email body, is
  what gates first access. This is consistent with the project's standing rule (memory:
  `feedback-staff-onboarding-temp-password.md`) against magic links / `generateLink` for tenant-user
  onboarding, and this investigation found no exception to it anywhere in the invitation or co-owner
  grant paths.
- `resend` on `send-staff-invitation` reuses the same temp password by default (only regenerating if
  none is stored) and just extends `expires_at` — a co-owner invite following the same resend pattern
  would inherit this, which is worth being deliberate about given the higher stakes of an owner-level
  credential sitting in an inbox longer.

---

# Unknowns

- Whether the owner-facing invite UI should show the current co-owner (mirroring the backoffice
  dialog's "This salon's current owner: …" step) or omit it, and if shown, which RPC exposes that —
  a new tenant-owner-scoped RPC (callable by an active owner of that tenant) versus somehow relaxing
  `get_tenant_owners`'s `super_admin` gate. **[product]** (with an engineering shape attached) —
  no repository evidence dictates the UX; the gating mechanism is a design decision for whichever RPC
  is chosen, decided autonomously if this reaches implementation without further product input, but
  the choice of *whether to show it at all* is the user-facing product call. `claudespace defer`
  recorded below.
- Whether an owner invite should create the second owner's account immediately at invite time (matching
  `send-staff-invitation`'s existing behaviour) or defer the `user_roles`/account creation until
  acceptance — the existing staff pattern does the former, but an owner grant is higher-stakes than a
  staff grant, and the backoffice co-owner flow's `grant_tenant_co_owner` call also happens
  immediately (not deferred to acceptance) for its own reasons (advisory lock, cap re-check under
  lock). **[product]** — no repository evidence resolves which is preferred for the salon-admin path;
  it is the kind of trade-off (consistency with the existing pattern vs. reduced blast radius of an
  unaccepted invite) a design should make explicitly rather than by default inheritance.
- Whether a non-owner tenant member (manager/supervisor) should be able to see, revoke, or resend a
  pending co-owner invitation, given `staff_invitations` RLS today permits any tenant member to
  cancel any invitation. **[product]** — current behaviour for *staff* invitations is exactly this;
  whether the same breadth is acceptable for an *owner* invitation is a new question this item raises,
  not answered by existing code.

---

Investigation completed — no code was written or modified.
