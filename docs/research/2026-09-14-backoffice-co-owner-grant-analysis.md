# Backoffice co-owner grant: runtime confirmation and fix decision

**Date:** 2026-09-14
**Role:** analyst
**Upstream:** [`docs/research/2026-09-14-backoffice-co-owner-grant-broken.md`](./2026-09-14-backoffice-co-owner-grant-broken.md) (researcher — static analysis)
**Backlog item:** `backoffice-co-owner-grant-broken`
**Status:** reproduced, fix decided, handed to implementer

---

## Result

The researcher's hypothesis is **confirmed at runtime**, not merely by reading. `backoffice-add-tenant-co-owner`
is permanently broken: every invocation returns `500 {"error":"Something went wrong. Please try again."}`
before it reaches any of the actual co-owner-granting logic.

It was reproduced against a live local Supabase stack (all 308 migrations applied) by driving the real
`handleAddTenantCoOwner` with a real service-role client and a real caller JWT for a real `super_admin`
with a valid fresh TOTP:

```
a super_admin can grant co-ownership end-to-end ... FAILED
  AssertionError: Values are not equal: expected 200, got 500:
  {"error":"Something went wrong. Please try again."}

  [captured function log]
  [backoffice-add-tenant-co-owner] get_tenant_owners error: {
    code: "P0001", details: null, hint: null, message: "BACKOFFICE_ACCESS_DENIED"
  }
```

### Reproduction

```bash
supabase start
deno test -A --node-modules-dir=auto \
  supabase/functions/backoffice-add-tenant-co-owner/index.integration.test.ts
```

Also written to `.claudespace/s/<instance>/repro`. The test file added by this investigation is
`supabase/functions/backoffice-add-tenant-co-owner/index.integration.test.ts`. It seeds its own salon,
owner, `super_admin` and TOTP secret, so it needs no fixtures beyond a running stack.

Verified both directions:

| | test 1 (e2e grant) | test 2 (gate invariants) |
|---|---|---|
| shipped schema | **FAILED** (500) | ok |
| proposed fix applied | ok (200, two active owners) | ok |

Note `--node-modules-dir=auto` is required for any `deno test` in this repo — the root `package.json` +
`node_modules/` otherwise make Deno reject the `npm:otpauth@9.2.2` import. The existing
`index.test.ts` cannot be run without it either.

---

## The mechanism, measured

Each link in the chain was observed directly rather than inferred.

**1. The service-role JWT carries no `sub`.** Decoded from the key the edge function uses:

```
user JWT claims:    role=authenticated  sub=bf9c5720-e0ad-43c6-9683-11d1964b03f1
service JWT claims: role=service_role   sub=(absent)
```

**2. `auth.uid()` is therefore NULL for the service-role client.** Measured through a temporary probe RPC
called by each client (probe dropped afterwards):

```
service-role: auth_uid=null
              jwt_claims={"exp":...,"iss":"supabase-demo","role":"service_role"}
caller JWT:   auth_uid="bf9c5720-e0ad-43c6-9683-11d1964b03f1"
```

`auth.uid()` in this project is the standard two-form lookup, confirmed from the live catalog:

```sql
coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
```

**3. The gate is therefore always false, for the same tenant, in the same session:**

```
E1: admin.rpc('get_tenant_owners')       [service-role]  -> error P0001 BACKOFFICE_ACCESS_DENIED
E2: authClient.rpc('get_tenant_owners')  [caller JWT]    -> 1 row, error null
```

Same caller, same salon, same moment — only the client differs. `has_backoffice_role(NULL, 'super_admin')`
is `false` because `user_id = NULL` is never true, so the `exists(...)` is empty. That is correct
behaviour for `has_backoffice_role`; it is not the thing to fix.

**4. Nothing downstream of `index.ts:143` ever runs.** `user_roles` for the seeded salon was unchanged
after the call — no account created, no grant attempted.

---

## Why no existing test caught it

The researcher's brief noted that `index.test.ts` mocks `admin.rpc` wholesale. That is true, but there is
a second, more surprising half: **`supabase/tests/co_owner_foundation.sql` does exercise `get_tenant_owners`
against real Postgres** (T-8, lines 64-82) — it just never simulates the service-role caller. It sets
`request.jwt.claim.sub` to a non-admin (expects denial) and to a super_admin (expects one row), which are
exactly the two browser-shaped cases. The edge function's calling context was never represented in either
suite, so both were green while the feature was 100% broken in production.

---

## Decision: fix the RPC's gate, not the call site

**Chosen:** teach `get_tenant_owners` that it has two legitimate calling contexts — a browser super_admin,
and a trusted server — via a `service_role` branch in its existing self-gate. Leave `index.ts:143` alone.

```sql
if auth.role() is distinct from 'service_role'
   and not has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role) then
  raise exception 'BACKOFFICE_ACCESS_DENIED' using errcode = 'P0001';
end if;
```

Verified working end-to-end (table above), with anon and signed-in-non-super-admin still denied.

Why this one:

- It matches how every sibling RPC in the *same migration* was already set up for this exact caller:
  `check_owner_invite_email` is granted to `authenticated, service_role`; `grant_tenant_co_owner` is
  service_role-only. `get_tenant_owners` was written for the dialog and then reused by the edge function
  without being adjusted. This is finishing that migration, not inventing a pattern.
- It matches the sibling function `backoffice-add-tenant-owner`, which does *all* of its data work through
  `admin` after authorizing once via `authClient`.
- It grants no new capability. `service_role` has `rolbypassrls = true` and can already
  `select * from public.user_roles` / `auth.users` directly; the gate was never protecting anything against
  that caller.
