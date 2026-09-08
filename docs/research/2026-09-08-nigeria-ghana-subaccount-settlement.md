Status: implemented

# Original Request

> Can you also investigate how I implemented paystack for helping the salons sell bookings, products and packages and also getting paid via auto-payout into their account and also manual withdrawal. I had asked paystack to turn on manual settlements for our Nigeria and Ghana accounts, but today I realised Nigeria still auto settles salons via subaccount while Ghana didn't which makes me wonder if we implemeneted subaccount properly for Ghana like we did Nigeria. Investigate, and fix what needs fixing.

---

# Summary

Ghana's subaccount implementation is **not** broken relative to Nigeria's — `create-payout-destination`, `retry-paystack-subaccount`, and `get-banks-and-momo-providers` are all currency/country-agnostic and treat NG and GH identically (same subaccount creation call, same `settlement_schedule` logic, same recipient-type branching by country). The actual root cause is a **stale-data bug that is country-blind but currently NG-skewed in effect**: `settlement_schedule` is only ever pushed to Paystack when a subaccount is *created*; nothing retroactively updates an existing Paystack subaccount when the tenant's payout mode changes later. `supabase/migrations/20260906160000_payout_mode_on_demand_only.sql` (2026-09-06) retired "automatic" payout mode platform-wide and flipped every tenant's `payout_mode` to `on_demand` in our own database — but it only touched the `tenants` table; it never called Paystack's subaccount update endpoint for the salons whose subaccounts were already created back when `settlement_schedule: "auto"` was sent. Those subaccounts are still sitting on Paystack with auto-settlement turned on and will keep auto-paying out forever, regardless of what our database now says. Because Nigeria is the older, larger market, more of its subaccounts predate the migration and are stuck on stale "auto"; Ghana, being newer, has more subaccounts created after the migration and already correctly on "manual" — which is exactly the asymmetry reported.

A second, related but currently-unused piece of code (`updatePaystackSubaccount` in `_shared/paystack-helpers.ts`) already exists to push exactly this kind of update to Paystack — it is fully implemented but is not called from anywhere in the codebase.

---

# Current Behaviour

**Subaccount creation** (`supabase/functions/create-payout-destination/index.ts`, `supabase/functions/retry-paystack-subaccount/index.ts`): both bank and mobile-money destinations, for both NG and GH, call `createPaystackSubaccount(currency, { ..., settlement_schedule: tenant.payout_mode === "on_demand" ? "manual" : "auto" })`. This logic is identical for both countries — no NG/GH branching exists in the settlement-schedule decision. `settlement_schedule` is also stored on `salon_payout_destinations.settlement_schedule` at creation time, but that column is a snapshot of what was sent to Paystack at creation — not a live mirror of what Paystack currently has configured.

**Payout mode**: `supabase/migrations/20260814000000_payout_mode_and_paystack_refund.sql` introduced `tenants.payout_mode` (`'automatic' | 'on_demand'`, default `'automatic'`). `supabase/migrations/20260906160000_payout_mode_on_demand_only.sql` (2026-09-06, per its own comment) retired `'automatic'` entirely: Paystack transfer OTP was disabled on the account, the UI toggle that could set `on_demand` was removed, and the column default was flipped to `'on_demand'`, with a one-time `UPDATE ... SET payout_mode = 'on_demand' WHERE payout_mode = 'automatic'`. That `UPDATE` only touches the `tenants` table — it does not call Paystack for any of the affected tenants' existing `salon_payout_destinations` rows to change their live `settlement_schedule`.

**Verification tracking** (`supabase/functions/backoffice-refresh-subaccount-verification/index.ts`, `20260813000001_subaccount_verification_tracking.sql`): a separate, already-correct reconciliation loop exists for subaccount *verification* status (`is_verified`) — it periodically pulls the true state from Paystack and syncs it into `salon_payout_destinations.paystack_subaccount_verified`. No equivalent pull-or-push loop exists for `settlement_schedule`.

