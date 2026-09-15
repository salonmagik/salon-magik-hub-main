# Payments E2E Verification — Resume Pass: Implementation Design

# References

- Technical Brief: `docs/research/2026-09-15-payments-e2e-verification-resume.md`
- Governing design (amended by this document): `docs/design/payments-e2e-verification.design.md` (AD-4, AD-7 through AD-10)
- Prior reviewer report: `.claudespace/s/0739740e-5540-4c70-a82e-ba8a55417027/reports/payments-e2e-verification-review.md`
- Backlog item: `docs/backlog-open-followups.md` → `payments-e2e-verification`
- Test plan: `docs/test-plans/payments-e2e.test-plan.md`

No Planning Brief exists for this pass; the backlog item's four ordered steps are the product intent.

This document covers *how*. What the harness does today, which cells are unrun, and why the prior
verdict was NO-GO all live in the brief and the results doc — they are not restated here.

---

# Scope

The four ordered steps from the backlog item, plus three adjacent defects folded in (see below).

**Adjacent defects folded into this pass** (each is a defect in code this design already touches,
not already a backlog item — per the fold-in test):

1. **`PAY-BOOK-REF-{GHS,NGN}` is a phantom manifest cell that can never be recorded.**
   `generate-manifest.ts:32-44` emits a parent `PAY-<intent>-REF-<currency>` row for every intent
   with an applicable REF scenario, while `generate-manifest.ts:72-83` separately emits the
   `REF-a/b/c` sub-cells that the suites actually record against. Design §14.3 decomposes REF into
   three sub-assertions "each recorded separately" — so the parent row has no possible evidence
   record and renders `NOT RUN` forever. It is not a missed test; it is a manifest bug that inflates
   the unrun count and would make this pass's fresh verdict wrong in the same way the last one was.
   Fixing it is a precondition for CPT-REF/INV-REF anyway, since those need the same decomposition.

2. **`PAY-CPT-ABD-C-{GHS,NGN}` is applicable and unattempted, and was not named in the request.**
   It renders `NOT RUN` alongside the six named cells, needs no Paystack call, and uses the identical
   seed-and-deliver pattern as the four ABD-C cells in step 2. Leaving it out would mean this pass
   closes "the six" and still hands back a results doc with unexplained NOT RUN rows.

3. **`render-results.ts` silently discards evidence records with no matching manifest cell.**
   It iterates the manifest and looks up evidence by `cell_id`; an evidence record whose `cell_id`
   is not in the manifest is never read. The `CHECKOUT-*` records written by
   `checkout.integration.test.ts` are invisible in the results doc today for exactly this reason,
   and a future `cell_id` typo would make a cell's evidence vanish with no signal at all — the
   precise failure mode AD-7 exists to prevent.

Everything else stays out. AD-9 continues to bind: **no file under `supabase/functions/` outside
`_shared/payments-e2e/` may be modified**, and no migration is written. If a cell proves a defect,
it is recorded as evidence and raised as a backlog item — never repaired in this pass.

---

# Architecture Decisions

## AD-R1 — The verdict moves to its own hand-written file; `render-results.ts` inlines it

**Decision.** Create `docs/test-plans/payments-e2e.verdict.md` as a hand-written document that no
script ever writes. `render-results.ts` reads it and inlines its body verbatim under the `## Verdict`
heading of the generated `payments-e2e.results.md`. If the verdict file is absent, the script emits
the existing `_TODO_` placeholder block plus a pointer to where the verdict belongs, and warns on
stderr — it still exits 0, because absence is the correct state before a verdict has been authored.

The current hand-written verdict text in `payments-e2e.results.md` is moved into the new file
**before any re-render is attempted**.

**Reasoning.** This removes the destructive-overwrite bug as a *class* rather than mitigating an
instance of it. The generated file becomes fully generated and the hand-written file becomes fully
hand-written, which also dissolves the standing contradiction the brief names: `results.md` says
"do not hand-edit" while AD-10 requires a hand-written verdict inside it. Inlining (rather than
merely linking) keeps `results.md` a single readable artifact, and is safe precisely because the
source of truth now lives elsewhere — regenerating can no longer lose anything.

