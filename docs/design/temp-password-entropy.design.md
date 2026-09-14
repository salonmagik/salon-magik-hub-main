# Implementation Design — temp-password-entropy

Backlog item: `docs/backlog-open-followups.md` → `## temp-password-entropy: generateSecurePassword uses Math.random()` (status: in-progress)

---

# 1. References

- Technical Brief: `docs/research/2026-09-14-secure-password-and-role-whitelist.md`
- Backlog item: `docs/backlog-open-followups.md:103-110`
- Prior design this work touches the edges of: `docs/design/co-owner-invite.design.md` (AD-10 — resend regenerates the temporary password)

No Planning Brief exists for this item; it is a well-scoped engineering change and the Technical Brief plus the backlog entry carry the product intent. This document does not restate the problem, the current behaviour, or the as-is call graph — all of that is in the brief. It covers only how to build the fix.

---

# 2. Two corrections to the Technical Brief

The brief is accurate on everything it examined, but its call-site enumeration is incomplete, and the original request specifically asked for *every* copy of the generator to be found before anything changed. Both corrections below were verified by direct reading of source in this worktree.

## C-1 — There are four insecure copies, not two

The brief states: *"No other call sites of `generateSecurePassword` exist (confirmed via repo-wide grep — only the two functions above define/call it)."* This is wrong. `grep -rn "Math.random()" supabase/functions/` returns four byte-identical 8+2 generators:

| Function | Definition | Call sites | Credential minted |
|---|---|---|---|
| `send-staff-invitation` | `index.ts:33-49` | `:202`, `:272` | staff-level |
| `send-co-owner-invitation` | `index.ts:48-54` | `:297`, `:453` | **owner-level** |
| `backoffice-add-tenant-owner` | `index.ts:16-23` | `:134` | **owner-level** |
| `backoffice-add-tenant-co-owner` | `index.ts:22-29` | `:211` | **owner-level** |

Three of the four mint owner-level credentials. The item's stated rationale — *"it now guards owner-level credentials, not just staff"* — applies at least as strongly to the two backoffice functions, which are how a super-admin installs the owner of a salon. See §3 for why they are folded into this work.

## C-2 — A crypto-based generator already exists in this repo, twice

Two functions already do exactly what this item asks for, and neither appeared in the brief:

- `supabase/functions/provision-super-admin/index.ts:16-22` — `crypto.getRandomValues`, `length = 16`, charset includes ambiguous characters (`I`, `O`, `0`, `1`).
- `supabase/functions/create-backoffice-admin/index.ts:31-35` — `crypto.getRandomValues`, `length = 14`, ambiguity-free charset, specials mixed into the single charset rather than appended.

These are the precedent for the implementation below. Both use `byte % chars.length`, which is biased (see AD-2); the shared module corrects that rather than copying it. Neither is a defect requiring change in this item — see AD-4.

---

# 3. Scope

In scope, per the brief and the original request:

1. Replace `Math.random()` with `crypto.getRandomValues` in `send-staff-invitation` and `send-co-owner-invitation`, moving together so the two invitation paths do not diverge.
2. Enforce a server-side role whitelist in `send-staff-invitation`.

## Adjacent defect folded into this work

**`backoffice-add-tenant-owner` and `backoffice-add-tenant-co-owner` also use the `Math.random()` generator, and are fixed here.**

Against the three tests:

1. **Defect, not decision.** A function named `generateSecurePassword` that is not cryptographically secure is code not doing what it claims. There is no policy question — the item has already decided the answer is `crypto.getRandomValues`.
2. **Not already a backlog item.** `docs/backlog-open-followups.md` has exactly one password-entropy item (`temp-password-entropy`, line 103) and it describes the generator generically, not a specific pair of functions. No other item covers the backoffice copies; left out, they would need a new pipeline run to change four lines.
3. **Code this design already touches.** It is the same duplicated function, and this design's central act is deleting every copy of it in favour of one shared module. Consolidating two of four copies while leaving two live Math.random() owner-credential generators behind is precisely the silent divergence the request exists to prevent.

Out of scope, recorded as deferrals in §14: migrating `provision-super-admin` and `create-backoffice-admin` onto the shared module, and any database-level constraint on `user_roles.role`.

---

# 4. Architecture Decisions

## AD-1 — One shared module, `_shared/secure-password.ts`; delete all four local copies

