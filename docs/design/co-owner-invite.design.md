# Implementation Design & Handoff — co-owner-invite

**Status:** ready to implement. **Branch:** `feat/second-owner-foundation`.
**Audience:** an engineer or coding tool with no prior exposure to this codebase and no access to the
session that produced this document. Everything needed to build the feature is restated here; the
"References" section lists source documents for background only, not as required reading.

---

# 1. How to use this document

Sections 2–6 orient you: what is verified vs. assumed, how the repo is laid out, what the feature must
do, and what already exists to build on. Sections 7 onward are the design proper. Section 19 is the
build order — start there once you have read 2–6.

Two rules that override any inference you might otherwise draw from the surrounding code:

1. **Never insert a `user_roles` row with `role = 'owner'` directly.** The only permitted path is the
   existing `grant_tenant_co_owner` RPC. This is the single most important constraint in the feature;
   several safety invariants live *only* inside that function.
2. **No magic links.** This project does not use Supabase `generateLink` / magic-link onboarding for
   salon (tenant) users, ever. Onboarding is: a temporary password in an email, plus a link to the
   normal `/login` page. Follow that pattern.

---

# 2. Verification status — what is established fact vs. assumption

Conductor's dispatch for this document stated that no Technical Brief existed yet. **That is not the
case.** Both documents exist on disk in this worktree and were read in full before this design was
written:

- `docs/prd/co-owner-invite.prd.md` (32 KB) — the product brief
- `docs/research/2026-09-12-co-owner-invite.md` (24 KB) — the Technical Brief

So this design is not working from adjacent docs alone. The requirements in section 4 are taken from
the PRD verbatim in substance, not inferred.

### Verified by direct reading of source in this worktree

Every file path, line number, function signature, column name and error string in this document was
read from the working tree. Specifically confirmed:

- `staff_invitations` schema across its base migration and all four ALTER migrations (section 5.3).
- `grant_tenant_co_owner`, `check_owner_invite_email`, `get_tenant_owners`, `is_tenant_owner`
  bodies and grants (`supabase/migrations/20260908063000_co_owner_foundation.sql`).
- `get_salon_owners` body and grant (`20260909120000_multi_salon_owner_identity.sql:578-593`).
- `trg_enforce_single_owner_tenant`'s exact exception text
  (`20260726000020_single_owner_tenant.sql:23`, re-stated at `20260909120000_...:299`).
- `send-staff-invitation/index.ts` and `complete-password-change/index.ts` in full.
- `backoffice-add-tenant-co-owner/index.ts` in full.
- `ProtectedRoute.tsx` in full; `useAuth.tsx` at the lines cited.
- `SalonOwnersTab.tsx` in full; its mount point at `SettingsPage.tsx:4553` and the tab's
  owner-only filter at `SettingsPage.tsx:335-341`.
- `useStaffInvitations.tsx` in full.
- `has_backoffice_role` body (`20260225010000_backoffice_role_template_access_fix.sql`).

### Unverified assumptions — treat these as things to confirm, not facts

| # | Assumption | Why it is unverified | What to do |
| --- | --- | --- | --- |
| A1 | `backoffice-add-tenant-co-owner` was broken in production (see section 20, item 5). | Confirmed live and fixed: `get_tenant_owners` now also admits a `service_role` caller. See `docs/research/2026-09-14-backoffice-co-owner-grant-analysis.md` and migration `20260914120000_get_tenant_owners_service_role.sql`. | Resolved via `backoffice-co-owner-grant-broken`. This design never depended on it either way. |
| A2 | A metadata-only `admin.updateUserById` does **not** revoke the user's refresh token. | Only the *password-change* variant is documented as revoking it, in a comment in `ForcePasswordChangeDialog.tsx`. The metadata-only case was not tested. | Test during step 5. If it does revoke, the promote-in-place invitee is logged out when invited — recoverable, but the UI should say so. |
| A3 | `staff_invitations.user_id` has an index. | `complete-password-change` filters on it, so one probably exists, but this was not confirmed against `pg_indexes`. | Check; add one in the migration if absent. |
| A4 | No existing `staff_invitations` row has `role = 'owner'`. | Follows from `InviteStaffDialog`'s role list never offering `owner`, and the edge function being its only writer. Not confirmed against production data. | Run the count in section 12 before applying the migration. |
| A5 | Owners do not consume a staff seat, and co-ownership is not plan-gated. | Both are commercial decisions the PRD explicitly leaves open. This design assumes "no" to both. | See section 20, item 6. Each is a one-line addition if reversed. |
| A6 | `generateSecurePassword`'s `Math.random()` basis is acceptable for an owner-level temp password. | It is the existing helper, copied as-is for consistency. `Math.random()` is not cryptographically secure. | Flagged in section 20, item 10. Out of scope to change here. |

---

# 3. Codebase orientation

**Stack.** pnpm monorepo (`pnpm@10.29.1`, Node >=24 <25), Turborepo, TypeScript, React + Vite,
TailwindCSS, shadcn/ui, `@tanstack/react-query`. Backend is Supabase: Postgres with Row Level
Security, plus Deno edge functions. Transactional email goes through Resend. SMS (not used by this
feature) goes through Arkesel.

**Layout.**

```
apps/
  salon-admin/      ← the salon owner/staff app. This feature's UI lives here.
  backoffice/       ← Salon Magik's internal admin. NOT touched by this feature.
  client-portal/ public-booking/ marketing/
packages/
  shared/ ui/ supabase-client/   ← no ownership/tenancy logic; not touched
supabase/
  functions/        ← Deno edge functions, one directory each
    _shared/        ← shared helpers (email templates, auth, URLs)
  migrations/       ← timestamped .sql, applied in filename order
  tests/            ← plain .sql test files, run with psql
docs/
  prd/ research/ design/   ← product briefs, technical briefs, designs
```

**Commands** (from repo root): `npm run lint`, `npm run build`, `npm run test` (all Turbo-driven);
`supabase db reset` to reapply migrations from scratch.

**Domain vocabulary.** A **tenant** is a salon. A user's role in a salon is a `user_roles` row:

```sql
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, tenant_id, role)
);
-- is_active BOOLEAN was added later (20260207155450); treat NULL as true,
-- which is what coalesce(is_active, true) throughout the codebase does.
```

`app_role` is an enum: `'owner' | 'manager' | 'supervisor' | 'receptionist' | 'staff'`.

**Two standing project rules relevant here.** Identity conflict checks (email/phone) are
**platform-wide across all tenants**, never scoped to one salon. Scrollable containers keep
scrollbars hidden (`scrollbar-hide`).

**Audit log** (`public.audit_logs`): `tenant_id`, `actor_user_id`, `action TEXT`,
`entity_type TEXT`, `entity_id UUID`, `before_json`, `after_json`, `metadata JSONB`, `created_at`.
Edge functions write to it with a direct service-role insert.

---

# 4. What the feature must do

A salon can have **at most two owners**, and a person may **actively own only one salon**. Today the
only way to add a co-owner is a Salon Magik support agent using a backoffice screen. This feature
makes it self-serve for the ordinary case.

**The flow.** An owner opens Settings → Owners in salon-admin, sees the current owner(s), and invites
one other person by name + email. That person gets an email with a temporary password and a link to
`/login`. On accepting, they become an owner. Until then they hold no owner powers, and the inviting
owner can revoke the invitation with nothing having changed.

**Two invitee variants**, which behave differently and are the main source of complexity:

- **New person** — no Salon Magik account. An account is created for them at invite time; they sign
  in with the temporary password and set a new one.
- **Promote in place** — they already hold a *non-owner* role at this same salon (e.g. the salon's
  manager). They already have a working password. Accepting converts them to owner and ends their
  previous role at this salon. They must not be issued a temporary password or forced to reset.