**Rejected.** *Parsing the existing `## Verdict` section out of `results.md` and re-inserting it.*
Round-tripping hand-written prose through a generator is where subtle, silent data loss lives:
marker drift, an author editing outside the markers, a partial write on a crash. It also preserves
the do-not-hand-edit contradiction instead of resolving it, and it makes the generator's correctness
depend on markdown parsing for no gain.

**Rejected.** *A pure link from `results.md` to the verdict file.* Cheapest, but it splits the
artifact a reader is asked to trust into two files. Inlining costs one `readTextFile`.

**Rejected.** *A refuse-to-overwrite guard in `render-results.ts` (abort if the existing Verdict
section is non-placeholder).* Treats the symptom, leaves the verdict living inside a generated file,
and turns the documented re-run command into something that fails until a human intervenes.

## AD-R2 — `before`/`after` become a runtime-enforced requirement for `pass`/`fail` records; AD-7 is amended only to exempt `n/a`/`not-run`

**Decision.** Amend AD-7 as follows and enforce it in `evidence.ts`:

- For a record with `result: "pass" | "fail"`, `before` and `after` are **required**. `recordCell()`
  throws if either is missing or `undefined`.
- For `result: "n/a" | "not-run"`, both are **optional and expected to be absent** — there is no
  state pair to snapshot for a cell that did not execute or does not apply.
- `external_references` is **required whenever the cell made a real Paystack call** (any Tier A
  cell, `REF-a`, and the payout transfer cells), and optional otherwise. It carries references only
  — never authorization codes, card data, or keys (design §11, unchanged).

Retrofit every existing `recordCell()` call site accordingly.

**Reasoning.** AD-7's rationale — "a pass carries the state that justified it" — is load-bearing for
the verdict, which is this run's only product. Weakening it to "required where it matters" would mean
the verdict rests on notes rather than data, which is exactly what the PRD forbids. The retrofit is
cheap because it is not new work: the suites *already compute* the snapshots (`snapshotWallet`,
`snapshotAppointment`, `countTransactions`, `getPaymentIntent`) and simply don't pass them to
`recordCell`. The only genuine simplification is the `n/a`/`not-run` exemption, which is recorded
here explicitly rather than left implicit.

Enforcing in `recordCell()` rather than only in the type system is deliberate: these suites run with
`--no-check` (see every suite header), so a type-level requirement alone would not fire.

**Rejected.** *Amend AD-7 down to scope the requirement to DUP/REF/payout cells only.* The request
offers this as a valid alternative, and it is cheaper. It is rejected because the cost it saves is
small (the data is already in scope at every call site) while what it gives up is the property that
makes the results doc auditable by a second person — and this pass exists because the last verdict
was not trusted.

**Rejected.** *Type-level-only requirement via a discriminated union on `result`.* Correct and free
at authoring time, but invisible under `--no-check`. Keep the union as documentation, add the runtime
throw as the actual enforcement.

## AD-R3 — REF decomposition is generalised across intents; the parent REF cell is removed

**Decision.** In `matrix.ts`, add `REF_APPLICABLE_INTENTS` derived from the existing applicability
table (intents where `REF` is applicable: `BOOK`, `CPT`, `INV`). In `generate-manifest.ts`:

- Skip the `REF` scenario in the base intent×scenario loop — it never produces a recordable cell.
- Emit `PAY-<intent>-<sub>-<currency>` for each applicable intent × `REF-a|REF-b|REF-c` × currency.

Net manifest change: the 6 parent `PAY-{BOOK,CPT,INV}-REF-*` rows are removed; 12 new
`PAY-{CPT,INV}-REF-{a,b,c}-*` rows are added alongside the 6 existing BOOK ones.

**Reasoning.** Design §14.3 already decided REF is three separately-recorded sub-assertions. The
manifest generator applied that decision to BOOK only, by hardcoding the intent, and left the parent
rows in place — so the manifest asserted coverage obligations that no suite could ever discharge.
Generalising it is the same decision applied consistently, not a new one.

**Rejected.** *Keep the parent row and mark it `n/a` with "decomposed into REF-a/b/c" as the reason.*
Preserves the row count but makes the manifest carry a row that exists only to explain its own
existence, and an `n/a` here would read as "not applicable", which is false — REF *is* applicable.

