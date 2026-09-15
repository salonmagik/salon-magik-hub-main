# Original Request

> Resume payments-e2e-verification — the Paystack credential blocker is cleared. [...] Do these in order: 1. Fix `render-results.ts` so re-running it cannot destroy the existing hand-written Verdict section [...] 2. Close the six applicable matrix cells never attempted: CPT-FAIL, SPT-ABD-C, INV-ABD-C, SUB-ABD-C, CPT-REF, INV-REF [...] 3. Populate the before/after/external_references evidence fields AD-7 requires, or amend the design to record the simplification explicitly. 4. Run Tier A against the dev project and produce a fresh go/no-go verdict covering the payout path, subaccount-split-cleanup, and beta launch.

# Summary

`payments-e2e-verification` previously ran Tier B only (no Paystack credentials) and produced a NO-GO verdict, hand-written into `docs/test-plans/payments-e2e.results.md`. That file is regenerated wholesale by `render-results.ts`, which unconditionally overwrites the Verdict section with `_TODO_` placeholders — confirmed by reading the script. Six applicable matrix cells were never attempted. Evidence records are missing the `before`/`after`/`external_references` fields AD-7 specifies for all but 1 of 18 sampled `recordCell()` call sites. Credentials for a Tier A run against the dev project are now in place per the request.

# Current Behaviour

**render-results.ts** (`supabase/functions/_shared/payments-e2e/render-results.ts:98-105`) always appends a fixed Verdict block containing three literal `_TODO_` lines, then overwrites `docs/test-plans/payments-e2e.results.md` in full (`Deno.writeTextFile`, no append/merge). It has no logic to read the file's existing content first. The current `payments-e2e.results.md` (confirmed via `git status`/read) has a fully hand-written Verdict section (NO-GO on payout, YES on subaccount-split-cleanup, NO on beta) that a re-run of this script — which step 4 requires — would silently destroy, since the script is oblivious to what it's about to clobber.

**Evidence schema** (`evidence.ts`): `EvidenceRecord` declares `before`, `after`, `external_references` as optional (`?`) fields. `recordCell()` performs no validation requiring them. Design doc AD-7 (`docs/design/payments-e2e-verification.design.md:100-104`) states every cell's evidence record must include "the before/after snapshot of every row it asserted on, external references." Grepping the four `*.integration.test.ts` call-site groups shows 18 `recordCell({...})` calls checked in `checkout.integration.test.ts` alone, and only 1 across the sampled set includes a `before:`/`after:` field — the rest pass only `result` and `note`. This is a real, currently-live gap between the design's stated evidence contract and what the harness actually records, not a documentation lag.

**Matrix state** (`docs/test-plans/payments-e2e.cells.json`, `docs/test-plans/payments-e2e.results.md`): all six cells named in the request — `PAY-CPT-FAIL-{GHS,NGN}`, `PAY-SPT-ABD-C-{GHS,NGN}`, `PAY-INV-ABD-C-{GHS,NGN}`, `PAY-SUB-ABD-C-{GHS,NGN}`, `PAY-CPT-REF-{GHS,NGN}`, `PAY-INV-REF-{GHS,NGN}` — are `applicable: true` in the manifest and render as `NOT RUN — no evidence recorded` in the results doc. No suite currently exercises them (no matching `recordCell` call for those cell ids was found across the integration test files).

**Credential/env loading**: `supabase/functions/.env` (gitignored, confirmed present per request) is loaded by `supabase functions serve`, not by `deno test`. `guard.ts` (`assertSafeEnvironment()`, referenced at design AD-4/AD-8) fails closed if `PAYMENTS_E2E_ACK` and related env vars are absent, so any `deno test` invocation of the integration suites must `set -a; source supabase/functions/.env; set +a` (or equivalent) before running, or every cell will fail the guard rather than execute.

# Affected Surfaces

This is an internal test-harness/documentation change; it modifies no production contract, API, schema, or exported function. Per design AD-9, this run is not permitted to touch production code under `supabase/functions/` outside `_shared/payments-e2e/`. No consumers outside the harness itself and its generated docs are affected.

# Existing Implementation & Placement

**Existing implementation**: The full harness already exists and is functional — `guard.ts`, `env.ts`, `fixtures.ts`, `webhook-replay.ts`, `assertions.ts`, `evidence.ts`, `render-results.ts`, `matrix.ts`, `generate-manifest.ts`, and six `*.integration.test.ts` suites. This is an extension/completion pass on that existing harness, not new work — no separate implementation exists elsewhere to duplicate.

**Correct home**: `supabase/functions/_shared/payments-e2e/` is the established, design-decided home (AD-8: "`_shared/` is the established home for code spanning multiple edge functions... `*.integration.test.ts` is the established marker for 'drives a live stack, not run by CI'"). This is confirmed as the only home under discussion in the design doc; no shared/upstream package is implicated. Generated docs live under `docs/test-plans/`, per existing convention (`payments-e2e.results.md`, `.cells.json`, `.evidence.jsonl`).