### Acceptance criteria (restated in full — the reader has no PRD)

*Surface and access*
1. An active owner can reach an Owners surface in salon-admin settings listing current owner(s) by name and email.
2. A manager, supervisor, receptionist or staff member cannot reach it and cannot send, view, resend or revoke a co-owner invitation by any route.
3. With one owner and no invitation, the owner sees an option to invite a co-owner.

*Sending*
4. Inviting an email with no existing account records a pending invitation expiring in 7 days, emails the invitee a temporary password and a `/login` link, and confirms to the inviter.
5. At two active owners, the invite option is unavailable with an explanation.
6. With an invitation already pending, a second send is refused with an explanation.
7. Inviting someone who already owns this salon is refused; no email sent.
8. Inviting someone who actively owns a *different* salon is refused with "contact Salon Magik"; the other salon is not named; no invitation created.
9. Inviting someone who already holds a non-owner role here succeeds, and the inviter is told they already work here and will become an owner on acceptance.
10. When a second owner exists, they receive a notification email naming the invited address.

*Accepting*
11. Signing in with the temporary password requires setting a new password before reaching anything else.
12. On success the invitee holds the owner role, lands in salon-admin with owner access, sees their role as Owner, the invitation shows accepted, and the inviting owner is notified.
13. Before acceptance the invitee has no owner access.
14. A promote-in-place invitee holds the owner role and no longer holds their previous role at this salon.
15. If a second owner was added by another route meanwhile, acceptance is refused with a message saying the salon already has two owners.
16. If the invitee became the active owner of a different salon meanwhile, acceptance is refused with an explanation.
17. After the 7-day expiry the temporary password grants no owner access, and the invitation shows as expired.

*Revoking and resending*
18. Revoking shows the invitation as revoked, emails the invitee a withdrawal notice, and the temporary password no longer grants access.
19. A revoked invitee with no prior role here has no access.
20. A revoked invitee who already worked here retains exactly their previous role, unchanged.
21. After revoking, a new invitation can be sent.
22. Resending issues a newly generated temporary password, invalidates the previous one, and restarts the 7-day expiry.

*Audit*
23. Send, accept, resend and revoke each write an audit entry recording the salon, acting user, invited email and time.

### Explicitly out of scope

Removing/demoting an owner and transferring ownership (all support-mediated); more than two owners;
self-serve multi-salon ownership; changes to the backoffice co-owner screen; changes to staff
invitations; per-owner permission differences; inviting from the client app or marketing site; bulk
invitations; SMS delivery.

---

# 5. Existing building blocks

## 5.1 The grant primitives — reuse, do not reimplement

From `supabase/migrations/20260908063000_co_owner_foundation.sql`:

**`is_tenant_owner(_user_id uuid, _tenant_id uuid) → boolean`**
`security definer`, `stable`. True iff an active `role='owner'` row exists for that pair. This is the
authorization check for every function in this feature.

**`check_owner_invite_email(p_email text, p_tenant_id uuid default null) → jsonb`**
`security definer`, granted to `authenticated, service_role`. With a tenant supplied, returns one of:

| Return | Meaning |
| --- | --- |
| `{available: true}` | no account with this email, or account with no conflicting role |
| `{available: true, note: "existing_member"}` | holds a non-owner role in *this* tenant → promote in place |
| `{available: false, reason: "already_owner_this_tenant"}` | already owns this salon |
| `{available: false, reason: "already_owner_other_tenant"}` | actively owns a different salon |
| `{available: false, reason: "existing_account"}` | account exists, not usable this way |

This function is for **messaging only**. It is not the safety boundary. Do not treat its `available`
as permission to grant.

**`grant_tenant_co_owner(p_tenant_id uuid, p_user_id uuid) → jsonb`**
`security definer`, `revoke all from public, authenticated`, `grant execute to service_role`. **This
is the safety boundary and the only permitted way to create an owner.** It:

- takes `pg_advisory_xact_lock` on the tenant, serializing concurrent grants;
- returns `{status:'already_owner'}` as a no-op if they already own it;
- raises `CO_OWNER_NO_EXISTING_OWNER` (P0001) if the salon has zero owners;
- raises `CO_OWNER_CAP_REACHED` (P0001) if it already has two;
- deactivates every other active role the target holds on that tenant, in the same transaction
  (this is what makes promote-in-place atomic);
- upserts the `owner` row, reactivating a previously deactivated one rather than duplicating;
- returns `{status:'granted'|'promoted_member', deactivated_roles:[...]}`.

**`trg_enforce_single_owner_tenant`** fires on that insert and raises if the target actively owns a
different tenant. Its message is fixed and **not** a named exception:

```
This account already owns another salon. Each owner can only own one active salon at a time.
```

It must be caught by substring match on `already owns another salon` — which is what
`backoffice-add-tenant-co-owner` already does. Do not modify the trigger.

**`get_salon_owners(p_tenant_id uuid)`** (`20260909120000_multi_salon_owner_identity.sql:578`)
returns `(user_id, full_name, email, granted_at)`, self-gated on `is_tenant_owner(auth.uid(), ...)`,
granted to `authenticated`. This is salon-admin's owner roster read. It raises `OWNER_ACCESS_DENIED`
for a non-owner — so an error means "not an owner", never "no owners".

**`get_tenant_owners(p_tenant_id uuid)`** is the *backoffice* equivalent, self-gated on
`has_backoffice_role(auth.uid(), 'super_admin')`. **Do not call it from this feature** — see A1.

**`get_auth_user_by_email(lookup_email text)`** (`20260404050000_...`), `service_role` only, resolves
an existing account by email.

## 5.2 The staff invitation pipeline — the pattern to follow

`supabase/functions/send-staff-invitation/index.ts` (500 lines) is invoked from
`apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx`. It: checks the caller is
`owner|manager|supervisor`; calls the `assert_tenant_can_add_staff` seat gate; **rejects if an account
with that email already exists**; creates the auth user with `email_confirm: true` and
`user_metadata.requires_password_change: true`; upserts `profiles`; inserts a `user_roles` row **with
whatever role string the client sent, against no whitelist**; inserts the `staff_invitations` row; and
emails a temporary password plus a plain `/login` link.

Reusable helpers in it, worth copying rather than reinventing:

- `generateSecurePassword()` (line 33) — 8 alphanumerics from an unambiguous alphabet plus 2 specials.
- `buildInvitationEmailContent(...)` (line 51) — composes the body from `_shared/email-template.ts`.
- `getBaseUrlFromRequest(req)` (line 71) — origin → referer → `x-forwarded-host` → env fallback.

`supabase/functions/_shared/email-template.ts` exports `wrapEmailTemplate`, `heading`, `paragraph`,
`smallText`, `createButton`, `createInfoBox`, `createAlertBox`, `createCredentialBox`,
`buildFromAddress`, `getSenderName`. `_shared/salon-app-url.ts` exports `getSalonAppUrl(req)`.

**Acceptance today** is `supabase/functions/complete-password-change/index.ts`. It requires
`user_metadata.requires_password_change === true`, rejects reuse of the stored temp password,
validates strength against
`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/`, sets the new
password, clears the flag, and flips the matching `staff_invitations` row (matched by `user_id` +
`status='pending'`, with **no role filter**) to `accepted`.

**Revocation today** is `cancelInvitation(id)` in
`apps/salon-admin/src/hooks/useStaffInvitations.tsx` — a plain client-side
`update({status:"cancelled"})`, gated only by RLS tenant membership. It does **not** touch the auth
account or the already-granted `user_roles` row.

## 5.3 `staff_invitations` — current schema

Base table (`20260202235626_...sql:39`) plus four ALTERs. Effective columns:

```sql
id            uuid primary key default gen_random_uuid()
tenant_id     uuid not null references tenants(id)
email         text not null
first_name    text not null
last_name     text not null
role          app_role not null default 'staff'
token         text not null unique          -- legacy, unused by the login flow
status        text not null default 'pending'
              check (status in ('pending','accepted','expired','cancelled'))
invited_by_id uuid
accepted_at   timestamptz
expires_at    timestamptz not null
created_at    timestamptz not null default now()
-- 20260205165708:
last_resent_at     timestamptz
resend_count       integer default 0
invited_via        text default 'staff_module'
-- 20260207155450:
temp_password      text
temp_password_used boolean default false
password_changed_at timestamptz
-- 20260207163402:
user_id       uuid references auth.users(id) on delete set null
-- 20260621020000:
phone         text
```

RLS, all three gated **only** on tenant membership with no role check:

```sql
CREATE POLICY "Users can read tenant invitations" ON staff_invitations
  FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can create invitations" ON staff_invitations
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can update invitations" ON staff_invitations
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

There is no DELETE policy. The `status` CHECK already covers everything this feature needs.

---

# 6. Two corrections to the Technical Brief

`docs/research/2026-09-12-co-owner-invite.md` was written against the older
`docs/research/2026-09-09-multi-salon-owner-identity.md` and predates the `multi-salon-owner-identity`
implementation that landed on this same branch at commit `d29d38b`. Two of its statements are stale,
and both change the design materially:

1. **The Owners surface already exists.** The brief says the salon-admin co-ownership surface is
   "entirely unbuilt". In fact
   `apps/salon-admin/src/components/settings/SalonOwnersTab.tsx` exists (112 lines) and is mounted at
   `SettingsPage.tsx:4553` behind an `owners` tab already filtered to `currentRole === "owner"`
   (`SettingsPage.tsx:335-341`). It renders the owner roster in a table with name, email and "Owner
   since", and treats a query error as "you don't have access" rather than an empty list. **Acceptance
   criteria 1, 2 and part of 3 are therefore already met.** Extend this component; do not build a new
   surface.
2. **The owner-facing roster RPC already exists.** The brief lists as an open question whether to add
   a new tenant-scoped RPC or relax the backoffice-gated `get_tenant_owners`. Neither is needed:
   `get_salon_owners` (section 5.1) already does exactly this, correctly gated.

The brief's central constraint — nothing may grant `owner` except `grant_tenant_co_owner` — is
unaffected and is honoured throughout this design.

## Adjacent defect folded into this work

**`useStaffInvitations` will leak co-owner invitations into the Staff page.** The hook selects every
`staff_invitations` row for the tenant with no role filter, and `StaffPage.tsx` renders
`pendingInvitations` directly (revoke action around line 252). Once this feature writes `role='owner'`
rows, a pending co-owner invitation would appear in the staff pending list with a revoke button wired
to the unrestricted client-side `cancelInvitation` — letting a manager revoke an owner invitation,
directly violating AC-2. It is a defect in a file this design already touches, it is not a separate
backlog item, and it is not a policy choice, so it is fixed here (component 8, build step 3).

---

# 7. Architecture decisions

## AD-1 — Reuse `staff_invitations` with `role='owner'`; no new table

Co-owner invitations are rows in the existing table, discriminated by `role = 'owner'`. No new table,
no new column, no new status value.

*Why.* The table already carries every field needed (section 5.3), the `app_role` enum already
includes `owner`, and the four `status` values are exactly the ones AC-4/17/18/21 require. Acceptance
and expiry are already role-agnostic.

*Rejected:* a dedicated `co_owner_invitations` table — duplicates a working lifecycle for no invariant
a role discriminator cannot express, and would need its own RLS, expiry and hook.
*Rejected:* storing the invitation in `user_metadata` only — no server-side expiry, no audit target,
not queryable by the owner.

## AD-2 — A new edge function, not an extension of `send-staff-invitation`

Add `supabase/functions/send-co-owner-invitation/`. Leave `send-staff-invitation` untouched.

*Why.* The two flows agree on almost nothing below the surface. `send-staff-invitation` authorizes
three roles; this needs owner-only. It calls the seat gate; this must not (A5). It hard-rejects an
existing account; this must accept that case and promote in place (AC-9). It inserts the role
immediately; this must not grant until acceptance. It has no cap check, no cross-salon check and no
audit write. Reconciling all of that inside one function makes every existing staff invitation re-run
new branching logic on the platform's only working staff-onboarding path, for no gain.

Separation also means this feature neither relies on nor widens the pre-existing gap that
`send-staff-invitation` has no server-side role whitelist. That gap stays exactly as it is
(section 20, item 9).

## AD-3 — The owner role is granted at acceptance, never at invite time

At invite time the flow may create an `auth.users` row and a `profiles` row and writes the
`staff_invitations` row. It writes **no `user_roles` row**. The sole `grant_tenant_co_owner` call
happens in the acceptance function.

*Why.* Owner is the most privileged role in a salon. An invitation sitting unopened in an inbox must
not confer it (AC-13), and revoke must mean the person never held it (AC-19) — only true if the grant
never happened. It also puts the cap re-check (AC-15) and cross-salon check (AC-16) at the moment
ownership is actually conferred, under the advisory lock, which is the only correct place for them.

*Consequence that forces AD-5.* This diverges deliberately from `send-staff-invitation`, which creates
account and role together. A new invitee therefore holds an account with **zero `user_roles` rows**
between invite and acceptance — a state the existing salon-admin routing does not handle safely.

## AD-4 — One acceptance function serving both invitee variants

Add `supabase/functions/accept-co-owner-invitation/`, accepting an **optional** `newPassword`. It is
the single grant point. `complete-password-change` is **not** modified.

*Why.* The PRD's user flow says a promote-in-place invitee "signs in with their existing account" and
also that every invitee is "required to set a new password". Both cannot hold for someone who already
has a working password: forcing a reset to accept an invitation would break a credential they already
use for a role they already hold. So the two cases need one acceptance action with an optional
password, not one password-change mechanic.

Ordering is the second reason. If the grant were bolted onto the end of `complete-password-change`, a
grant failure (AC-15) would occur *after* the password had already changed, leaving the invitee locked
into a credential change for an invitation they were then refused. Here the grant runs **first**; if
it fails, nothing else has happened.

*Rejected:* extending `complete-password-change` — wrong ordering, and it would put owner-grant logic
on the hot path of every staff acceptance.
*Rejected:* two functions, one per variant — they share the lookup, validity checks, grant, audit
write and notification emails; only the password step differs.

## AD-5 — A dedicated acceptance route that pre-empts the onboarding redirect

Add a `/accept-co-owner` route and a guard that runs **before** `ProtectedRoute`'s onboarding
redirect and before `OnboardingRoute`. It keys off a new `user_metadata.pending_co_owner_invite === true`
flag set at invite time and cleared on accept/revoke.

*Why — this is the most important correctness point in the design.* `useAuth.tsx:737` derives
`hasCompletedOnboarding: tenants.length > 0`. A new co-owner invitee (AD-3) has zero tenants, so
`hasCompletedOnboarding` is `false`, so `ProtectedRoute` redirects them to `/onboarding` — **where
they would create their own new salon** — and it does so at the `requireOnboarding &&
!hasCompletedOnboarding` check, which sits *above* the `ForcePasswordChangeDialog` rendered at the
bottom of the same component. So they would never even see the password prompt. Without this guard the
feature does not work at all and actively creates junk tenants.

Keying off `user_metadata` rather than a query is deliberate: the flag must be readable before any
tenant context exists, and it costs no extra round trip on the auth path for the overwhelming majority
of users who have no pending invitation. The invitation's details are fetched by the acceptance page
itself via AD-6.

**The redirect is conditional on having nowhere else to go:**

| Invitee state | Behaviour |
| --- | --- |
| Pending invite, **zero** tenants (new account) | Hard redirect to `/accept-co-owner` from both `ProtectedRoute` and `OnboardingRoute` |
| Pending invite, **has** tenants (promote in place) | **No** redirect. A banner on salon pages links to `/accept-co-owner` |

An existing manager must not be locked out of the job they already do because someone invited them.

*Rejected:* granting at invite time to dodge this — reintroduces the problem AD-3 exists to prevent.
*Rejected:* special-casing `/onboarding` to detect the invite — puts co-owner logic in an unrelated
flow and still leaves the password prompt unreachable.

## AD-6 — A self-scoped RPC for the invitee to read their own invitation

Add `get_my_pending_co_owner_invitation()` — `security definer`, **no arguments**, returning the
caller's own pending `role='owner'` invitation joined to the salon name and inviter name.

*Why.* A new invitee is not yet a member of the tenant, so `staff_invitations`' RLS
(`tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))`) returns nothing for them — they cannot read
their own invitation and the acceptance page has nothing to render. Taking `auth.uid()` internally
rather than an id parameter means there is no parameter to scope wrong: a caller can only ever
retrieve their own row.

*Rejected:* adding `user_id = auth.uid()` to the SELECT policy — would widen it for every staff
invitation too, changing behaviour outside this feature's scope.

## AD-7 — Owner-invitation rows are hidden from non-owners at the RLS layer

Replace the three `staff_invitations` policies with role-aware equivalents (section 12.2).

*Why.* AC-2 requires that a manager cannot *see*, revoke or resend a co-owner invitation. Today's
policies gate only on tenant membership, so writing owner rows into this table would expose them to
every member and let any member cancel one. Enforcing this in the edge functions alone is insufficient
— a client can query `staff_invitations` directly — so it has to be at the RLS layer. The change is
strictly narrowing and alters nothing for `role <> 'owner'` rows.

## AD-8 — Revoke deletes the account it created, and only that account

On revoke, delete the auth account **iff** it was created by this invitation
(`user_metadata.invited_via === 'co_owner_invite'`) **and** the user holds no active `user_roles` row
in any tenant. Otherwise leave the account entirely untouched and only clear the
`pending_co_owner_invite` flag.

*Why.* AC-18 requires the temporary password to stop granting access. Flipping `status` — all
`cancelInvitation` does today — leaves a live signable-in account. Rotating the password satisfies the
letter of AC-18 but leaves a permanent role-less orphan holding that email address, which then
collides with `send-staff-invitation`'s "an account with this email already exists" rejection and
silently makes that address un-invitable forever. Deleting is what `backoffice-add-tenant-co-owner`
already does for exactly this class of account (its grant-failure rollback calls
`admin.auth.admin.deleteUser`), so this follows precedent rather than inventing one.

The two guards are what make deletion safe: an account this invitation did not create, or that holds
any role anywhere, is a real user's account and is never touched. That is what satisfies AC-20.

*Rejected:* password rotation only — the orphan-email collision above.
*Rejected:* deleting on the `invited_via` check alone — would delete someone who acquired a role
between invite and revoke.

## AD-9 — Separate functions for send and revoke; resend is a mode of send

`send-co-owner-invitation` (with a `resend: true` mode) and `revoke-co-owner-invitation`. Revoke is
**not** client-side.

*Why.* Revoke needs the service role (to delete an account, AD-8) and owner-only authorization, so it
cannot be the client-side `update()` that staff revoke is. Resend shares the send path's whole body —
regenerate password, reset expiry, rebuild and send the same email — so a separate function would be
near-duplicate; this also mirrors `send-staff-invitation`'s own `resend` parameter.

## AD-10 — Resend regenerates the temporary password

`admin.updateUserById({ password: newTemp })`, a new `temp_password` value and a fresh `expires_at`.
This necessarily invalidates the previous password, which is the point (AC-22): an owner-level
credential should not have two live copies in two inboxes. For a promote-in-place invitee there is no
temporary password at all, so resend only re-sends the email and restarts the expiry — it must never
touch their real password.

## AD-11 — A service-role-safe owner roster RPC for the edge functions

Add `list_tenant_owners_service(p_tenant_id uuid)` — `security definer`, `revoke ... from public,
authenticated`, `grant execute ... to service_role`, same shape as `get_salon_owners` with no
`auth.uid()` gate.

*Why.* The edge functions need the owner roster to send notification emails (AC-10, AC-12, AC-18) and
to name current owners in cap-reached messages. Neither existing RPC works from a service-role client:
`get_salon_owners` self-gates on `is_tenant_owner(auth.uid(), ...)` and `get_tenant_owners` on
`has_backoffice_role(auth.uid(), ...)`, and a service-role JWT carries no `sub`, so `auth.uid()` is
`null` and both deny. The alternative — hand-rolling the `role='owner' AND coalesce(is_active, true)`
filter in TypeScript in three places — re-creates exactly the duplication `is_tenant_owner` and
`get_salon_owners` were centralized to prevent. `service_role` is itself the boundary here; each
caller does its own owner check first.

This is also what keeps the feature clear of the suspected `backoffice-add-tenant-co-owner` bug (A1).

## AD-12 — Correct home

`apps/salon-admin` (UI), `supabase/functions` (three new functions), `supabase/migrations` (one
migration). No shared package is involved: `packages/shared`, `packages/ui` and
`packages/supabase-client` contain no ownership or tenancy logic. Backoffice is untouched.

---

# 8. Components

New unless marked *(existing — modify)*.

1. **`supabase/migrations/<timestamp>_co_owner_invite.sql`** — `get_my_pending_co_owner_invitation`
   (AD-6), `list_tenant_owners_service` (AD-11), the role-aware RLS replacement (AD-7), and the
   partial unique index (section 12.1).
2. **`supabase/functions/send-co-owner-invitation/index.ts`** — owner-authorized send and resend.
3. **`supabase/functions/accept-co-owner-invitation/index.ts`** — the sole caller of
   `grant_tenant_co_owner` on this path.
4. **`supabase/functions/revoke-co-owner-invitation/index.ts`**.
5. **`apps/salon-admin/src/components/settings/SalonOwnersTab.tsx`** *(existing — modify)* — add the
   pending-invitation row, the "Invite co-owner" action, revoke and resend. Keep its existing
   `get_salon_owners` query and its error-means-denied handling unchanged.
6. **`apps/salon-admin/src/components/dialogs/InviteCoOwnerDialog.tsx`** — modelled on
   `InviteStaffDialog.tsx`: first name, last name, email. **No role selector** — the role is always
   `owner`. `InviteStaffDialog.tsx` itself is *not* modified and must continue to omit `owner` from
   its role list.
7. **`apps/salon-admin/src/hooks/useCoOwnerInvitation.tsx`** — fetch the tenant's single owner
   invitation, plus send/resend/revoke. Separate from `useStaffInvitations` because the mutations are
   edge-function calls, not table writes.
8. **`apps/salon-admin/src/hooks/useStaffInvitations.tsx`** *(existing — modify)* — **adjacent defect
   fix (section 6).** Filter `role !== "owner"` where rows are read, so all four derived lists
   (`invitations`, `pendingInvitations`, `acceptedInvitations`, `expiredInvitations`) exclude owner
   invitations and `StaffPage.tsx` needs no change at all.
9. **`apps/salon-admin/src/pages/AcceptCoOwnerInvitationPage.tsx`** — the `/accept-co-owner` page.
   Three states: set-password-to-accept (new account), confirm-to-accept (promote in place), and a
   terminal state (expired / revoked / cap reached) with a sign-out action.
10. **`apps/salon-admin/src/components/auth/ProtectedRoute.tsx`** *(existing — modify)*, both
    `ProtectedRoute` and `OnboardingRoute` in that file — the AD-5 guard, placed **above** the
    `requireOnboarding && !hasCompletedOnboarding` redirect.
11. **`apps/salon-admin/src/App.tsx`** *(existing — modify)* — register `/accept-co-owner`.
12. **`apps/salon-admin/src/components/banners/PendingCoOwnerInviteBanner.tsx`** — for the
    has-tenants case (AD-5 table, row 2).
13. **`packages/supabase-client/src/supabase/types.ts`** *(existing — regenerate)* — new RPC
    signatures.

**Explicitly not modified:** `send-staff-invitation`, `complete-password-change`,
`InviteStaffDialog.tsx`, `StaffPage.tsx`, `grant_tenant_co_owner`, `check_owner_invite_email`,
`get_salon_owners`, `get_tenant_owners`, `trg_enforce_single_owner_tenant`, and everything under
`apps/backoffice`.

---

# 9. Data flow — send (AC-4 to AC-10)

```
SalonOwnersTab → InviteCoOwnerDialog
  → invoke("send-co-owner-invitation", {email, firstName, lastName, phone?})