## AD-R4 — Tier A is scoped to server-to-server Paystack calls; browser card completion stays out and is recorded honestly

**Decision.** The Tier A pass exercises what can be driven from the harness without a human at a
browser: `initializeTransaction`, `fetchTransactionByReference`, `createRefund`, `fetchTransfer`,
`fetchBalance` (all already implemented in `paystack-test-client.ts` and currently uncalled).

Cells whose definition requires a *customer completing a card payment on Paystack's hosted page* —
and therefore a real `charge.success` delivered by Paystack to a deployed webhook — are gated behind
a single precondition check, `assertTierAWebhookReachable()`. When the precondition does not hold,
those cells are recorded `result: "not-run"` with the specific unmet reason. **They are never
recorded `pass`, and never silently skipped.**

The precondition is: `PAYMENTS_E2E_TIER=A`, a live key for the cell's currency, `SUPABASE_URL`
pointing at the dev project, and `PAYMENTS_E2E_TIER_A_WEBHOOK_URL` set to the deployed webhook
endpoint that the Paystack test account is configured to call.

**Reasoning.** "Run Tier A" is not a single switch: some of it is a server-to-server API call the
harness can make right now, and some of it needs a deployed function plus Paystack dashboard
configuration plus a human completing a test card. Conflating the two is how a pass gets claimed for
something that never executed. Splitting them means this pass banks the real Tier A evidence it can
get, and the verdict states precisely what remains unproven — which is the same honest-failure
posture the harness already takes for missing credentials.

**Rejected.** *Block the whole Tier A step until the webhook endpoint is confirmed deployed and
configured.* Would stall the run on an operational fact outside the harness, and would discard the
Paystack-side evidence (refunds, transfers, transaction fetches) that is available regardless.

**Rejected.** *Automate the hosted-checkout card completion.* Driving Paystack's hosted page is a
browser-automation commitment with its own dependency and flake surface, far outside this run's
scope, and Paystack does not support it as a contract.

## AD-R5 — Orphaned evidence is surfaced in the results document

**Decision.** `render-results.ts` gains an `## Orphaned evidence` section listing any evidence record
whose `cell_id` has no matching manifest cell, with its result and note. The section is omitted when
empty. The rendered totals line stays manifest-scoped; orphans are counted separately.

**Reasoning.** Silently dropping a recorded result is the same failure AD-7 was written to prevent,
approached from the other side. It is currently live (the `CHECKOUT-*` records), and one typo in a
`cell_id` is enough to make a real cell's evidence disappear from the only document anyone reads.
Surfacing rather than failing keeps genuinely out-of-matrix records (the checkout guard cells) useful
instead of forcing them into the matrix where they don't belong.

## AD-R6 — The existing design document is amended by pointer, not rewritten

**Decision.** `docs/design/payments-e2e-verification.design.md` is not rewritten. A short
**Amendments** block is appended to it, and one-line pointers are added next to AD-7 and AD-10
naming this document and the AD-R decision that supersedes them.

**Reasoning.** That document is the attested record of what the original run decided and why. Editing
its decisions in place would destroy the audit trail that makes the verdict reviewable — the same
property AD-R1 protects for the verdict itself.

---

# Components

All under `supabase/functions/_shared/payments-e2e/` unless stated.

