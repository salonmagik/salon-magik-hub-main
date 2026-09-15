// Generates docs/test-plans/payments-e2e.cells.json from matrix.ts (the
// single source of truth for the scenario matrix). Run once per change to
// the matrix; the file it writes is committed, not regenerated at test time.
//
//   deno run -A supabase/functions/_shared/payments-e2e/generate-manifest.ts

import {
  applicabilityMatrix,
  cellId,
  CURRENCIES,
  PAYOUT_CELL_IDS,
  PAYOUT_REQUIREMENT_IDS,
  REF_APPLICABLE_INTENTS,
  REFUND_REQUIREMENT_IDS,
  REFUND_SUB_CELLS,
  REQUIREMENT_IDS_BY_SCENARIO,
  TRANSPORT_CELL_IDS,
} from "./matrix.ts";

export interface ManifestCell {
  cell_id: string;
  requirement_ids: string[];
  currency: string;
  intent: string;
  scenario: string;
  applicable: boolean;
  reason_if_not_applicable?: string;
}

export function buildCells(): ManifestCell[] {
  const cells: ManifestCell[] = [];

  for (const row of applicabilityMatrix()) {
    // REF is applicable-only decomposed into REF-a/b/c below (AD-R3); skip
    // the parent row here for those intents only — emitting it would create
    // a phantom cell no suite can ever record against. Intents where REF is
    // not applicable at all (SPT/MSG/SUB) keep their n/a row here, same as
    // before, since that documents *why* REF doesn't apply rather than
    // asserting an obligation nothing can discharge.
    if (row.scenario === "REF" && REF_APPLICABLE_INTENTS.includes(row.intent)) continue;
    for (const currency of CURRENCIES) {
      cells.push({
        cell_id: cellId(row.intent, row.scenario, currency),
        requirement_ids: REQUIREMENT_IDS_BY_SCENARIO[row.scenario],
        currency,
        intent: row.intent,
        scenario: row.scenario,
        applicable: row.applicable,
        reason_if_not_applicable: row.reason,
      });
    }
  }

  for (const kind of TRANSPORT_CELL_IDS) {
    for (const currency of CURRENCIES) {
      cells.push({
        cell_id: `PAY-TRANSPORT-${kind}-${currency}`,
        requirement_ids: ["FR-6"],
        currency,
        intent: "TRANSPORT",
        scenario: kind,
        applicable: true,
      });
    }
  }

  for (const kind of PAYOUT_CELL_IDS) {
    for (const currency of CURRENCIES) {
      cells.push({
        cell_id: `PAYOUT-${kind}-${currency}`,
        requirement_ids: PAYOUT_REQUIREMENT_IDS[kind],
        currency,
        intent: "PAYOUT",
        scenario: kind,
        applicable: true,
      });
    }
  }

  for (const intent of REF_APPLICABLE_INTENTS) {
    for (const sub of REFUND_SUB_CELLS) {
      for (const currency of CURRENCIES) {
        cells.push({
          cell_id: `PAY-${intent}-${sub}-${currency}`,
          requirement_ids: REFUND_REQUIREMENT_IDS[sub],
          currency,
          intent,
          scenario: sub,
          applicable: true,
        });
      }
    }
  }

  return cells;
}

const PHANTOM_REF_PATTERN = /-REF-(?!a-|b-|c-)/;

export function assertManifestInvariants(cells: ManifestCell[]): void {
  const seen = new Set<string>();
  for (const cell of cells) {
    if (seen.has(cell.cell_id)) {
      throw new Error(`generate-manifest: duplicate cell_id ${cell.cell_id}`);
    }
    seen.add(cell.cell_id);
    // Only an *applicable* bare-REF cell is phantom — it is the one that can
    // never gain evidence and renders NOT RUN forever. A not-applicable
    // bare-REF cell (SPT/MSG/SUB) legitimately documents why REF doesn't
    // apply to that intent and expects no evidence at all.
    if (cell.applicable && PHANTOM_REF_PATTERN.test(cell.cell_id)) {
      throw new Error(
        `generate-manifest: ${cell.cell_id} is a phantom REF parent cell — REF must be decomposed into REF-a/b/c (AD-R3)`,
      );
    }
  }
}

async function main() {
  const cells = buildCells();
  assertManifestInvariants(cells);
  const manifest = { cells };
  await Deno.writeTextFile("docs/test-plans/payments-e2e.cells.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote docs/test-plans/payments-e2e.cells.json with ${manifest.cells.length} cells`);
}

if (import.meta.main) {
  await main();
}