send-co-owner-invitation
  ↓ verify JWT → caller
  ↓ resolve tenantId from the caller's own active owner membership
  ↓                    NOT from the request body            ← see section 15
  ↓ is_tenant_owner(caller.id, tenantId) else 403                     (AC-2)
  ↓ normalize email (trim + lowercase); reject if it equals caller's  (EC-1)
  ↓ list_tenant_owners_service(tenantId)
  ↓   0 owners  → 409 "This salon has no owner yet."
  ↓   >=2 owners → 409 "already has the maximum of two owners (<names>)" (AC-5)
  ↓ existing pending owner invitation for this tenant? → 409           (AC-6)
  ↓ check_owner_invite_email(email, tenantId)
  ↓   already_owner_this_tenant  → 409 "already owns this salon"       (AC-7)
  ↓   already_owner_other_tenant → 409 "contact Salon Magik"           (AC-8)
  ↓   existing_account           → 409 "can't be invited"
  ↓   available + note=existing_member → PROMOTE-IN-PLACE branch       (AC-9)
  ↓   available                        → NEW-ACCOUNT branch
  ↓ get_auth_user_by_email(email)
  ├─ NEW ACCOUNT:
  │    tempPassword = generateSecurePassword()
  │    auth.admin.createUser({ email, password: tempPassword,
  │        email_confirm: true,
  │        user_metadata: { first_name, last_name, full_name,
  │                         requires_password_change: true,
  │                         invited_via: "co_owner_invite",
  │                         pending_co_owner_invite: true } })
  │    profiles.upsert({user_id, full_name, phone}, {onConflict:"user_id"})
  │        ← upsert, not insert: a trigger on auth.users already creates a stub row
  └─ PROMOTE IN PLACE:
       tempPassword = null
       auth.admin.updateUserById(userId,
         { user_metadata: {...existing, pending_co_owner_invite: true} })
  ↓ staff_invitations.insert({ tenant_id, email, first_name, last_name,
  ↓     role:'owner', status:'pending', user_id, temp_password, phone,
  ↓     token:<random>, invited_by_id: caller.id, invited_via:'co_owner_invite',
  ↓     expires_at: now + 7 days })                                   (AC-4)
  ↓   on failure → rollback: delete the account only if we just created it
  ↓ audit_logs.insert(action:'co_owner.invitation_sent')              (AC-23)
  ↓ email the invitee   (temp-password variant, or "you already work here" variant)
  ↓ email every current owner                                         (AC-10)
  ↓ 200 { success, status:'invited'|'invited_existing_member', emailDelivered }