| Component | Change |
|---|---|
| `evidence.ts` | Runtime enforcement of `before`/`after` for `pass`/`fail`; `external_references` required for Paystack-calling cells; type union tightened (AD-R2) |
| `render-results.ts` | Inline verdict from `payments-e2e.verdict.md` (AD-R1); orphaned-evidence section (AD-R5) |
| `matrix.ts` | `REF_APPLICABLE_INTENTS`; `TIER_A_*` cell metadata (AD-R3, AD-R4) |
| `generate-manifest.ts` | REF decomposition generalised; parent REF rows dropped (AD-R3) |
| `env.ts` | Read `PAYMENTS_E2E_TIER_A_WEBHOOK_URL` into `PaymentsE2EEnv` (AD-R4) |
| `tier-a.ts` *(new)* | `assertTierAWebhookReachable()`, `tierAPrecondition()` — the single gate for Tier-A-only cells (AD-R4) |
| `webhook-recording.integration.test.ts` | New cells: `CPT-FAIL`, `CPT-ABD-C`, `SPT-ABD-C`, `INV-ABD-C`, `SUB-ABD-C`; `before`/`after` retrofit of the local `record()` helper |
| `refund.integration.test.ts` | Generalise REF-a/b/c over `BOOK`/`CPT`/`INV`; `before`/`after` retrofit |
| `checkout.integration.test.ts`, `duplicate-delivery.integration.test.ts`, `payout.integration.test.ts`, `transport.integration.test.ts`, `smoke.integration.test.ts` | `before`/`after`/`external_references` retrofit only |
| `fixtures.ts` | `seedTransaction()` helper if CPT/INV REF cells need a refundable transaction the webhook path cannot produce (see Data Flow) |
| `docs/test-plans/payments-e2e.verdict.md` *(new)* | Hand-written verdict, source of truth (AD-R1) |
| `docs/test-plans/payments-e2e.cells.json` | Regenerated |
| `docs/test-plans/payments-e2e.results.md` | Regenerated |
| `docs/design/payments-e2e-verification.design.md` | Amendments block + AD-7/AD-10 pointers (AD-R6) |
| `docs/backlog-open-followups.md` | Item status updated; any new defect filed |

No production code. No migration. No CI change.

---

# Data Flow

## Render path (after AD-R1 / AD-R5)

```
payments-e2e.cells.json ─┐
payments-e2e.evidence.jsonl ─┼─> render-results.ts ─> payments-e2e.results.md
payments-e2e.verdict.md ─┘        (verdict inlined verbatim; orphans listed)
```

`payments-e2e.verdict.md` is read-only to the script. `readEvidence()`'s last-record-per-`cell_id`
semantics are unchanged, so the re-run-a-cell-then-re-render flow still works exactly as before.

## New ABD-C / FAIL cells (Tier B, no Paystack call)

Identical to the proven BOOK pattern:

```
seedTenant(currency) → seedCustomer → seed intent-specific subject
  → seedPaymentIntent(intentType, reference)
  → buildChargeSuccessEvent | buildChargeFailedEvent
  → deliverToProcessor  (direct call, never over HTTP — AD-2)
  → snapshot the same rows before/after
  → recordCell({ before, after, ... })
  → cleanup(cellTag)
```

Per-intent subject and assertions:

- **`CPT-FAIL`** — subject: customer purse. Intent type `customer_purse_topup`, `charge.failed`
  delivered. Assert: no purse credit, no `transactions` row, `payment_intents.status = failed`.