**Decision.** Add `supabase/functions/_shared/secure-password.ts` exporting a single `generateSecurePassword()`. Delete the local definition from all four functions in C-1 and import from the shared module.

**Reasoning.** `_shared/` is the established convention for logic used by more than one Deno function (18 modules, several with `.test.ts` siblings). The explicit requirement that the staff and owner paths "must move together so the two invitation paths do not silently diverge" is a requirement that they share one definition — four copies kept in sync by discipline is the thing that already failed here, twice over. A shared module also gives the generator a test file, which a copy inlined in an edge function never gets.

`send-co-owner-invitation/index.ts:46` carries the comment `// generateSecurePassword — kept local rather than shared to avoid coupling`. That decision is deliberately reversed. The coupling it avoided is exactly the coupling now wanted: a change in RNG must reach every invitation path at once. The comment is deleted with the function.

**Rejected — edit each copy in place.** Smallest diff, but leaves four independent definitions that must be kept in sync forever, and the next entropy or charset change re-runs this exact investigation. It also cannot be unit-tested.

**Rejected — put it in `_shared/tenant-auth.ts` or another existing module.** Nothing there is about credentials; a one-purpose module matching the `salon-app-url.ts` / `otp-ip-throttle.ts` granularity already in the directory is more consistent.

## AD-2 — Rejection sampling, not modulo

**Decision.** Map random bytes to charset indices with rejection sampling: draw a byte, discard it if it falls in the final partial block, otherwise take `byte % charset.length`.

**Reasoning.** The alphanumeric charset is 55 characters and the specials charset is 7; neither divides 256. Plain `byte % 55` makes the first 36 characters ~17% likelier than the rest, and `byte % 7` biases the first 4 specials. The bias is small in absolute terms but it costs a fraction of a bit of entropy for no reason, and the whole point of this item is that this generator should be defensible. Rejection sampling is four extra lines and removes the question entirely. Thresholds: accept `byte < 220` for the 55-char set (`256 - 256 % 55`), `byte < 252` for the 7-char set.

**Rejected — copy `create-backoffice-admin`'s `byte % chars.length`.** It is the existing in-repo precedent, but it is the biased form; copying it into the module that is meant to be canonical would propagate the flaw to every caller rather than retire it.

## AD-3 — Preserve the exact 8+2 password shape

**Decision.** The shared generator produces 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789` followed by 2 from `!@#$%&*` — byte-for-byte the existing contract, only the entropy source changes.

**Reasoning.** The brief flags that email templates and downstream password-strength expectations are built around this shape, and the ambiguity-free charset exists so a temp password can be read off an email and typed. Changing length or composition in the same change that changes the RNG would make any onboarding regression ambiguous between the two. Entropy is unchanged at ~51.9 bits (`8·log₂55 + 2·log₂7`), which is ample for a 7-day single-use credential.

**Rejected — raise length or merge the charsets while we are here.** A behaviour change riding along on a security fix; and the 2-specials tail is what guarantees the password satisfies any complexity rule Supabase Auth applies on `createUser`.

## AD-4 — Leave `provision-super-admin` and `create-backoffice-admin` on their own generators

**Decision.** Do not touch them in this item. Record the consolidation as a deferral.

**Reasoning.** Both already use `crypto.getRandomValues`, so neither is the defect this item is about — folding them in would be a pure refactor, and each uses a different length and charset, so migrating them means either changing their password shape or parameterising the shared module for two callers that are not asking for it. They fail test 1 of the adjacent-defect rule (not a defect) and are left alone deliberately, not by oversight.

The module is nonetheless written with no hidden assumptions that would block a later migration — see the `Options` note in §5.

## AD-5 — The role whitelist is a local constant in `send-staff-invitation`, not shared

**Decision.** Define `const ALLOWED_INVITE_ROLES = ["manager", "supervisor", "receptionist", "staff"] as const;` inside `send-staff-invitation/index.ts` and validate against it. Narrow `InvitationRequest.role` from `role?: string` to the union of those four values.

**Reasoning.** There is exactly one consumer. `send-co-owner-invitation` hardcodes `role: "owner"` and takes no role input, so it has nothing to validate; the backoffice functions likewise mint owner rows directly. A shared roles module would have one importer and would invite future callers to treat "roles a staff invitation may grant" as interchangeable with "roles that exist" — they are not, and conflating them is how `owner` would get back into the list. The set is intentionally the *invitable* subset, and it is intentionally defined next to the code that enforces it.