**`updatePaystackSubaccount`** (`supabase/functions/_shared/paystack-helpers.ts:245`): a complete, working helper that does a Paystack `PUT /subaccount/:id` including a `settlement_schedule` field — grepping the whole repo (`grep -rln "updatePaystackSubaccount"`) shows it is defined but never imported/called anywhere. This is the exact tool needed to fix the stale-schedule problem, sitting unused.

**Booking payment splitting** (`create-public-booking/index.ts`, `create-payment-session/index.ts`): both attach `subaccount: storeSubaccountCode` to the Paystack transaction when a tenant has a default payout destination with a subaccount code, with no country-specific branching — confirms the split mechanism itself is currency-agnostic and working the same way for both markets.

**Manual withdrawal** (`supabase/functions/process-salon-withdrawal/index.ts`, not fully read — out of scope for this investigation since it's unaffected: withdrawal is a separate, already-manual code path independent of a subaccount's `settlement_schedule`).

---

# Affected Surfaces

- `salon_payout_destinations` rows for tenants whose subaccount was created before 2026-09-06 with `settlement_schedule = "auto"` — these subaccounts are still live-auto-settling on Paystack today, in both NG and GH, though the effect is more visible in NG because more legacy subaccounts exist there.
- No API contract or schema change is implied — this is a data-reconciliation gap, not a design flaw in the subaccount creation flow itself.

---

# Existing Implementation & Placement

The subaccount creation/retry logic is correctly implemented and does **not** need country-specific fixes. What's missing is a reconciliation mechanism, and the natural home for it mirrors the existing `backoffice-refresh-subaccount-verification` pattern exactly:

- A new edge function alongside the existing subaccount-management functions in `supabase/functions/` (sibling to `backoffice-refresh-subaccount-verification`, `retry-paystack-subaccount`), backoffice-role-gated the same way, that:
  1. Queries `salon_payout_destinations` where `paystack_subaccount_code is not null and settlement_schedule <> 'manual'` (bounded batch size, matching `MAX_CHECKS_PER_RUN = 40` precedent).
  2. Calls the existing-but-unused `updatePaystackSubaccount(currency, subaccountCode, { settlement_schedule: "manual" })` for each.
  3. Updates the local `settlement_schedule` column to `"manual"` on success, mirroring how `paystack_subaccount_verified` is synced back.
- A trigger button in `apps/backoffice/src/pages/VerificationQueuePage.tsx` (or a new small backoffice page) following the exact `refresh.mutate()` / `supabase.functions.invoke(...)` pattern already used there for `backoffice-refresh-subaccount-verification`.
- Register the new function in `supabase/config.toml` following the pattern of nearby `[functions.*]` entries (though note most subaccount-related functions, e.g. `backoffice-refresh-subaccount-verification` and `retry-paystack-subaccount`, currently have **no** entry in `config.toml` at all and rely on default JWT-verify config — confirm whether an entry is actually required before adding one).

This is a single-codebase project; there is no shared/upstream billing package boundary to route this through — it belongs directly in `supabase/functions/` + the backoffice app, same as every other subaccount management flow.

---

# Execution Flow

```
Today (broken):
  tenant.payout_mode flips to 'on_demand' (migration, DB-only)
      ↓
  salon_payout_destinations.settlement_schedule column: stale, unread
  Paystack subaccount object: still "auto" (never told otherwise)
      ↓
  Booking payment splits to subaccount → Paystack auto-settles to salon's bank/momo
      (bypasses the manual on_demand withdrawal flow the rest of the platform assumes)

After fix:
  Backoffice runs "Sync Settlement Schedules" (new function, mirrors
  backoffice-refresh-subaccount-verification's existing UI pattern)
      ↓
  For every salon_payout_destinations row with settlement_schedule <> 'manual':
      updatePaystackSubaccount(currency, subaccount_code, { settlement_schedule: "manual" })
      ↓
  On success: local settlement_schedule column set to 'manual', matching Paystack's true state
```

---

# Relevant Files