# Execution Flow

```
deno test (with .env sourced)
    ↓
guard.ts assertSafeEnvironment()
    ↓
fixtures.ts seeds namespaced tenant/customer/etc. per cell
    ↓
cell exercises real handler (create-payment-session / webhook processor / process-salon-withdrawal / refund-via-paystack)
    ↓
assertions.ts snapshots before/after state
    ↓
evidence.ts recordCell() appends to payments-e2e.evidence.jsonl
    ↓
render-results.ts reads cells.json + evidence.jsonl → overwrites payments-e2e.results.md (including Verdict — currently destructive)
```

# Relevant Files

- `supabase/functions/_shared/payments-e2e/render-results.ts` — confirmed destructive overwrite of the Verdict section (lines 98-107).
- `supabase/functions/_shared/payments-e2e/evidence.ts` — evidence record schema; `before`/`after`/`external_references` are optional and largely unused in practice.
- `docs/test-plans/payments-e2e.results.md` — current hand-written verdict (NO-GO/YES/NO) that must survive the next render; full list of NOT RUN cells confirmed.
- `docs/test-plans/payments-e2e.cells.json` — manifest confirming the six named cells are `applicable: true` and currently unattempted.
- `docs/design/payments-e2e-verification.design.md` (AD-4, AD-6 through AD-10) — governs guard behaviour, fixture namespacing, evidence contract, and verdict structure/scope.
- `supabase/functions/_shared/payments-e2e/checkout.integration.test.ts` — sampled to confirm the evidence-field gap (18 `recordCell` calls, only 1 with `before`/`after`).
- `docs/backlog-open-followups.md` — confirms `subaccount-split-cleanup` is already marked UNBLOCKED off the prior (Tier B, NO-GO) verdict; a fresh verdict from this run supersedes it.

# Relevant Components

- Harness core: `guard.ts`, `env.ts`, `fixtures.ts`, `evidence.ts`, `render-results.ts`, `matrix.ts`.
- Scenario suites: `checkout.integration.test.ts` and siblings (`webhook-recording`, `duplicate-delivery`, `refund`, `payout`, `transport`, `smoke`).
- Generated docs: `payments-e2e.cells.json`, `payments-e2e.evidence.jsonl`, `payments-e2e.results.md`.

# Existing Constraints

- AD-9: no production code outside `_shared/payments-e2e/` may be modified by this run; any change under `supabase/functions/` elsewhere is a review failure regardless of merit.
- AD-8: harness stays out of CI; no `.github/workflows/ci.yml` changes.
- Guard (`assertSafeEnvironment`) must never allow the forbidden production project ref (`xbkjgqaagwzxpzpiehov`) to be targeted — `PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS` enforces this; migrations/tests must never point there.
- Migrations, if any were ever needed, must use `supabase db push`, never `db reset` ([[feedback-db-push-never-reset]] — not directly implicated here since this is a test-harness-only change, but stated as a standing constraint on this dev project).
- `docs/backlog-open-followups.md` notes `multi-salon-db-verification` targets the same dev project — per the request, do not run concurrently with that item.
- Evidence records must not carry raw Paystack request/response bodies, only references (per `evidence.ts` header comment / design section 11 security note).

# Existing Behaviour

- `render-results.ts` treats the evidence file as append-only-with-last-wins-per-cell-id (`readEvidence()` dedups by `cell_id`, most recent line wins) — re-running a cell's test and re-rendering is the designed way to update a result, so any fix to preserve the Verdict section must not break this re-run/re-render flow.
- The results doc's own docstring says "Generated by render-results.ts — do not hand-edit," which is now in tension with the fact that the Verdict section, by AD-10, must be hand-written. The script's TODO placeholder is the literal manifestation of that unresolved tension, not a one-off oversight.

# Unknowns

- `[engineering - unresolved: unverified]` Whether the intended fix is (a) render-results.ts parses out and re-inserts the existing Verdict section text on each run, (b) the Verdict is moved to a separate, never-auto-generated file that results.md links to, or (c) some other mechanism — the design doc does not specify a mechanism, only the requirement (AD-10) that a hand-written verdict exist and (implicitly, per the request) survive re-renders. This is a design decision, not a fact this brief can settle by further reading.
- `[product]` For step 3 (evidence fields), whether to retrofit all ~18+ existing `recordCell()` call sites with `before`/`after`/`external_references`, or to formally amend AD-7 to scope that requirement down (e.g. to only cells where the design doc's rationale — proving a pass "carries the state that justified it" — actually matters, such as DUP/REF/payout cells vs. simple OK cells) is an open design/scope call the request itself frames as an either/or ("...or amend the design to record the simplification explicitly").

Both unknowns bear on implementation approach, not on current-behaviour facts; recorded here per role scope and left for principal.