```

Email failures are logged and **do not** fail the request: the invitation row exists and the owner can
resend or revoke. The response carries `emailDelivered: false` so the UI can say so.

---

# 10. Data flow — accept (AC-11 to AC-17)

```
invitee signs in at /login (temp password, or their own existing password)
  ↓ useAuth loads user; user_metadata.pending_co_owner_invite === true

AD-5 guard in ProtectedRoute / OnboardingRoute
  ├─ tenants.length === 0 → redirect to /accept-co-owner   ← instead of /onboarding
  └─ otherwise            → banner linking to /accept-co-owner

AcceptCoOwnerInvitationPage
  ↓ rpc get_my_pending_co_owner_invitation()
  ↓   no row, or expires_at < now → terminal "no longer valid" state  (AC-17)
  ↓ invoke("accept-co-owner-invitation", { newPassword? })

accept-co-owner-invitation
  ↓ verify JWT → user            ← user id from the JWT, never the body
  ↓ re-read the invitation server-side by (user_id, role='owner', status='pending')
  ↓ expires_at > now() else 409 "expired"                             (AC-17)
  ↓ if user_metadata.requires_password_change:
  ↓     newPassword required, strength-validated, and must differ from temp_password
  ↓
  ↓ grant_tenant_co_owner(tenant_id, user.id)      ← FIRST, before any password change
  ↓   CO_OWNER_CAP_REACHED   → 409; invitation left pending           (AC-15)
  ↓   msg ~ "already owns another salon" → 409                        (AC-16)
  ↓   CO_OWNER_NO_EXISTING_OWNER → 409
  ↓   {status:'already_owner'} → treat as success, continue
  ↓   {status:'promoted_member'} → prior role already deactivated     (AC-14)
  ↓
  ↓ if newPassword: updateUserById({ password, requires_password_change:false,
  ↓                                  pending_co_owner_invite:false }) (AC-11)
  ↓ else:           updateUserById({ pending_co_owner_invite:false })
  ↓ staff_invitations.update({ status:'accepted', accepted_at,
  ↓     password_changed_at, temp_password:null, temp_password_used:true })
  ↓ audit_logs.insert('co_owner.invitation_accepted')                 (AC-23)
  ↓ email every other active owner                                    (AC-12)
  ↓ 200 { success, tenantId }

AcceptCoOwnerInvitationPage
  ↓ if a password was set: signInWithPassword(email, newPassword)
  ↓     ← admin.updateUserById revokes the current refresh token on a password
  ↓       change; ForcePasswordChangeDialog re-signs in today for this same reason
  ↓ refreshTenants() → navigate("/salon/overview")                    (AC-12)
```

The grant runs before the password change so a refused acceptance leaves the invitee's credentials
exactly as they were (AD-4).

---

# 11. Data flow — revoke (AC-18 to AC-21) and resend (AC-22)

```
SalonOwnersTab → invoke("revoke-co-owner-invitation", { invitationId })
  ↓ verify JWT; load the invitation by id
  ↓ is_tenant_owner(caller.id, invitation.tenant_id) else 403
  ↓ invitation.role='owner' and status='pending' else 409
  ↓ staff_invitations.update({ status:'cancelled', temp_password:null })
  ↓ does this user hold ANY active user_roles row, in ANY tenant?
  ├─ no  AND user_metadata.invited_via === 'co_owner_invite'
  │      → auth.admin.deleteUser(user_id)                    (AD-8, AC-19)
  └─ otherwise
         → updateUserById({ pending_co_owner_invite: false }) (AD-8, AC-20)
  ↓ audit_logs.insert('co_owner.invitation_revoked')
  ↓ email the invitee (withdrawn) + every current owner       (AC-18)