The set matches `apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx:35-39` exactly, so no currently-reachable UI action starts failing. The dialog is unchanged and stays as the affordance layer on top.

**Rejected — derive the list from the database or an RPC.** A network round-trip to answer a question whose answer is a compile-time constant, and it makes the security boundary mutable by data.

## AD-6 — Validate the stored role on the resend path too

**Decision.** The resend branch reads `recipientRole` from `staff_invitations.role` (`index.ts:~207`). Validate that value against the same whitelist and reject with 400 if it fails.

**Reasoning.** Validating only the new-invite path leaves a replay hole: any `staff_invitations` row written before this fix — or by any other writer — can hold `role: "owner"`, and resending it is a second path to the same outcome. The check is one comparison on a value already in hand. A row that fails it is by definition one that should never have existed, so rejecting is correct rather than merely cautious; the 400 also surfaces such a row instead of silently re-mailing it.

Note that the resend path does not itself write `user_roles` — the role row was created when the invitation was first issued — so this is defence against a poisoned row being re-blessed and re-mailed, not the primary gate. The primary gate is AD-7.

## AD-7 — Reject before any side effect

**Decision.** In the new-invitation branch, the whitelist check goes immediately after the existing `if (!firstName || !lastName || !email || !role)` presence check at `index.ts:~240` — before the `assert_tenant_can_add_staff` RPC, before `listUsers()`, before `createUser`.

**Reasoning.** It is the cheapest possible rejection and it means an invalid role can never consume a seat-gate check, create an auth user, or leave a partially-constructed account for the existing rollback path to clean up. Placing it later would make an invalid `role` reach `user_roles.insert` at `index.ts:332` and depend on the compensating `deleteUser` to undo — a rollback that the current code performs on a best-effort basis with errors only logged.

## AD-8 — No database CHECK constraint on `user_roles.role`

**Decision.** Do not add one.

**Reasoning.** It cannot express the rule. `owner` is a legitimate value in `user_roles` — `send-co-owner-invitation:336` and both backoffice functions write it by design. A CHECK constraint can only enumerate roles that may exist, which must include `owner`, so it would not block the thing this item is about. The rule being enforced is *"this endpoint may not grant this role"*, which is an authorization rule and belongs at the endpoint.

A constraint restricting the *set of role strings* to guard against typos is a separate, genuinely useful idea; it is recorded as a deferral in §14, not smuggled in here.

## AD-9 — Correct home

The password generator belongs in `supabase/functions/_shared/` (AD-1) — it is Deno-runtime code shared across edge functions and has no consumer in `apps/`. The role whitelist belongs inside `send-staff-invitation` (AD-5). Nothing in this change belongs in `apps/salon-admin`; the brief confirms `InviteStaffDialog.tsx` needs no change, and it gets none.

---

# 5. Components

| Component | Change |
|---|---|
| `supabase/functions/_shared/secure-password.ts` | **New.** Exports `generateSecurePassword()`. |
| `supabase/functions/_shared/secure-password.test.ts` | **New.** Deno unit tests (§11). |
| `supabase/functions/send-staff-invitation/index.ts` | Delete local generator; import shared. Add `ALLOWED_INVITE_ROLES`, narrow `InvitationRequest.role`, validate on both branches. |
| `supabase/functions/send-co-owner-invitation/index.ts` | Delete local generator **and its `// kept local rather than shared` comment**; import shared. |
| `supabase/functions/backoffice-add-tenant-owner/index.ts` | Delete local generator; import shared. (Folded in — §3.) |
| `supabase/functions/backoffice-add-tenant-co-owner/index.ts` | Delete local generator; import shared. (Folded in — §3.) |
| `apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx` | **No change.** Listed so it is explicitly confirmed as unaffected. |

## `_shared/secure-password.ts` — shape

```ts
const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // 55, no I/O/0/1/l
const SPECIALS = "!@#$%&*";                                                     // 7

/** Unbiased index into `charset`, via rejection sampling over random bytes. */
function randomIndex(charset: string): number { /* draw byte; reject >= 256 - 256 % len */ }

/**
 * Cryptographically secure temporary password: 8 ambiguity-free alphanumerics
 * followed by 2 specials (~51.9 bits). Shape is the pre-existing contract —
 * onboarding emails and Supabase Auth complexity rules depend on it.
 */
export function generateSecurePassword(): string { /* ... */ }
```

Implementation notes for the implementer:

- Draw bytes with `crypto.getRandomValues(new Uint8Array(n))`. Drawing a small buffer and refilling when exhausted is fine and preferred over one `getRandomValues` call per character; rejection means the number of bytes needed is not fixed, so the refill loop must handle exhaustion rather than assume a size.
- No `import` of any crypto library — `crypto` is a global in Deno, as `provision-super-admin:19` already relies on.
- Keep the export signature parameterless. If a later item migrates the backoffice-admin generators (AD-4), an optional `options` argument can be added without breaking these four callers; do not add it speculatively now.
- Callers import with the same relative style as their existing `_shared` imports: `import { generateSecurePassword } from "../_shared/secure-password.ts";`

---

# 6. Data Flow

The lifecycle is unchanged from the brief's *Execution Flow*; two points on the staff path change.

```
Staff invite (send-staff-invitation), new-invitation branch
  Request { firstName, lastName, email, phone, role, ... }
    ↓
  presence check (!firstName || !lastName || !email || !role)          [existing]
    ↓
  ► ALLOWED_INVITE_ROLES check → 400 "Invalid role" on failure          [NEW, AD-5/AD-7]
    ↓
  assert_tenant_can_add_staff RPC (seat gate)                          [existing]
    ↓
  ► generateSecurePassword() from _shared, crypto-backed               [CHANGED, AD-1]
    ↓
  listUsers → duplicate-email check → createUser → profile upsert      [existing]
    ↓
  user_roles insert { role }  ← role now provably in the whitelist     [existing insert]
    ↓
  invitation row + email

Staff invite, resend branch
  lookup staff_invitations row
    ↓
  ► ALLOWED_INVITE_ROLES check on existingInvitation.role → 400        [NEW, AD-6]
    ↓
  tempPassword = existingInvitation.temp_password || generateSecurePassword()
       ↑ fallback preserved exactly; only the generator behind it changes
    ↓
  extend expiry, update stored temp_password, updateUserById, re-send email

Co-owner invite / backoffice add-owner / backoffice add-co-owner
  unchanged, except generateSecurePassword() now resolves to the shared module
```

---

# 7. API Changes

No change to any function's request or response *shape*. One new rejection on an existing endpoint:

`POST send-staff-invitation` → `400 { "error": "Invalid role" }` when `role` is not one of `manager`, `supervisor`, `receptionist`, `staff`.

This is the existing error envelope (`JSON.stringify({ error })`, `status`, `{ "Content-Type": "application/json", ...corsHeaders }`) used throughout the function — match it exactly, including the CORS spread, or the browser sees a CORS failure instead of the 400.

---

# 8. Database Changes

None. No migration, no index, no backfill. See AD-8 for why no `user_roles.role` constraint is added.

---

# 9. Validation

| Input | Rule | Failure |
|---|---|---|
| `role` (new invitation) | present (existing) **and** ∈ `ALLOWED_INVITE_ROLES` | `400 { error: "Invalid role" }` |
| `staff_invitations.role` (resend) | ∈ `ALLOWED_INVITE_ROLES` | `400 { error: "Invalid role" }` |

Compare the raw value. Do not trim, lowercase, or otherwise normalise before comparing — normalising creates variants (`"Owner"`, `" owner "`) that pass a check they should fail is the wrong direction, but more importantly the value is written verbatim into `user_roles.role`, so the string that is validated must be the identical string that is stored. Any normalisation would have to be applied before validation *and* carried through to the insert; simpler not to introduce it.

`generateSecurePassword()` takes no input and needs no validation.

---

# 10. Error Handling

- Invalid role returns 400 and writes nothing — no auth user, no `user_roles` row, no `staff_invitations` row, no email. This is guaranteed by ordering (AD-7), not by rollback.
- The error message is deliberately generic (`"Invalid role"`). Do not echo the rejected value back or enumerate the allowed set in the response; the endpoint is reachable with a tenant-scoped token and there is no reason to help a caller probe it. Log the rejected value server-side with `console.error` for diagnosis, consistent with the function's existing logging style.
- `crypto.getRandomValues` does not fail in Deno for buffers of this size. Do not add a `Math.random()` fallback — a silent fallback to the insecure path is the exact failure mode this item exists to remove. If it threw, the existing outer `try/catch` returning 500 is the correct outcome.
- No change to the resend path's existing best-effort handling of `updateUserById` failure (logged, not fatal).

