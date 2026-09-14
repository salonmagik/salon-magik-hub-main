# Original Request

> Investigate whether the backoffice-add-tenant-co-owner edge function is permanently broken. It calls get_tenant_owners with the service-role client (supabase/functions/backoffice-add-tenant-co-owner/index.ts:143), but that function self-gates on has_backoffice_role(auth.uid(), 'super_admin'); a service-role JWT carries no `sub`, so auth.uid() is null and the gate should be false, always raising BACKOFFICE_ACCESS_DENIED. This was read from source and never executed — confirm the actual runtime behaviour before any fix is designed, and establish the correct fix shape. Matters because backoffice is the designated fallback for cases the new co-owner invite flow refuses.

---

# Summary

The hypothesis is confirmed by static analysis with high confidence; it could not be executed against a live database because no local Supabase/Docker instance is available in this environment (see Unknowns). `backoffice-add-tenant-co-owner` calls the `get_tenant_owners` RPC (`supabase/functions/backoffice-add-tenant-co-owner/index.ts:143`) through the **service-role** (`admin`) Supabase client. `get_tenant_owners` is a `SECURITY DEFINER` function that self-gates with `has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role)` (`supabase/migrations/20260908063000_co_owner_foundation.sql:105-119`). A service-role JWT has a `role: "service_role"` claim but no `sub` claim, so Supabase's standard `auth.uid()` (`nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid`) returns `NULL`. `has_backoffice_role`'s implementation is `where user_id = _user_id` (`supabase/migrations/20260225010000_backoffice_role_template_access_fix.sql:35-41`); under SQL's three-valued logic, `user_id = NULL` is never true for any row, so the `exists(...)` is always `false` regardless of who is actually calling the edge function. `get_tenant_owners` therefore always raises `BACKOFFICE_ACCESS_DENIED` (errcode P0001) when invoked this way, `index.ts:146-149` catches that as `ownersError`, logs it, and returns a generic `500 "Something went wrong. Please try again."` — for every caller, every time, regardless of whether they are actually a super_admin with fresh TOTP. This is downstream of `requireSuperAdminWithFreshTotp` (`index.ts:127-128`), which does correctly authorize the caller first using the **user's own** JWT via `authClient` — so the bug isn't in the auth gate, it's specifically in the second, redundant RPC call made with the wrong client.

This was previously reasoned from source by principal while designing `co-owner-invite` and already recorded in `docs/backlog-open-followups.md` (`backoffice-co-owner-grant-broken`, status `in-progress`) and as item A1 in `docs/design/co-owner-invite.design.md:62,1101-1106`. This investigation corroborates that reasoning and adds one new fact: the existing unit tests (`supabase/functions/backoffice-add-tenant-co-owner/index.test.ts`) mock `admin.rpc` entirely (lines 73-89), so `get_tenant_owners` is never exercised against real Postgres RLS/JWT semantics in CI — nothing in the test suite would catch this.

---

# Current Behaviour

`handleAddTenantCoOwner` (`index.ts:113-342`) runs in this order:

1. `requireSuperAdminWithFreshTotp(admin, authClient, totpToken, corsHeaders)` — authorizes using `authClient`, which carries the **caller's own bearer token** (`index.ts:354-356`). This step works correctly: `authClient.auth.getUser()` resolves the real caller, and the `backoffice_users` row lookup + fresh-TOTP check both succeed or fail based on that real identity.
2. Field validation, tenant lookup (`admin.from("tenants")`).
3. `admin.rpc("get_tenant_owners", { p_tenant_id: tenantId })` at `index.ts:143-145` — this is the broken call. `admin` is the **service-role** client (`index.ts:353`), which never carries a caller JWT with a `sub` claim.
4. Any error from step 3 is returned as a generic 500 (`index.ts:146-149`), before the function ever reaches the owner-count checks, availability check, account creation, or the actual `grant_tenant_co_owner` grant.