resend → invoke("send-co-owner-invitation", { invitationId, resend: true })
  ↓ owner check; invitation must be pending and role='owner'
  ↓ server-side throttle: reject if last_resent_at < 30 minutes ago
  ├─ new account:      newTemp = generateSecurePassword()
  │                    updateUserById({ password:newTemp,
  │                                     requires_password_change:true })  (AD-10)
  └─ promote in place: password untouched
  ↓ update({ temp_password, expires_at: now+7d, last_resent_at: now,
  ↓          resend_count: resend_count+1, status:'pending' })            (AC-22)
  ↓ audit_logs.insert('co_owner.invitation_resent')
  ↓ re-send the invitee email
```

The 30-minute resend throttle exists client-side today as `RESEND_THROTTLE_MINUTES` in
`useStaffInvitations`. **Mirror it server-side.** A client-side-only throttle is not a throttle for an
owner-level credential.

---

# 12. Database changes

One migration. **No new table and no new column** — section 5.3 confirms `staff_invitations` already
carries everything needed.

Before applying, confirm A4:

```sql
select count(*) from public.staff_invitations where role = 'owner';  -- expect 0
```

## 12.1 One pending owner invitation per tenant

```sql
create unique index if not exists staff_invitations_one_pending_owner_per_tenant
  on public.staff_invitations (tenant_id)
  where role = 'owner' and status = 'pending';
```

A partial unique index rather than an application check only: the check in the edge function is the
source of the *message*, this is the source of the *guarantee* under concurrent sends. The function
must translate a `23505` on this index into the same "invitation already outstanding" message as its
pre-check. (This is the same messaging-vs-boundary split as `check_owner_invite_email` vs.
`grant_tenant_co_owner`.)

## 12.2 Role-aware RLS on `staff_invitations`

Drop and recreate the three policies from section 5.3. Each keeps its existing predicate and adds an
owner-row clause — same shape for all three (`USING` for SELECT/UPDATE, `WITH CHECK` for INSERT):

```sql
  tenant_id in (select get_user_tenant_ids(auth.uid()))
  and (role <> 'owner' or is_tenant_owner(auth.uid(), tenant_id))
```

Strictly narrowing. Rows with `role <> 'owner'` behave byte-identically to today, so no staff
invitation behaviour changes anywhere. Owner rows become invisible and unwritable to non-owner
members. No DELETE policy exists today and none is added — revocation is a status flip.

## 12.3 `get_my_pending_co_owner_invitation()`

`security definer`, `stable`, `set search_path = public, auth`, **no arguments**. Returns
`(invitation_id, tenant_id, tenant_name, email, expires_at, invited_by_name, requires_password_change)`
for the caller's own `role='owner'`, `status='pending'` row, joined to `tenants` for the name and to
the inviter's `profiles` for `invited_by_name`. Returns no rows if there is none.
`grant execute on function ... to authenticated;`

## 12.4 `list_tenant_owners_service(p_tenant_id uuid)`

`security definer`, `stable`, same return shape as `get_salon_owners`
(`user_id, full_name, email, granted_at`), **no `auth.uid()` gate**. Grants must be exactly:

```sql
revoke all on function public.list_tenant_owners_service(uuid) from public, authenticated;
grant execute on function public.list_tenant_owners_service(uuid) to service_role;
```

This is the one new ungated function in the design — its grant is its only boundary, so get it right.

## 12.5 Indexes and backfill

The partial unique index doubles as the lookup index for "is there a pending owner invitation for this
tenant". Confirm `staff_invitations.user_id` is indexed (A3) and add one if not.

**No backfill.** Given A4, the new index and policies are no-ops against existing data.

---

# 13. API surface

Three new edge functions. All take the caller's JWT in `Authorization: Bearer <token>`. **None accepts
a tenant id from the client.** All follow the existing CORS-preflight + JSON-error shape used by
`send-staff-invitation` and `complete-password-change`.

| Function | Body | Success | Failure |
| --- | --- | --- | --- |
| `send-co-owner-invitation` | `{email, firstName, lastName, phone?}` or `{invitationId, resend:true}` | `200 {success, status, invitation, emailDelivered}` | `400` validation, `403` not an owner, `409` business rule, `500` |
| `accept-co-owner-invitation` | `{newPassword?}` | `200 {success, tenantId}` | `400`, `401`, `409` expired/cap/cross-salon, `500` |
| `revoke-co-owner-invitation` | `{invitationId}` | `200 {success}` | `403`, `404`, `409` not pending, `500` |

Two new RPCs: `get_my_pending_co_owner_invitation()` (`authenticated`),
`list_tenant_owners_service(uuid)` (`service_role` only). **No existing contract changes.**

---

# 14. Validation and error handling

## Validation

**Send.** `email` required, trimmed, lowercased, matched against the same regex
`backoffice-add-tenant-co-owner` uses (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); rejected if it equals the
caller's own email. `firstName` and `lastName` required and non-blank. `phone` optional. Caller must
be an active owner — `is_tenant_owner`, server-side, never inferred from client input.

**Ordering matters:** owner count and the pending check run **before** `check_owner_invite_email`, so
an owner at the cap is told about the cap rather than being told something about a third party's
account — which would leak information to someone who cannot invite anyway.

**Accept.** `newPassword` required **iff** `user_metadata.requires_password_change === true`,
validated with the same regex `complete-password-change` uses (section 5.2) and rejected if equal to
the stored `temp_password`, with the same message. The invitation must be `status='pending'`,
`role='owner'`, `expires_at > now()`, and its `user_id` must equal the JWT's user.

**Revoke.** `invitationId` required; row must be `role='owner'` and `status='pending'`; caller must be
an active owner of *that row's* tenant.

`check_owner_invite_email` stays messaging-only; `grant_tenant_co_owner` and the trigger stay the
safety boundary.

## Error handling

Every path returns a specific human-readable message. No raw database text reaches the UI.

| Condition | Where | Message |
| --- | --- | --- |
| Caller not an owner | all three | `You don't have permission to manage owners for this salon.` (403) |
| Salon already has two owners | send | `This salon already has the maximum of two owners (<names>).` |
| Invitation already pending (pre-check or `23505`) | send | `There's already an invitation outstanding for this salon. Revoke it before sending another.` |
| `already_owner_this_tenant` | send | `That person already owns this salon.` |
| `already_owner_other_tenant` | send | `That person already owns another salon on Salon Magik. Contact Salon Magik to arrange co-ownership.` |
| `existing_account` | send | `That email can't be invited as an owner. Contact Salon Magik.` |
| Invitee is the caller | send | `You already own this salon.` |
| Email send failed | send | `200` with `emailDelivered:false`; UI: `Invitation created, but the email didn't send. Try resending.` |
| Resend within 30 min | resend | `Please wait <n> minutes before resending.` |
| `CO_OWNER_CAP_REACHED` | accept | `This salon already has two owners, so this invitation can no longer be accepted.` |
| trigger `... already owns another salon` (substring match) | accept | `You already own another salon on Salon Magik, so you can't also own this one. Contact Salon Magik.` |
| `CO_OWNER_NO_EXISTING_OWNER` | accept | `This salon no longer has an owner who can add you. Contact Salon Magik.` |
| Expired / revoked / missing | accept + page | `This invitation is no longer valid. Ask the salon owner to send a new one.` |
| Weak or reused password | accept | Reuse `complete-password-change`'s exact strings |
| Not pending | revoke | `That invitation is no longer pending.` |

The cross-salon case is matched by substring on the trigger's fixed message (section 5.1), exactly as
`backoffice-add-tenant-co-owner` does. Copy that approach; do not change the trigger.

**Partial failures.** If the `staff_invitations` insert fails after an account was created, delete the
account before returning. If the audit write or an email fails *after* a successful grant, log and
continue — ownership is already correctly conferred and failing the request would be worse.

---

# 15. Security

- **Owner-only, enforced server-side and at RLS.** `is_tenant_owner(auth.uid(), tenant_id)` in all
  three functions, plus AD-7's policies. The `SettingsPage` tab filter (`currentRole === "owner"`) is
  presentation only and is never relied on.