---

# 11. Security Considerations

- **Predictability.** `Math.random()` in V8 is xorshift128+, seeded per-isolate and fully recoverable from a modest run of outputs. Edge function isolates are reused across invocations, so an attacker who can trigger invitations to an address they control can observe generated passwords and reconstruct the generator state, then predict the temp password issued to a *different* invitee — including, via `send-co-owner-invitation` and both backoffice functions, an owner. `crypto.getRandomValues` removes the state-recovery primitive entirely.
- **Blast radius of the fold-in.** Fixing only two of four copies would leave `backoffice-add-tenant-owner` — the path that installs a salon's owner — on the predictable generator. §3 covers why it is in scope.
- **Privilege escalation via `role`.** Until this change, any holder of a tenant-scoped token could `POST send-staff-invitation` with `role: "owner"` and receive a full owner row in `user_roles`, since the only guard was a React `<Select>`'s option list. AD-5 closes this at the server; AD-6 closes the resend replay of any row already poisoned this way.
- **Existing poisoned rows.** This design does not sweep `user_roles` for `owner` rows created through the staff-invitation path. There is no way to distinguish them from legitimate owner rows written by the co-owner and backoffice flows, since neither records provenance. Recorded as a deferral (§14) rather than guessed at.
- Temp passwords continue to be stored in plaintext in `staff_invitations.temp_password` — pre-existing, required by the resend path (`index.ts:202`), and out of scope here. Noted so it is not mistaken for something this change introduces or fixes.

---

# 12. Performance Considerations

Negligible and bounded. `generateSecurePassword()` is called at most once per invitation request, on a path that already performs several network round-trips. `crypto.getRandomValues` on a small buffer is sub-microsecond.

Rejection sampling terminates with probability 1 and, at these charset sizes, expects ~1.16 bytes per alphanumeric character and ~1.02 per special — roughly 12 bytes for a 10-character password. Draw the buffer in one call and refill only if exhausted; do not call `getRandomValues` per character in a loop.

No new queries, no new indexes, no N+1 risk. The whitelist check is an in-memory array membership test on a 4-element constant, deliberately not a database lookup (AD-5).

---

# 13. Compatibility

- **Backward compatible for every legitimate caller.** The password shape is byte-identical (AD-3), so emails, the acceptance flow, and any password-complexity expectation are unaffected. The whitelist is exactly the set `InviteStaffDialog.tsx` already offers, so no existing UI action begins to fail.
- **Deliberately breaking for one caller class:** anything invoking `send-staff-invitation` with a role outside the four. The brief confirms no such caller exists in the repo. That break is the feature.
- **Already-issued temp passwords remain valid.** Nothing is invalidated or rotated; existing `staff_invitations` rows keep their stored passwords and resend continues to reuse them. Passwords issued before this change retain their original weak entropy — accepted, since they are single-use and expire within 7 days.
- **Deployment.** These are four independent edge functions sharing a new `_shared` module. Supabase bundles `_shared` into each function at deploy time, so all four must be redeployed; deploying the shared file alone does nothing, and deploying one function does not update the others. There is no ordering constraint and no coordination with the frontend — deploy all four, in any order. Follow the repo's branch-promotion CI; no direct production deploy.
- No deprecation cycle needed: the local generators are deleted, not left in place, and nothing outside these four files references them.

---

# 14. Edge Cases

1. **Resend with a stored `temp_password` present.** Unchanged — the stored value is reused and the generator is never called. Preserve the `existingInvitation.temp_password || generateSecurePassword()` expression exactly; do not "simplify" it into an unconditional regeneration, which would silently invalidate a password the invitee may already be holding. (`co-owner-invite.design.md` AD-10 makes the opposite choice for the co-owner flow — that asymmetry is pre-existing and intentional; do not harmonise it here.)
2. **Resend of a row whose stored role is invalid.** 400 (AD-6). Cannot arise from the UI; can arise from a row written before this change.
3. **`role` present but empty string.** The existing `!role` presence check already catches it; it would also fail the whitelist. Both guards stay — do not collapse them into one, so the "missing field" and "bad value" errors stay distinguishable.
4. **`role: "owner"` submitted directly.** 400, before any write (AD-7). This is the case the item exists for.
5. **Case and whitespace variants (`"Owner"`, `" staff "`).** Rejected, by design (§9). They are not legitimate client input.
6. **Rejection-sampling loop.** Must be a `while`, not a bounded `for` with a fallback — a bounded loop needs a wrong answer when the bound is hit.
7. **Charset length changes later.** The thresholds `220` and `252` must be *derived* (`256 - (256 % charset.length)`), never hardcoded as literals, or a future charset edit silently reintroduces bias.
8. **Co-owner and backoffice flows.** Behaviourally identical after the swap — same shape, same call sites, only the RNG differs. They need no new tests of their own beyond the import-compiles check in §15.