- `supabase/functions/create-payout-destination/index.ts` — subaccount creation; correct, no country-specific gap
- `supabase/functions/retry-paystack-subaccount/index.ts` — subaccount retry; correct, same pattern
- `supabase/functions/_shared/paystack-helpers.ts` — `createPaystackSubaccount`, and the unused `updatePaystackSubaccount` (line 245) that is the fix's core tool
- `supabase/migrations/20260906160000_payout_mode_on_demand_only.sql` — the migration that changed `payout_mode` DB-side without a corresponding Paystack-side push; root cause
- `supabase/migrations/20260814000000_payout_mode_and_paystack_refund.sql` — introduces `payout_mode` column/constraint
- `supabase/functions/backoffice-refresh-subaccount-verification/index.ts` + `20260813000001_subaccount_verification_tracking.sql` — the analogous, already-correct reconciliation pattern to mirror for settlement schedule
- `apps/backoffice/src/pages/VerificationQueuePage.tsx` — existing backoffice UI pattern to mirror for a new "sync settlement schedule" action
- `supabase/functions/create-public-booking/index.ts`, `supabase/functions/create-payment-session/index.ts` — confirm subaccount attachment to booking payments is currency-agnostic (not part of the bug)
- `supabase/functions/get-banks-and-momo-providers/index.ts` — confirms bank/momo lookup already branches correctly by country (not part of the bug)

---

# Relevant Components

- Edge Functions: `create-payout-destination`, `retry-paystack-subaccount`, `backoffice-refresh-subaccount-verification` (pattern to mirror), new `sync-subaccount-settlement-schedule` (proposed name)
- Shared helper: `_shared/paystack-helpers.ts` (`updatePaystackSubaccount`, currently unused — call site is the fix)
- Table: `salon_payout_destinations` (`settlement_schedule`, `paystack_subaccount_code`, `currency`)
- Backoffice UI: `VerificationQueuePage.tsx` (pattern), `backoffice_users` role gate

---

# Existing Constraints

- Any fix must be backoffice-role-gated (`backoffice_users` lookup) — this touches every tenant's live Paystack settlement configuration and must not be reachable by a salon-side or unauthenticated caller.
- Must batch/bound per-run (existing `MAX_CHECKS_PER_RUN = 40` precedent in `backoffice-refresh-subaccount-verification`) so a large backlog doesn't turn one invocation into hundreds of live Paystack API calls.
- Must use `getPaystackKeyForCurrency` per-destination (as `updatePaystackSubaccount` already does) since NG and GH use separate Paystack secret keys — do not assume a single key.
- Per [[feedback-no-direct-prod-deploy]], any new edge function/migration must go through the standard branch-promotion CI (development-only → main → release); this repository session cannot deploy directly or invoke the fix against the live Paystack account.

---

# Existing Behaviour

- `settlement_schedule` on `salon_payout_destinations` is a write-once snapshot, not a live mirror — any future logic that reads it as "current Paystack state" must account for this until the sync exists (and ideally the sync should run periodically, not just once, given `payout_mode` could in principle change again).
- The `'automatic'` payout_mode value is still permitted by the `tenants.payout_mode` check constraint even though the UI to set it was removed — the ternaries in `create-payout-destination`/`retry-paystack-subaccount` (`payout_mode === "on_demand" ? "manual" : "auto"`) still technically produce `"auto"` if a row somehow retains `'automatic'`, so the constraint could be tightened as a follow-up, though that's a separate, lower-priority cleanup from the settlement-schedule sync itself.

---

# Unknowns

- `[engineering]` Whether `updatePaystackSubaccount` was left uncalled deliberately (e.g., pending this exact reconciliation feature) or was simply forgotten after being written — doesn't change the fix, but worth confirming there isn't a reason it was avoided.
- `[engineering]` Exact count/proportion of NG vs. GH destinations currently stuck on stale `settlement_schedule` values was not queried (no live DB/Paystack access from this environment) — the implementer should run the `neq("settlement_schedule", "manual")` query first to size the backlog before assuming `MAX_UPDATES_PER_RUN = 40` per invocation is sufficient, and may need to trigger the sync multiple times or raise the batch size for a one-time backfill.

---

Routing: **implementer** — root cause and fix location are both concretely identified (add a `sync-subaccount-settlement-schedule` edge function calling the existing, unused `updatePaystackSubaccount` helper, gated and batched like `backoffice-refresh-subaccount-verification`, plus a matching backoffice UI trigger). No further product/scope questions block starting implementation.