- **`CPT-ABD-C`** — as `CPT-OK` (design §14.3: ABD-C's expected outcome is identical to OK), noting
  in the record that the browser-return path is never invoked by this harness.
- **`SPT-ABD-C`** — subject: salon purse topup. Assert wallet credited exactly once, ledger
  idempotency key present, one `transactions` row.
- **`INV-ABD-C`** — subject: seeded invoice. Assert invoice marked paid, one `transactions` row,
  wallet credited net of the platform charge.
- **`SUB-ABD-C`** — subject: subscription. Assert subscription activated, one `transactions` row.

Each mirrors its existing `*-OK` cell's assertion set; where an `*-OK` cell exists, the ABD-C cell
reuses that cell's outcome function rather than duplicating assertions (the `bookOkOutcome` pattern).

## REF cells for CPT / INV (AD-R3)

`REF-a` and `REF-c` require a live Paystack call and are Tier A. `REF-b` is the RPC-only
wallet-reconciliation check and runs at Tier B, exactly as `PAY-BOOK-REF-b` does today:

```
seed tenant/customer/owner → seed subject → deliver charge.success (creates the real transaction)
  → snapshotWallet (before)
  → owner.client.rpc("complete_transaction_refund", ...)   [gates on auth.uid(); must be the owner]
  → snapshotWallet (after)
  → pass iff balance decreased
```

`complete_transaction_refund` resolves the wallet from the transaction's tenant, so CPT/INV behave
the same as BOOK here. **If the webhook path does not produce a `type: 'payment'` transaction row for
a given intent** — plausible for `CPT`, whose credit may land on the customer purse rather than as a
refundable salon transaction — the cell is recorded `n/a` with that as the stated finding, not
forced through with a synthetic row. Deciding which applies is a *read* the implementer performs
against the processor's branch for that intent; do not seed around it.

## Tier A cells (AD-R4)

```
tierAPrecondition(currency)
  ├─ unmet  → recordCell({ result: "not-run", note: <specific unmet reason> })
  └─ met    → initializeTransaction / createRefund / fetchTransfer / fetchBalance
              → assert product-side state
              → recordCell({ result, before, after, external_references: { paystack_reference } })
```

---

# API Changes

None. No endpoint, request shape, response shape, or event payload changes (AD-9).

---

# Database Changes

None. No schema, migration, index, or backfill. The harness writes only namespaced fixture rows
(`e2e-<cell-id>-<timestamp>`, AD-6) and deletes them in each cell's `finally`.

---

# Validation

- `recordCell()` throws when a `pass`/`fail` record omits `before` or `after` (AD-R2), and when a
  Paystack-calling cell omits `external_references`. The throw names the `cell_id`.
- `generate-manifest.ts` asserts every emitted `cell_id` is unique and that no `cell_id` contains a
  bare `-REF-` segment (the phantom-cell regression guard, AD-R3).
- `assertSafeEnvironment()` is unchanged and still runs at `env.ts` module load. Every new module
  reaches it transitively; `tier-a.ts` must import `env.ts`, never read `Deno.env` directly.
- `tierAPrecondition()` validates that `SUPABASE_URL`'s project ref is the dev ref and not in
  `PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS` before returning "met".

---

# Error Handling

- A cell that cannot execute records `not-run` with the specific reason and does **not** throw. A
  cell that executes and fails its assertions records `fail` and then throws (the existing
  `record()` → `assertEquals` pattern), so `deno test` exit status still reflects real failures.
- Missing `payments-e2e.verdict.md`: warn on stderr, emit the placeholder block, exit 0.
- Unreadable/empty `payments-e2e.verdict.md`: treat as missing, but warn distinctly — an empty
  verdict file is more likely a truncated write than an intentional state.
- Malformed line in `payments-e2e.evidence.jsonl`: `readEvidence()` currently lets `JSON.parse`
  throw, killing the render. Keep that — a corrupt evidence file must not render a partial results
  doc that looks complete — but wrap it to report the offending line number.
- Paystack call failures at Tier A are recorded as `fail` with the HTTP status and Paystack's
  `message` field only. Never log the request/response body (design §11).

---

# Security Considerations

- `supabase/functions/.env` holds live `sk_test_` keys. It stays gitignored at mode 600; nothing in
  this pass copies its values into any committed file, evidence record, note, or results doc.
- `external_references` carries references only — Paystack transaction reference, transfer code,
  withdrawal id. Never authorization codes, card data, customer PII beyond the seeded fixture
  values, or any key material. `recordCell()`'s new validation must not weaken this: it requires the
  field's *presence*, never inspects or logs its contents.
- The prod project ref `xbkjgqaagwzxpzpiehov` must appear in `PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS`
  for every invocation. Tier A points at real Paystack test-mode infrastructure, so the guard's
  fail-closed behaviour is the only thing standing between a misconfigured `SUPABASE_URL` and
  writing fixture rows into production.
- The seeded owner's credentials (`seedOwner`) exist only for the cell's lifetime and are removed by
  `cleanup`. Tier A does not change that.

---

# Performance Considerations

Not a production path; runtime matters only as operator friction. Two things that do:

- **Cleanup is per-cell and tag-scoped.** `cleanup(admin, cellTag)` deletes by the namespaced tag —
  by that key, never by scanning a table and filtering in the harness. New cells follow this exactly.
- **Tier A polling.** `pollUntil` already exists; use it with a bounded attempt count and an explicit
  timeout that records `not-run` (reason: timeout) rather than hanging. Never poll unbounded.
- Assertions fetch by primary key or by `(tenant_id, <subject_id>)` — both indexed. No new query
  shape is introduced; the `count*` helpers in `assertions.ts` already filter server-side.

Cell count grows by 5 pairs (new Tier B cells) + 12 REF sub-cells − 6 removed phantoms. The suites
remain out of CI (AD-8), so this cost is paid only on a deliberate operator run.

---

# Compatibility

- **Evidence file.** Existing `payments-e2e.evidence.jsonl` lines lack `before`/`after`. The new
  validation runs in `recordCell()` (write path) only — `readEvidence()` stays permissive, so the
  historical file still renders. No migration of the evidence file.
- **Manifest.** Removing the parent `PAY-*-REF-*` rows orphans no evidence (none was ever recorded
  against them). Any stray record would now surface under `## Orphaned evidence` (AD-R5) rather than
  vanishing.
- **Verdict.** The move to `payments-e2e.verdict.md` is one-way and must happen before the first
  re-render. Verified by the step-1 gate in Implementation Order.
- **Documented re-run command** (`docs/test-plans/payments-e2e.test-plan.md` Verification section)
  is unchanged and becomes safe to run repeatedly — which was the point.
- Nothing outside the harness consumes these files. No deprecation window needed.

---

# Edge Cases

1. **Re-running `render-results.ts` twice with no intervening test run** — must be idempotent apart
   from the `Rendered <timestamp>` line. Verify explicitly; it is the exact scenario that caused the
   original bug.
2. **Verdict file contains a `## Verdict` heading of its own** — inline the body only, or accept a
   nested heading. Pick one and state it in the file's header comment; do not let heading levels
   drift between renders.
3. **A cell recorded `pass` on one run and `fail` on a later re-run** — last record wins
   (`readEvidence`). Unchanged, but the new required `before`/`after` must come from *that* run, not
   be carried over.
4. **`CPT` has no refundable `type: 'payment'` transaction** — record `n/a` with the finding stated
   (see Data Flow). Do not synthesise a transaction row to make the cell pass.
5. **Only one currency's Paystack key is present** — per-currency gating already exists via
   `requirePaystackKey`; the GHS cell must be able to run while NGN records `not-run`, and vice versa.
6. **Tier A run interrupted mid-cell** — fixtures leak. `cleanup` is in `finally`, but a killed
   process skips it. Fixtures are tag-namespaced and on dev, so this is acceptable; note it in the
   implementer report rather than building a sweeper.
7. **`SUB-ABD-C` on a tenant with an existing active subscription** — seed a tenant with no
   subscription, per AD-6's per-cell-namespaced rule. Do not reuse.
8. **Concurrent run with `multi-salon-db-verification`** — both target the same dev project. Do not
   run them concurrently (backlog sequencing note). This is an operator constraint, not code.
9. **Evidence file absent entirely** — `readEvidence()` returns `[]`; every applicable cell renders
   `NOT RUN` and the verdict inlines whatever the verdict file says. Correct, and worth confirming
   the totals line doesn't divide by zero.
10. **Paystack returns a `pending` refund** (C-2) — record it as the finding it is; do not poll until
    `processed` and report a pass.

---

# Tests Required

The harness is itself the test artifact; there is no production code under test (AD-9).

**Unit (run by `deno test`, no live stack, must stay fast and hermetic):**
- `evidence.test.ts` *(new)* — `recordCell()` throws for a `pass` record missing `before`; throws for
  `fail` missing `after`; accepts `n/a` and `not-run` without them; throws when a Paystack-calling
  cell omits `external_references`; `readEvidence()` still parses legacy lines lacking those fields.
- `render-results.test.ts` *(new)* — verdict inlined verbatim when the file exists; placeholder plus
  stderr warning when absent; **rendering twice produces byte-identical output apart from the
  timestamp line**; orphaned evidence surfaces; empty evidence file renders without error.
- `generate-manifest.test.ts` *(new)* — no emitted `cell_id` matches the phantom `-REF-` pattern;
  `REF-a/b/c` emitted for exactly `BOOK`/`CPT`/`INV`; `cell_id`s unique.
- `guard.test.ts`, `webhook-replay.test.ts` — existing, must still pass unchanged.

**Integration (live stack, not in CI):** the new cells listed in Components, plus every existing
suite re-run after the `before`/`after` retrofit to confirm no cell now throws on the new validation.

**End-to-end:** the Tier A pass itself (Implementation Order step 6) is the e2e test.

---

# Verification

Run from the worktree root. Source the env first or the guard fails closed:

```bash
set -a; source supabase/functions/.env; set +a
```

```bash
# 1. Type/lint the harness
deno check supabase/functions/_shared/payments-e2e/*.ts

# 2. Unit tests (no live stack required)
deno test -A --no-check \
  supabase/functions/_shared/payments-e2e/evidence.test.ts \
  supabase/functions/_shared/payments-e2e/render-results.test.ts \
  supabase/functions/_shared/payments-e2e/generate-manifest.test.ts \
  supabase/functions/_shared/payments-e2e/guard.test.ts \
  supabase/functions/_shared/payments-e2e/webhook-replay.test.ts

# 3. Regenerate the manifest and confirm the phantom rows are gone
deno run -A supabase/functions/_shared/payments-e2e/generate-manifest.ts
grep -E 'PAY-(BOOK|CPT|INV)-REF-(GHS|NGN)' docs/test-plans/payments-e2e.cells.json && echo "PHANTOM CELLS STILL PRESENT" || echo OK

# 4. Idempotent render (the regression that started this pass)
deno run -A supabase/functions/_shared/payments-e2e/render-results.ts
cp docs/test-plans/payments-e2e.results.md /tmp/results-1.md
deno run -A supabase/functions/_shared/payments-e2e/render-results.ts
diff <(grep -v '^Rendered ' /tmp/results-1.md) <(grep -v '^Rendered ' docs/test-plans/payments-e2e.results.md) && echo "IDEMPOTENT"
grep -q 'NO-GO' docs/test-plans/payments-e2e.results.md && echo "VERDICT SURVIVED"

# 5. Tier B integration suites (local stack: supabase start)
deno test -A --no-check supabase/functions/_shared/payments-e2e/*.integration.test.ts

# 6. Tier A (dev project only — confirm SUPABASE_URL ref is yqahjtsizbqwxdbjzsli, never xbkjgqaagwzxpzpiehov)
deno test -A --no-check supabase/functions/_shared/payments-e2e/*.integration.test.ts

# 7. Confirm no production code was touched (AD-9)
git diff --name-only | grep '^supabase/functions/' | grep -v '^supabase/functions/_shared/payments-e2e/' \
  && echo "AD-9 VIOLATION" || echo "AD-9 OK"

# 8. Confirm no secret leaked into committed files
git diff | grep -E 'sk_test_|sk_live_' && echo "SECRET LEAK" || echo "CLEAN"
```

Migrations, if any ever become necessary, use `supabase db push` — **never** `db reset`.

---

# Implementation Order

**Step 1 must complete before any `render-results.ts` invocation.** The current verdict exists only
inside a file that the documented re-run command overwrites.

1. **Rescue the verdict.** Copy the entire `## Verdict` section body from
   `docs/test-plans/payments-e2e.results.md` verbatim into a new
   `docs/test-plans/payments-e2e.verdict.md`. Commit this alone, before touching any code, so the
   text is recoverable from git regardless of what follows.
2. **AD-R1 — `render-results.ts` inlines the verdict.** Add the read + inline + absent-file
   placeholder. Add `render-results.test.ts` including the render-twice idempotency case.
3. **AD-R5 — orphaned evidence section** in the same file, covered by the same test.
4. Run Verification steps 1, 2 and 4. **Do not proceed until "VERDICT SURVIVED" and "IDEMPOTENT"
   both print.** This is the gate the whole pass hinges on.
5. **AD-R3 — manifest fix.** `matrix.ts` `REF_APPLICABLE_INTENTS`; `generate-manifest.ts` skips the
   base-loop REF scenario and emits per-intent sub-cells; add the uniqueness + no-phantom assertions
   and `generate-manifest.test.ts`. Regenerate the manifest (Verification step 3).
6. **AD-R2 — evidence contract.** Tighten `evidence.ts` (runtime throw + type union), add
   `evidence.test.ts`, then retrofit every existing `recordCell()` call site with the `before`/`after`
   values already in scope at each site. Re-run every existing integration suite (Verification
   step 5) and confirm none now throws on the new validation. Doing this *before* writing new cells
   means the new cells are written against the final contract, not retrofitted twice.
7. **Step 2 of the backlog item — the four no-Paystack cells** (`CPT-FAIL`, `SPT-ABD-C`,
   `INV-ABD-C`, `SUB-ABD-C`) plus the folded-in `CPT-ABD-C`, in
   `webhook-recording.integration.test.ts`, reusing each intent's existing `*-OK` outcome function.
8. **REF generalisation** in `refund.integration.test.ts`: parameterise REF-a/b/c over
   `BOOK`/`CPT`/`INV`. Read the processor's branch for `CPT`/`INV` first to establish whether a
   refundable `type: 'payment'` transaction exists; record `n/a` with the finding where it does not
   (Edge Case 4).
9. **AD-R4 — Tier A plumbing.** `env.ts` reads `PAYMENTS_E2E_TIER_A_WEBHOOK_URL`; new `tier-a.ts`
   with `tierAPrecondition()`; wire the Paystack-calling cells to it.
10. **Run Tier B end to end** against the local stack. Fix harness defects only — never production
    code (AD-9).
11. **Run Tier A** against the dev project. Confirm the project ref before running. Do not run
    concurrently with `multi-salon-db-verification`.
12. **Re-render** (`render-results.ts`) and confirm the inlined verdict is still the *old* one — the
    script must never have authored it.
13. **Author the fresh verdict** by hand in `docs/test-plans/payments-e2e.verdict.md`, per AD-10:
    three separate statements — (a) payout path go/no-go, (b) `subaccount-split-cleanup`,
    (c) beta launch — each naming the cell ids it rests on, plus any conditions on a "go". Weigh C-3
    under (a), per AD-10's note to the verdict author. Re-render.
14. **AD-R6 — amend the original design doc** with the Amendments block and the AD-7/AD-10 pointers.
15. **Update `docs/backlog-open-followups.md`**: the `payments-e2e-verification` item's status; the
    `subaccount-split-cleanup` gate (its current UNBLOCKED note cites the superseded verdict and must
    be re-stated against the new one, whichever way it lands); the beta-launch gate; and file any new
    defect the Tier A run surfaces as its own item.
16. Run the full Verification block, including the AD-9 and secret-leak checks.

---

# Open Questions

- `Q: Should the Verdict be preserved by parsing it back out of the generated results doc, moved to a separate never-generated file, or handled another way? -> A: Moved to docs/test-plans/payments-e2e.verdict.md as the hand-written source of truth, and inlined verbatim by render-results.ts. This eliminates the overwrite bug as a class rather than mitigating it, and resolves the standing "do not hand-edit" vs AD-10 contradiction. See AD-R1 for the rejected alternatives. (decided autonomously)`
- `Q: Retrofit all ~18+ recordCell() call sites with before/after/external_references, or amend AD-7 to scope the requirement down? -> A: Retrofit, with runtime enforcement in recordCell(); AD-7 is amended only to exempt n/a and not-run records, which have no state pair. The retrofit is cheap because every call site already computes the snapshots, and the alternative gives up the property that makes the verdict auditable — which is the reason this pass exists. See AD-R2. (decided autonomously)`
- `Q: What does "run Tier A" cover, given some cells need a customer completing a card on Paystack's hosted page? -> A: Tier A covers the server-to-server Paystack calls the harness can drive itself. Cells requiring hosted-checkout completion are gated on an explicit precondition and recorded not-run with the specific unmet reason — never pass, never silently skipped. See AD-R4. (decided autonomously)`
- **Genuinely open, for the operator (not resolvable from any document here):** whether the dev
  project's edge functions are currently deployed and the Paystack test account's webhook URL points
  at them. This determines how many Tier A cells can execute at all. It is not a blocker — AD-R4
  makes the unmet case record honestly — but the fresh verdict's coverage depends on it, and the
  answer should be stated in the verdict rather than inferred from the cell results.
