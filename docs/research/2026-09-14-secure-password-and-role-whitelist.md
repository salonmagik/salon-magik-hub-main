# Original Request

> Replace the Math.random()-based generateSecurePassword with crypto.getRandomValues, across both the staff invitation flow (supabase/functions/send-staff-invitation) and the co-owner invite flow that deliberately reused it — they must move together so the two invitation paths do not silently diverge. This now guards owner-level credentials, not just staff. Also covers the related pre-existing gap that send-staff-invitation has no server-side role whitelist: only the salon-admin UI has ever prevented `role: "owner"` from being sent to it, so the accepted set of roles needs enforcing server-side. Investigate every call site / copy of the generator before anything is changed.

---

# Summary

Two independent copies of a `generateSecurePassword()` function exist, one in `supabase/functions/send-staff-invitation/index.ts` and one in `supabase/functions/send-co-owner-invitation/index.ts`, both using `Math.random()` and an identical charset/length scheme. `send-staff-invitation` also accepts an unvalidated `role: string` from the request body and writes it straight into `user_roles`; the only place `role: "owner"` is currently blocked is the `roleOptions` list in the salon-admin UI dialog. `send-co-owner-invitation` is unaffected by the whitelist gap because it hardcodes `role: "owner"` itself rather than taking role as input.

---

# Current Behaviour

## Password generator (two copies)

`supabase/functions/send-staff-invitation/index.ts:33-49`:
```ts
function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  let password = "";
  for (let i = 0; i < 8; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
  for (let i = 0; i < 2; i++) password += specials.charAt(Math.floor(Math.random() * specials.length));
  return password;
}
```
Called at line 202 (`existingInvitation.temp_password || generateSecurePassword()`, resend path) and line 272 (new invitation path).

`supabase/functions/send-co-owner-invitation/index.ts:46-53` is a byte-for-byte equivalent copy (same charset, same 8 alphanumeric + 2 special split), with a comment at line 46: `// generateSecurePassword — kept local rather than shared to avoid coupling`. Called at line 297 and line 453.

Both are Deno edge functions with no import of `crypto` currently; each function file is otherwise self-contained (no shared password/crypto utility exists yet — see Existing Implementation & Placement).

## Role handling in send-staff-invitation

`InvitationRequest.role` is `role?: string` (`send-staff-invitation/index.ts:27`) — no union/enum type. The value flows unchecked:
- line 176: destructured from the parsed request body
- line 240: only checked for presence (`!role`), not for an accepted value
- line 332: inserted directly into `user_roles.role` on user creation
- line 380: also becomes `recipientRole` used for the invitation record and email content (lines 355, 418, 480)

No allow-list, enum check, or rejection of `"owner"` (or any other value) exists anywhere in this function.

The only current restriction is client-side, in `apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx:35-39`:
```ts
const roleOptions = [
  { value: "manager", ... },
  { value: "supervisor", ... },
  { value: "receptionist", ... },
  { value: "staff", ... },
] as const;
```
This is a `<Select>` populated from a fixed list — it constrains what the UI *offers*, not what the function *accepts*. Any direct call to the function (e.g. from a different client, a compromised frontend, or a replayed/modified request) can pass `role: "owner"` and it will be honored, since nothing downstream checks it.

No database-level constraint restricts `user_roles.role` either — a repo-wide search of migrations for `CHECK` constraints on `user_roles` role values found none (all `CHECK ... has_backoffice_role` hits are for backoffice tables, unrelated).

`send-co-owner-invitation/index.ts:336` hardcodes `role: "owner"` itself when inserting into `user_roles` — it does not take role from client input, so it is not exposed to this whitelist gap.

---

# Affected Surfaces

- `supabase/functions/send-staff-invitation/index.ts` — both `generateSecurePassword` call sites (resend path line 202, new-invite path line 272) need the crypto-based generator; the function also needs the new server-side role whitelist enforced before line 332's insert.
- `supabase/functions/send-co-owner-invitation/index.ts` — both `generateSecurePassword` call sites (line 297, line 453) need to move to the same crypto-based generator so the two flows don't diverge. Its hardcoded `role: "owner"` needs no whitelist change.
- `apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx` — no change required; its `roleOptions` list already matches the intended accepted set (`manager`, `supervisor`, `receptionist`, `staff`) and can stay as the UI-level affordance layered on top of the new server-side check.
- No other call sites of `generateSecurePassword` exist (confirmed via repo-wide grep — only the two functions above define/call it).
- No other callers of `send-staff-invitation` or `send-co-owner-invitation` were found that pass `role` other than the UI dialog and the co-owner flow itself.

---

# Existing Implementation & Placement