- **`tenant_id` is never taken from the request body on send.** It is resolved from the caller's own
  active owner membership. On the platform's most privileged grant path, a body-supplied tenant id is
  precisely the parameter an attacker would tamper with.
- **`user_id` on accept comes from the JWT, never the body** — otherwise any authenticated user could
  accept someone else's invitation.
- **The `owner` role is granted only by `grant_tenant_co_owner`,** called only from
  `accept-co-owner-invitation` with the service-role client. This design adds no other `user_roles`
  write path anywhere.
- **Temporary password lifecycle.** Invalidated on accept (`temp_password` nulled, real password set),
  on resend (rotated, AD-10), and on revoke (account deleted or flag cleared, AD-8).
- **Privacy in rejections.** The `already_owner_other_tenant` and `existing_account` messages never
  name the other salon or reveal anything about the other account. The validation ordering rule above
  is part of this.
- **`list_tenant_owners_service` must be revoked from `authenticated` explicitly** — it has no
  internal caller gate.
- **Social engineering.** Someone with temporary access to an owner's session could invite themselves.
  Mitigated by notification emails to all current owners on send and accept, plus the audit trail. No
  step-up verification, by explicit product decision.
- **Audit actions:** `co_owner.invitation_sent` / `_accepted` / `_resent` / `_revoked`, each with
  `tenant_id`, `actor_user_id`, `entity_type:'tenant'`, `entity_id: tenant_id`, and `metadata`
  carrying the invited email, target user id and invitation id — following the existing
  `backoffice.co_owner_added` shape.

---

# 16. Performance

Low-frequency administrative flow; the concern is access shape, not throughput.

- **Fetch by key.** The invitation is read by `id` (revoke/resend) or by `(user_id, role, status)`
  (accept) — never by loading the tenant's invitations and filtering in TypeScript.
- **Owner count is a SQL filter** via `list_tenant_owners_service`, never fetch-all-roles-and-count-in-JS.
- **`get_my_pending_co_owner_invitation` returns at most one row** and is called only on
  `/accept-co-owner`. The AD-5 route guard reads `user_metadata`, already present in the session —
  **zero extra queries on the auth path**, which is the whole reason the metadata flag exists.
- **No N+1.** Owner notification emails iterate a list capped at two.
- **Required index:** the partial unique index (12.1); confirm `user_id` is indexed (A3).
- `SalonOwnersTab` adds one `react-query` query alongside its existing one, both keyed on `tenantId`.

---

# 17. Compatibility

- **Backward compatible.** No existing table, column, function signature, edge function or component
  contract changes. The three functions and two RPCs are purely additive.
- **The RLS change is strictly narrowing and only affects `role='owner'` rows**, of which none exist
  (A4) — a no-op against current data, and it cannot regress staff invitations.
- **The `useStaffInvitations` filter** is a no-op until the first owner row is written.
- **The backoffice co-owner path is untouched** and continues in parallel. Both paths funnel through
  `grant_tenant_co_owner`, so the cap and cross-salon invariants hold across both regardless of
  interleaving.
- **Deprecation:** none. Nothing is replaced.
- **Deploy order:** migration → edge functions → salon-admin build. Steps 1–2 of section 19 are
  backward compatible alone, so there is no window where a deployed frontend calls a missing function.

---

# 18. Edge cases

1. **Owner invites their own email** — rejected at validation before any account lookup.
2. **Invitee is the salon's existing manager** — `check_owner_invite_email` returns `available` +
   `note:'existing_member'`. No account created, no password issued; `grant_tenant_co_owner`
   deactivates the manager row in the same transaction as the owner grant (AC-14). Revoke before
   acceptance leaves the manager row untouched (AC-20).
3. **Two owners send simultaneously** — the partial unique index lets exactly one succeed; the loser
   gets the "already outstanding" message from the `23505` handler.
4. **Backoffice grants a second owner while an invitation is pending** — acceptance fails with
   `CO_OWNER_CAP_REACHED` (AC-15). The invitation stays `pending` rather than auto-cancelling, so the
   owner sees it and revokes deliberately; auto-cancelling would hide that something happened outside
   their control.
5. **Invitee gains ownership of another salon after being invited** — the trigger fires inside
   `grant_tenant_co_owner` and acceptance is refused (AC-16).
6. **Invitation expires while the invitee is on the acceptance page** — the server re-checks
   `expires_at`; the page's check is advisory only.
7. **New-account invitee signs in after expiry** — `pending_co_owner_invite` is still set, so the AD-5
   guard still routes them to `/accept-co-owner` rather than `/onboarding`, and the page shows the
   terminal expired state. **Load-bearing:** without it they fall through to onboarding and create a
   junk salon. The flag is deliberately *not* cleared on expiry.
8. **Revoked invitee signs in** — their account was deleted (AD-8), so sign-in fails. If the account
   survived (they held a role), they keep exactly that role and the flag is cleared.
9. **`already_owner` returned at acceptance** — someone was granted ownership by another path
   meanwhile. Treat as success: flip the invitation to `accepted` and let them in. Mirrors
   `backoffice-add-tenant-co-owner`'s no-op handling.
10. **Email fails after the row is created** — invitation stays `pending`, UI surfaces
    `emailDelivered:false`, resend available.
11. **Invitee already signed in elsewhere when invited** — the metadata write takes effect on session
    refresh; they see the banner then. See A2.
12. **Resend for a promote-in-place invitation** — no temporary password exists; only expiry and email
    are refreshed, the real password is never touched.
13. **Salon has zero owners** (data anomaly) — send returns the `CO_OWNER_NO_EXISTING_OWNER` message
    rather than creating an unacceptable invitation.
14. **Accept called with no pending invitation** — 409. The lookup is by JWT user id, so there is
    nothing to enumerate.

---

# 19. Build order

Each step is independently reviewable and leaves the tree building.

1. **Migration** — the two RPCs, the partial unique index, the three role-aware policies. Run
   `supabase db reset` and the SQL test file.
2. **Regenerate** `packages/supabase-client/src/supabase/types.ts`.
3. **`useStaffInvitations` role filter** (adjacent defect, section 6) with a test that fails before
   the change. Independent of everything else; do it before any owner row can exist.
4. **`send-co-owner-invitation`** + tests. Verifiable standalone against a seeded tenant.
5. **`revoke-co-owner-invitation`** + tests. (Confirm A2 here.)
6. **`accept-co-owner-invitation`** + tests. Mind the grant-before-password ordering (AD-4).
7. **AD-5 route guard** — `ProtectedRoute`, `OnboardingRoute`, the `App.tsx` route, and a placeholder
   `/accept-co-owner` page. **Land this before any UI that can create an invitation**, so no invitee
   can ever hit the `/onboarding` hazard.
8. **`AcceptCoOwnerInvitationPage`** — all three states.
9. **`PendingCoOwnerInviteBanner`** for the has-tenants case.
10. **`useCoOwnerInvitation`** hook.
11. **`InviteCoOwnerDialog`**.
12. **Extend `SalonOwnersTab`** — invite action, pending row, revoke, resend, cap messaging. Keep its
    existing owners query and denied-state handling unchanged.
13. **Full verification sweep** (section 21).
14. **File a Jira ticket** under the existing second-owner epic — this project requires one per work
    item.

---

# 20. Tests required

## Unit — salon-admin (vitest)

- `InviteCoOwnerDialog` — required-field validation, email format, submit payload shape, every server
  error rendered, and **no role selector present**.
- `SalonOwnersTab` — existing owners-list tests keep passing; invite action hidden at two owners with
  the cap explanation (AC-5); pending row with status and expiry; revoke confirmation; resend throttle
  message.