Because step 3 always errors, steps 4 onward (all of the actual co-owner-granting logic) are unreachable in production. The function's authorization gate (step 1) is sound; the defect is entirely in the second, independent authorization check baked into `get_tenant_owners` being evaluated against the wrong client.

---

# Affected Surfaces

The request is a defect investigation, not a contract change — no producer/consumer surfaces are being modified here. For completeness, the two callers of the affected function are:

- **`apps/backoffice/src/components/AddCoOwnerDialog.tsx:83`** — calls `get_tenant_owners` directly via the browser's own `supabase.rpc`, i.e. with the logged-in super_admin's real session JWT (has a `sub`). This call path is **not** broken — it's how the dialog populates the owner roster for the confirmation step before invoking the edge function. No change needed here.
- **`supabase/functions/backoffice-add-tenant-co-owner/index.ts:143`** — the broken call, using the service-role `admin` client. This is the surface a fix would need to touch.

No other code calls `get_tenant_owners`.

---

# Existing Implementation & Placement

- **Existing implementation**: The co-owner grant capability already exists in full (`grant_tenant_co_owner`, `check_owner_invite_email`, `get_tenant_owners` RPCs, and `handleAddTenantCoOwner`); this is a defect in existing code, not a missing feature. This exact defect has already been identified once before (principal, during `co-owner-invite` design) and is tracked in `docs/backlog-open-followups.md` under `backoffice-co-owner-grant-broken` (status `in-progress`) — this investigation is that item's confirmation step, not new discovery.
- **Correct home**: The fix belongs in `supabase/functions/backoffice-add-tenant-co-owner/index.ts` (the call site) and/or `supabase/migrations/` (if the RPC's gating needs to change) — both already in this repo, not an upstream/shared package. There is no monorepo/shared-package layer here; this is a single-repo Supabase project. No instructions-file guidance was found dictating placement beyond the existing pattern already used at this call site.
- **No prior memory note** exists alongside these docs for this specific item (checked `docs/research/`, `docs/design/`, `docs/backlog-open-followups.md` — the backlog entry and design item A1 are the only prior artifacts, both already summarized above).

---

# Execution Flow

```
supabase.functions.invoke("backoffice-add-tenant-co-owner")
    ↓
serve() handler (index.ts:344-359)
    ↓ builds admin (service-role) + authClient (caller JWT)
handleAddTenantCoOwner()
    ↓
requireSuperAdminWithFreshTotp(admin, authClient, totpToken)   -- uses authClient, correct caller identity, works
    ↓ ok
admin.rpc("get_tenant_owners", { p_tenant_id })                -- uses admin (service-role), no `sub` claim
    ↓
Postgres: get_tenant_owners()  [SECURITY DEFINER]
    ↓
has_backoffice_role(auth.uid(), 'super_admin')   -- auth.uid() = NULL under service-role JWT
    ↓
user_id = NULL  →  always false (SQL three-valued logic)
    ↓
raise exception 'BACKOFFICE_ACCESS_DENIED'  (errcode P0001)
    ↓
index.ts:146-149 catches as ownersError → return 500 "Something went wrong. Please try again."
    (steps below this point — owner count checks, availability check, account
    creation, grant_tenant_co_owner — are never reached)
```

---

# Relevant Files

- `supabase/functions/backoffice-add-tenant-co-owner/index.ts` — the function under investigation; the broken call is line 143, the surrounding auth gate (lines 127-128) is sound.
- `supabase/functions/backoffice-add-tenant-co-owner/index.test.ts` — confirms `admin.rpc` is fully mocked (lines 73-89), so no existing test exercises real Postgres semantics for this call.
- `supabase/functions/_shared/backoffice-elevated-auth.ts` — `requireSuperAdminWithFreshTotp`, the (working) first-stage authorization check, using `authClient` correctly.
- `supabase/migrations/20260908063000_co_owner_foundation.sql` — defines `get_tenant_owners` (lines 105-119) and its self-gate.
- `supabase/migrations/20260225010000_backoffice_role_template_access_fix.sql` — current definition of `has_backoffice_role` (lines 28-42), showing the `user_id = _user_id` equality that fails under `NULL`.
- `apps/backoffice/src/components/AddCoOwnerDialog.tsx` — the only other caller of `get_tenant_owners` (line 83), calling it correctly via the browser's own session client — confirms the RPC's gate itself is not the problem, only how the edge function calls it.
- `docs/backlog-open-followups.md` — prior tracking of this exact defect (`backoffice-co-owner-grant-broken`).
- `docs/design/co-owner-invite.design.md` — prior reasoning (item A1, lines 62, 1101-1106) that this investigation corroborates.

---

# Relevant Components

- Edge function: `backoffice-add-tenant-co-owner`
- Postgres RPCs: `get_tenant_owners`, `has_backoffice_role` (both `SECURITY DEFINER`)
- Shared auth helper: `requireSuperAdminWithFreshTotp`
- Frontend caller: `AddCoOwnerDialog.tsx` (unaffected, uses a different client correctly)

---

# Existing Constraints

- `get_tenant_owners` is deliberately `SECURITY DEFINER` and self-gated rather than relying on its `authenticated`-only grant (comment at `20260908063000_co_owner_foundation.sql:103-104`) — any fix must preserve some form of super_admin-only enforcement, not remove gating outright.
- `requireSuperAdminWithFreshTotp` already establishes the real caller's super_admin identity with fresh TOTP before this RPC is ever reached (`index.ts:127-128`) — the caller's `id` is available in-scope as `caller.id` at the point the broken call happens (`index.ts:129`, used later at `index.ts:287`).
- No other code path in the repository calls a `SECURITY DEFINER`, `auth.uid()`-self-gated RPC via the service-role client and works around it (`authClient.rpc` does not appear anywhere in `supabase/functions`) — there is no existing precedent pattern in this codebase to copy for the fix; whatever shape is chosen will be new to this codebase, not a variant of something already proven here.

---

# Existing Behaviour

- Because the broken call happens before the owner-count and availability checks, **every** invocation of this function currently fails with the same generic 500, regardless of tenant state, caller identity, or payload — there's no partial/intermittent failure mode to account for.
- The failure is silent to the caller beyond "Something went wrong. Please try again." (`index.ts:148`) — the real `BACKOFFICE_ACCESS_DENIED` / P0001 detail is only visible in the function's server-side console log (`index.ts:147`).

---

# Unknowns

- Q: Does this actually raise `BACKOFFICE_ACCESS_DENIED` at runtime, exactly as the static analysis predicts? -> Could not be executed: no Docker daemon is running in this environment (`supabase status` fails with "Cannot connect to the Docker daemon"), so no local Supabase instance was available to invoke the function end-to-end. **[engineering - unresolved: runtime-only]** — confidence is high (Postgres NULL-comparison semantics are well-defined and not environment-dependent, `auth.uid()`'s no-`sub`-under-service-role behavior is standard, documented Supabase platform behavior, and this exact conclusion was independently reached by principal from source during a separate investigation), but it is a runtime fact, not something further static reading can settle beyond what's already been traced here.
- Q: What is the correct fix shape? -> Not decided here — out of scope for a research investigation (this role documents current behaviour, it does not design fixes). Two constraints for whoever designs it: (a) `get_tenant_owners`'s gate must stay effectively super_admin-only, and (b) the caller's identity is already available and verified in `handleAddTenantCoOwner` as `caller.id` by the time the broken call happens — no existing in-repo pattern was found for passing an already-verified actor id into an `auth.uid()`-gated `SECURITY DEFINER` RPC called via the service-role client. **[product]** with an engineering shape attached, matching how principal already flagged the equivalent tradeoff for the related `co-owner-invite` design (`docs/research/2026-09-12-co-owner-invite.md:339`).

---
