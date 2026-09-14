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
  REFUND_REQUIREMENT_IDS,
  REFUND_SUB_CELLS,
  REQUIREMENT_IDS_BY_SCENARIO,
  TRANSPORT_CELL_IDS,
} from "./matrix.ts";

interface ManifestCell {
  cell_id: string;
  requirement_ids: string[];
  currency: string;
  intent: string;
  scenario: string;
  applicable: boolean;
  reason_if_not_applicable?: string;
}

function buildCells(): ManifestCell[] {
  const cells: ManifestCell[] = [];

  for (const row of applicabilityMatrix()) {
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

  for (const sub of REFUND_SUB_CELLS) {
    for (const currency of CURRENCIES) {
      cells.push({
        cell_id: `PAY-BOOK-${sub}-${currency}`,
        requirement_ids: REFUND_REQUIREMENT_IDS[sub],
        currency,
        intent: "BOOK",
        scenario: sub,
        applicable: true,
      });
    }
  }

  return cells;
}

async function main() {
  const manifest = { cells: buildCells() };
  await Deno.writeTextFile("docs/test-plans/payments-e2e.cells.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote docs/test-plans/payments-e2e.cells.json with ${manifest.cells.length} cells`);
}

if (import.meta.main) {
  await main();
}