**Existing implementation**: No shared/crypto-secure password generator exists yet. `supabase/functions/_shared/` is the established convention for cross-function utilities in this codebase (contains `arkesel-client.ts`, `tenant-auth.ts`, `email-template.ts`, `otp-ip-throttle.ts`, etc. — 18 files, several with matching `.test.ts` siblings, e.g. `tenant-auth.test.ts`). The co-owner function's own comment (`// generateSecurePassword — kept local rather than shared to avoid coupling`) shows this was a deliberate prior choice to duplicate rather than share, which the request now asks to revisit implicitly by requiring both to move together.

No server-side role whitelist/enum exists for `send-staff-invitation` in code or in the database schema.

**Correct home**: Given `_shared/` is the repo's existing pattern for logic reused across more than one Deno function, and this request explicitly requires both invitation functions to change in lockstep, a shared `_shared/` module (e.g. alongside the existing utilities) is the consistent home for the crypto-based password generator — consolidating the two duplicate copies rather than editing each in place. This is an observation of the existing pattern in the repository, not a design decision. The role whitelist only applies to `send-staff-invitation` (the co-owner path doesn't accept role as input), so it belongs solely in that function.

**Prior memory notes**: No `<slug>-notes.md` or equivalent memory note exists yet for this feature area in `docs/` — this is the first pass on this specific backlog item.

The repository's own backlog already tracks this exact item verbatim, confirming the request's framing: `docs/backlog-open-followups.md:103-110` (`## temp-password-entropy: generateSecurePassword uses Math.random()`, `status: in-progress`), which states the co-owner flow deliberately reused the insecure generator "to avoid silently diverging the staff and owner invitation flows" and explicitly bundles the role-whitelist gap into the same item.

---

# Execution Flow

```
Staff invite (send-staff-invitation)
  Request { firstName, lastName, email, phone, role, invitationId?, resend? }
    ↓
  role read from body, presence-checked only (no allow-list)
    ↓
  generateSecurePassword() [Math.random()]
    ↓
  auth user created with temp password
    ↓
  user_roles insert { user_id, tenant_id, role }  ← role unchecked here
    ↓
  invitation record + email sent

Co-owner invite (send-co-owner-invitation)
  Request (no role field — hardcoded)
    ↓
  generateSecurePassword() [Math.random(), separate copy]
    ↓
  auth user created with temp password
    ↓
  user_roles insert { ..., role: "owner" }  ← hardcoded, not client-controlled
```

---

# Relevant Files

- `supabase/functions/send-staff-invitation/index.ts` — defines/calls the insecure generator; accepts unvalidated `role` from request body and writes it to `user_roles`.
- `supabase/functions/send-co-owner-invitation/index.ts` — duplicate insecure generator; hardcodes `role: "owner"`, confirming it isn't exposed to the whitelist gap.
- `apps/salon-admin/src/components/dialogs/InviteStaffDialog.tsx` — source of the only existing (client-side) role restriction; confirms the intended accepted role set (`manager`, `supervisor`, `receptionist`, `staff`).
- `docs/backlog-open-followups.md` — pre-existing tracked backlog item matching this request, confirming scope and intent.
- `supabase/functions/_shared/` (directory listing) — confirms the established shared-utility convention for Deno functions.

---

# Relevant Components

- Edge Functions: `send-staff-invitation`, `send-co-owner-invitation`
- Frontend: `InviteStaffDialog.tsx` (role options UI, no change needed)
- Data: `user_roles` table (insert target for both flows; no DB-level role constraint exists)

---

# Existing Constraints

- No DB `CHECK` constraint on `user_roles.role` — enforcement of accepted staff roles is currently 100% client-side (UI dropdown) and about to become 0% enforced anywhere if the UI is bypassed.
- `send-co-owner-invitation` never accepts `role` as client input — it's structurally safe from the whitelist gap by design, so the whitelist fix is scoped only to `send-staff-invitation`.
- Both password generators must change together per explicit instruction, to avoid the two invitation paths silently diverging in security posture.

---

# Existing Behaviour

- Password shape (8 alphanumeric chars from a charset excluding ambiguous characters like `I`, `O`, `0`, `1`, plus 2 special chars from `!@#$%&*`) is identical between the two current implementations and should be preserved by any replacement, since email templates and any downstream password-strength expectations are built around this shape.
- The resend path in `send-staff-invitation` (line 202) reuses an already-stored `temp_password` if present, only generating a new one when none exists — this fallback behavior is unrelated to the RNG source and should be unaffected by the change.

---

# Unknowns

None — the investigation fully resolved both the RNG duplication surface and the role-whitelist gap using static reading of the two functions, the UI dialog, and the migrations; the backlog entry additionally corroborates the requested scope. No product or runtime-only questions remain open.