---

# 15. Tests Required

## Unit — `supabase/functions/_shared/secure-password.test.ts` (new)

Follow the conventions in `_shared/tenant-auth.test.ts`: `Deno.test(...)` with `assertEquals` / `assert` from `https://deno.land/std@0.224.0/assert/mod.ts`.

1. **Shape** — length is exactly 10; first 8 characters are all in the alphanumeric charset; last 2 are all in `!@#$%&*`.
2. **Ambiguity-free** — over ~1000 generated passwords, no character from `IOl01` ever appears in the first 8.
3. **Uniqueness** — 1000 generations yield 1000 distinct values (a smoke test that would have caught a constant or a stuck buffer; not a randomness proof).
4. **Uses the crypto source** — stub `globalThis.crypto.getRandomValues` with a spy, assert it is called and that `Math.random` is not. The cleanest form is to temporarily replace `Math.random` with a function that throws, generate a password, and restore it in a `finally`. This is the regression test for the actual defect; without it, nothing stops a future edit sliding back to `Math.random()`.
5. **Distribution sanity** — with `getRandomValues` stubbed to emit a deterministic ascending byte sequence, assert that bytes at or above the rejection threshold are skipped rather than folded, so the character they would have biased toward is not over-selected. This is what pins AD-2; a plain statistical test over real randomness is flaky and would not.

## Unit — role whitelist

The validation logic lives inside `Deno.serve`'s handler in `send-staff-invitation/index.ts` and is not exported, so it is not directly unit-testable without restructuring the function. **Do not restructure it for testability** — extracting a handler from one of these edge functions is a larger refactor than the change it would serve, and would touch code this item has no business in. Cover the whitelist at the integration level instead (below), and keep the constant and its check adjacent and obvious.

## Integration — `send-staff-invitation` (manual against a local/staging stack)