- `useStaffInvitations` — **owner rows excluded from all four derived lists** (the adjacent defect fix;
  must fail before the change).
- `useCoOwnerInvitation` — send/resend/revoke call the right function with the right body.
- `AcceptCoOwnerInvitationPage` — new-account variant requires a password; promote-in-place variant
  does not; expired / revoked / cap terminal states.
- `ProtectedRoute` / `OnboardingRoute` — **pending invite + zero tenants redirects to
  `/accept-co-owner`, not `/onboarding`** (the AD-5 hazard); pending invite + has tenants does *not*
  redirect; no pending invite leaves both unchanged.

## Unit — edge functions (deno)

Follow the shape of the existing `backoffice-grant-multi-salon-ownership` test file.

- `send-co-owner-invitation` — non-owner caller 403; every `check_owner_invite_email` reason mapped to
  its message; cap reached; pending exists; `23505` mapped to the pending message; self-invite; new vs.
  existing-member branch; account deleted when the invitation insert fails; **a body-supplied
  `tenant_id` is ignored**.
- `accept-co-owner-invitation` — **assert the grant is attempted before the password change, and that a
  failed grant leaves the password untouched**; each grant error mapped; `already_owner` treated as
  success; expired refused; password required only when `requires_password_change`; reused temp
  password refused; body-supplied user id ignored.
- `revoke-co-owner-invitation` — non-owner 403; account deleted only when **both** AD-8 guards hold;
  account preserved when the user holds any role; not-pending 409.

## Integration — SQL (`supabase/tests/co_owner_invite.sql`)

Follow `supabase/tests/multi_salon_owner_identity.sql`.

- Partial unique index: a second pending owner invitation for the same tenant fails; one for a
  different tenant succeeds; a new one after `cancelled` succeeds (AC-21).
- RLS: a manager cannot select or update a `role='owner'` row; an owner can; a manager's access to
  `role='staff'` rows is **unchanged** (this is the narrowing-only claim, and it needs a test).
- `get_my_pending_co_owner_invitation` returns the caller's row and never another user's, including
  for a caller with no tenant membership at all.
- `list_tenant_owners_service` is not executable by `authenticated`.

## End-to-end

- Full new-account journey: invite → email → `/login` with temp password → **not redirected to
  onboarding** → set password → owner access → both owners listed, no pending invitation
  (AC-4, AC-11, AC-12).
- Promote in place: manager invited → signs in normally → banner → accept → holds owner, no longer
  manager (AC-9, AC-14).
- Revoke before acceptance → temp password no longer works (AC-18, AC-19).
- Revoke a promote-in-place invitation → the manager still has exactly their manager role (AC-20).
- Resend → old temp password fails, new one works (AC-22).
- A manager cannot reach the Owners tab or the invitation by any route (AC-2).

---

# 21. Verification commands

```bash
npm run lint
npm run build
npm run test

supabase db reset                                    # applies the new migration from scratch
psql "$DATABASE_URL" -f supabase/tests/co_owner_invite.sql

deno test --allow-all supabase/functions/send-co-owner-invitation/
deno test --allow-all supabase/functions/accept-co-owner-invitation/
deno test --allow-all supabase/functions/revoke-co-owner-invitation/
```

**Do not run `deno test --node-modules-dir=auto` from the repo root.** The review of the
`multi-salon-owner-identity` item recorded that doing so rewrote the shared root
`node_modules/vitest` symlink off its pnpm-pinned version and broke unrelated vitest runs, producing a
confusing failure in a file the change never touched. Scope `deno test` to the function directories as
above.

New lint warnings in this feature's files should be zero; the repo carries roughly 296 pre-existing
warnings elsewhere, which are not yours to fix.

---

# 22. Open questions and deferred items

**Decisions made in this design** (recorded so they can be audited or reversed individually):

1. *Should a promote-in-place invitee be forced to change their password to accept?* **No** — the PRD's
   own user flow contradicts itself here. Acceptance is an explicit confirm action; only invitees whose
   account this invitation created set a password. (AD-4)
2. *Should a promote-in-place invitee be blocked from the app until they respond?* **No** — banner
   only. Only an invitee with zero tenants is hard-redirected, because they have nowhere else to go.
   (AD-5)
3. *On revoke, delete the created account or rotate its password?* **Delete**, guarded on both
   conditions. Rotation leaves a role-less orphan holding an email address that then becomes
   permanently un-invitable. (AD-8)
4. *How do edge functions read the owner roster?* A new `service_role`-only RPC, not a hand-rolled
   TypeScript filter. (AD-11)

**Still genuinely open:**

5. ~~**`backoffice-add-tenant-co-owner` appears to be broken.**~~ **Resolved.** It called
   `get_tenant_owners` with the **service-role** client (`backoffice-add-tenant-co-owner/index.ts:143`),
   but that function self-gated on `has_backoffice_role(auth.uid(), 'super_admin')`, and a service-role
   JWT carries no `sub`, so `auth.uid()` was `null` and `has_backoffice_role(null, ...)` was `false`
   (`20260225010000_backoffice_role_template_access_fix.sql`). This always raised
   `BACKOFFICE_ACCESS_DENIED`, returning "Something went wrong. Please try again." — meaning the only
   existing co-owner path never worked. Confirmed live and fixed under `backoffice-co-owner-grant-broken`
   (A1): `get_tenant_owners` now also admits a `service_role` caller
   (`20260914120000_get_tenant_owners_service_role.sql`). `backoffice-add-tenant-co-owner/index.ts` was
   left unchanged. AD-11 keeps this feature clear of the same bug regardless.
6. **Plan gating and seat consumption** (A5). Whether co-ownership is available on every plan, and
   whether a co-owner consumes a staff seat, are pricing decisions no repository fact settles. This
   design assumes no gate and no seat (it does not call `assert_tenant_can_add_staff`). Either is a
   single added check at the top of `send-co-owner-invitation` — deliberately kept to one insertion
   point.
7. **Backoffice visibility of pending self-serve invitations.** Useful for "I never got the email"
   tickets; out of scope. Nothing here blocks adding it later — the rows live in `staff_invitations`
   and are readable with the service role.
8. **Expired invitations leave an orphan account.** AD-8 deletes on *revoke*, but nothing deletes on
   *expiry*, because this project has no scheduled job in scope here. Edge case 7 keeps the invitee
   safely on the terminal page, so there is no access problem — but the email-collision problem
   (AD-8's reasoning) is real. Needs a sweeper or expiry-time cleanup as its own item.
9. **`send-staff-invitation` has no server-side role whitelist.** Pre-existing; the UI is the only
   reason `role: "owner"` has never been sent to it. Explicitly out of scope per the PRD, which asks
   that it be raised separately. This design neither relies on it nor widens it (AD-2).
10. **`generateSecurePassword` uses `Math.random()`** (A6), which is not cryptographically secure. It
    is reused as-is for consistency with the existing staff flow, but it now guards an owner-level
    credential. Worth a separate item to move it to `crypto.getRandomValues`; changing it here would
    silently diverge the two invitation flows.

---

# 23. References

Background only — this document is self-contained and none of these is required reading.

- `docs/prd/co-owner-invite.prd.md` — product brief for this item
- `docs/research/2026-09-12-co-owner-invite.md` — Technical Brief (see section 6 for two stale claims)
- `docs/design/second-owner-foundation.design.md` — the design that produced the grant primitives
- `docs/design/multi-salon-owner-identity.design.md`, `docs/prd/multi-salon-owner-identity.prd.md`,
  `docs/research/2026-09-09-multi-salon-owner-identity.md`,
  `docs/design/multi-salon-owner-identity-notes.md` — the sibling item merged at `d29d38b`
- `docs/backlog-open-followups.md` — the `co-owner-invite` backlog entry