- The caller is still genuinely authorized — `requireSuperAdminWithFreshTotp` (`index.ts:127-128`) runs
  first against the caller's own JWT and already verified super_admin + fresh TOTP.
- Zero churn to the 12 existing unit tests (confirmed: 12 passed).

`auth.role()` was confirmed to exist and to resolve correctly per client:
`service_role` via the service key, `anon` via the anon key.

### Rejected: call through `authClient.rpc` at `index.ts:143`

A one-word change, and it **does work** — verified end-to-end by patching it in, running the repro (passed),
and reverting. Rejected because:

- It breaks 8 of the 12 existing unit tests (measured), since the mocked `authClient` has no `.rpc`.
  Recoverable, but it is churn on a test file that is otherwise fine.
- No other code in `supabase/functions` calls `authClient.rpc` — it would be a new pattern, and the one it
  displaces (`admin` for all post-authorization data work) is used consistently, including by the sibling
  add-owner function.
- It makes a server-side read depend on the caller's token lifetime, for a read the server is already
  entitled to make.

It is a legitimate second choice. If a reviewer prefers defense-in-depth over consistency, the repro gates
it equally well — test 1 is fix-agnostic.

### Rejected: drop the RPC and inline the roster query with `admin`

Removes the redundant gate entirely and is honest about the trust boundary, but duplicates the roster query
(including its documented `order by ur.created_at` semantics, FR-3) in TypeScript, diverging from the
version `AddCoOwnerDialog.tsx` still calls. Two copies of an ownership query that must agree is the drift
the codebase explicitly guards against elsewhere (see the header comment on
`_shared/backoffice-elevated-auth.ts`). Not worth it to avoid one migration.

---

## Two traps for the implementer

**1. Use `is distinct from`, not `<>`.** If `auth.role()` is NULL — which it is on a direct database
connection, and inside `supabase/tests/co_owner_foundation.sql`, which only ever sets
`request.jwt.claim.sub` — then `<>` makes the whole condition NULL, the `if` does not fire, and **the gate
is bypassed entirely**. Measured:

```
auth.role() NULL -> (role <> 'service_role') AND NOT gate           = NULL   <-- no exception: BYPASSED
auth.role() NULL -> (role IS DISTINCT FROM 'service_role') AND NOT gate = true <-- exception: gate holds
```

This is the same class of NULL-comparison mistake as the original defect. It matters more than it looks,
because of trap 2.

**2. The gate is the only protection — `PUBLIC` already holds EXECUTE.** From the live catalog:

```
PUBLIC=EXECUTE, postgres=EXECUTE, anon=EXECUTE, authenticated=EXECUTE
```

Postgres grants EXECUTE to `PUBLIC` by default and the migration's `grant execute ... to authenticated`
never revoked it, so that grant restricts nothing. This is confirmed behaviourally: an anon client reaches
the function body and is stopped by the `raise`, not by a permission error. The migration's own comment
("self-gated ... rather than trusting its `authenticated` grant") is more load-bearing than it reads.
Consequently **no `grant execute ... to service_role` is needed** — `service_role` already has EXECUTE via
`PUBLIC`; only the gate needs to change.

If the implementer adds a service-role case to `supabase/tests/co_owner_foundation.sql`, it must clear the
stale setting first, or the test will silently not test what it claims:

```sql
perform set_config('request.jwt.claim.sub', '', true);   -- else it shadows the claims JSON
perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- now auth.role() = 'service_role' and auth.uid() is NULL, as in production
```

Measured: with a stale `request.jwt.claim.sub` left set, `auth.uid()` returns that user id even though the
claims JSON says `service_role`.

---

## Scope handed to the implementer

1. New migration: `get_tenant_owners` gate becomes the two-context form above. No grant changes needed.
2. Extend `supabase/tests/co_owner_foundation.sql` T-8 with a service-role caller case (per trap 2's
   snippet) — this is the coverage gap that let the defect ship.
3. `supabase/functions/backoffice-add-tenant-co-owner/index.ts` is **unchanged**.
4. `supabase/functions/backoffice-add-tenant-co-owner/index.integration.test.ts` is already written and is
   the acceptance gate; it should go green without modification.
5. Update `docs/backlog-open-followups.md` (`backoffice-co-owner-grant-broken`) and item A1 in
   `docs/design/co-owner-invite.design.md`.

---

## Environment notes

Docker Desktop was started and a local Supabase stack brought up for this investigation
(`supabase start -x studio,imgproxy,inbucket,storage-api,edge-runtime,logflare,vector,pgbouncer,realtime,supavisor`).
**It is still running** so the repro can be re-run — `supabase stop` when finished with it.

The local database was returned to the shipped `get_tenant_owners` definition and both temporary probe
functions were dropped, so the repro is left in its failing (pre-fix) state. The temporary `authClient.rpc`
patch to `index.ts` used to evaluate the rejected alternative was reverted; `index.ts` is unmodified.

No source files were changed by this investigation. The only file added is the integration test.

## Decisions taken autonomously

Running under `--think`; recorded per that mode.

- Q: Start Docker Desktop to obtain a live database? -> A: Yes — the item is explicitly runtime-only and
  unanswerable without one. (decided autonomously)
- Q: Which fix shape? -> A: The `service_role` branch in `get_tenant_owners`' gate, over `authClient.rpc`
  and over inlining the query; reasoning and measurements above. (decided autonomously)
- Q: Should the repro assert the current `BACKOFFICE_ACCESS_DENIED` behaviour? -> A: No — an earlier draft
  did, which would have pinned one specific fix shape and failed a legitimate alternative. Test 2 now
  asserts only the security invariants that must hold under any fix. (decided autonomously)