6. `role: "owner"` → 400 `{ error: "Invalid role" }`, **and** verify no auth user, no `user_roles` row, and no `staff_invitations` row was created (this asserts AD-7's ordering, which is the substance of the fix).
7. `role: "bogus"` → 400, same assertions.
8. Each of `manager`, `supervisor`, `receptionist`, `staff` → succeeds end to end, invitation row written with the correct role, email sent.
9. Resend of a valid pending invitation → succeeds, temp password unchanged.
10. Resend of a row hand-edited to `role = 'owner'` → 400 (AD-6).

## Integration — the other three functions

11. `send-co-owner-invitation`, `backoffice-add-tenant-owner`, `backoffice-add-tenant-co-owner` each still issue a working temp password that the recipient can sign in with. A single happy path per function is sufficient — the only change is the import.

## Regression

12. `InviteStaffDialog.tsx` unchanged: inviting each of the four roles from the salon-admin UI still works.

---

# 16. Verification

Run from the worktree root (`salon-magik-hub-worktrees/second-owner-foundation`):

```bash
# New unit tests (deno is on PATH at /opt/homebrew/bin/deno)
deno test --allow-net supabase/functions/_shared/secure-password.test.ts

# Existing shared tests still pass
deno test --allow-net supabase/functions/_shared/

# Type-check every function touched, including the deleted-generator imports
deno check supabase/functions/send-staff-invitation/index.ts \
           supabase/functions/send-co-owner-invitation/index.ts \
           supabase/functions/backoffice-add-tenant-owner/index.ts \
           supabase/functions/backoffice-add-tenant-co-owner/index.ts

# No insecure generator survives anywhere — expect ONLY the OTP functions
# (request-phone-change-otp, send-signup-phone-otp, send-phone-otp,
#  send-client-phone-otp, request-email-change-otp) and the booking
#  reference in create-public-booking. Zero hits in any *invitation*,
#  *add-tenant-owner*, or *add-tenant-co-owner* function.
grep -rn "Math.random()" supabase/functions/

# Exactly one definition of the generator remains
grep -rn "function generateSecurePassword" supabase/functions/
# expect: _shared/secure-password.ts, provision-super-admin, create-backoffice-admin

# Monorepo checks (frontend is untouched; these should be unaffected)
npm run lint
npm run test
```

`deno check` may need `--allow-import` or a `--node-modules-dir` flag depending on the local Deno version's handling of the `npm:@supabase/supabase-js@2` specifiers these functions already use; if it does, that is a pre-existing environment detail, not a defect introduced here — adjust the flags, do not change the imports.

---

# 17. Implementation Order

Each step leaves the tree compiling.

1. **Create `supabase/functions/_shared/secure-password.ts`** — charsets, `randomIndex` with derived rejection thresholds, `generateSecurePassword()`. Nothing imports it yet.
2. **Create `supabase/functions/_shared/secure-password.test.ts`** — tests 1–5 from §15. Run `deno test` and get it green before any call site changes. This is the step that proves the replacement is correct in isolation.
3. **`send-staff-invitation/index.ts`** — delete the local generator (`:33-49`) and its `// Generate secure temporary password` comment; add the `_shared` import. Leave the two call sites (`:202`, `:272`) textually untouched. `deno check`.
4. **`send-co-owner-invitation/index.ts`** — delete the local generator (`:48-54`) **and the `// generateSecurePassword — kept local rather than shared to avoid coupling` comment at `:46`**, which AD-1 reverses; add the import. Call sites at `:297`, `:453` untouched. `deno check`.
5. **`backoffice-add-tenant-owner/index.ts`** — same deletion (`:16-23`) and import. Call site `:134` untouched. `deno check`.
6. **`backoffice-add-tenant-co-owner/index.ts`** — same deletion (`:22-29`) and import. Call site `:211` untouched. `deno check`.
7. **Verify the RNG half is complete** — run the two `grep` commands in §16. Steps 1–6 are the entire entropy fix and are independently reviewable; stop and confirm here before starting the whitelist.
8. **`send-staff-invitation/index.ts` — whitelist, part 1.** Add `ALLOWED_INVITE_ROLES` near the top alongside `corsHeaders`, and narrow `InvitationRequest.role` (`:27`) from `role?: string` to `role?: InviteRole` where `type InviteRole = typeof ALLOWED_INVITE_ROLES[number]`. `deno check` — the narrowing may surface assignment errors at `:332` and `:380`, which are exactly the places to confirm the value flows as expected.
9. **Whitelist, part 2 — new-invitation branch.** Immediately after the presence check at `~:240`, reject roles outside the set with 400 `{ error: "Invalid role" }`, logging the rejected value. Before the `assert_tenant_can_add_staff` RPC (AD-7).
10. **Whitelist, part 3 — resend branch.** After `recipientRole = existingInvitation.role` (`~:207`), apply the same check and 400 (AD-6).
11. **Run the full §16 verification suite.**
12. **Integration tests 6–12** against a local or staging stack.
13. **Update the backlog** — mark `temp-password-entropy` in `docs/backlog-open-followups.md` as done, and add a line noting the two backoffice functions were folded in (§3) so the closure record matches what shipped.

Deployment (all four functions, per §13) follows the repo's branch-promotion CI and is not part of the implementation step.

---

# 18. Open Questions

1. **Q: Should already-existing `owner` rows in `user_roles` be audited for ones created via the staff-invitation path? → A: No, not in this item (decided autonomously).** There is no provenance column distinguishing them from the legitimate owner rows written by `send-co-owner-invitation` and the two backoffice functions, so any sweep would be guesswork against live access-control data — the blast radius of a wrong deletion is an owner locked out of their salon. The escalation path is closed going forward by AD-5/AD-6; a retrospective audit is a separate, deliberately-scoped item. Recorded as a deferral.
2. **Q: Should `provision-super-admin` and `create-backoffice-admin` migrate onto the shared module? → A: Not in this item (decided autonomously; see AD-4).** Both already use `crypto.getRandomValues`, so neither is the defect; both use a different length and charset, so migration is a behaviour change, not a consolidation. Recorded as a deferral.
3. **Q: Should a CHECK constraint restrict the set of valid `user_roles.role` strings? → A: Not in this item (decided autonomously; see AD-8).** It cannot express this item's rule, since `owner` must remain a permitted value. A typo-guard constraint is independently worthwhile but needs its own survey of existing role values and a backfill plan. Recorded as a deferral.

No genuinely blocking engineering uncertainty remains.
