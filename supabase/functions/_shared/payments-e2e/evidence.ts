// Structured evidence records (design AD-7). Every cell appends one JSON
// record here; docs/test-plans/payments-e2e.results.md is rendered from this
// file, never hand-written, so an unrun cell has no record (renders as
// not-run) and a pass always carries the state that justified it.

export type CellResult = "pass" | "fail" | "n/a" | "not-run";
export type CellTier = "A" | "B";

interface EvidenceRecordBase {
  cell_id: string;
  requirement_ids: string[];
  currency: "GHS" | "NGN" | "n/a";
  intent: string;
  scenario: string;
  tier: CellTier | "n/a";
  external_references?: Record<string, string | undefined>;
  timestamp: string;
  note: string;
}

/**
 * Discriminated on `result` (design AD-R2, amending AD-7): a pass/fail
 * record carries the before/after state that justified it; n/a/not-run have
 * no state pair to snapshot. This union documents the contract — the actual
 * enforcement is the runtime throw in recordCell(), because every suite here
 * runs with `--no-check`, so a type error alone would never fire.
 */
export type EvidenceRecord =
  | (EvidenceRecordBase & { result: "pass" | "fail"; before: unknown; after: unknown })
  | (EvidenceRecordBase & { result: "n/a" | "not-run"; before?: undefined; after?: undefined });

const EVIDENCE_PATH_ENV = "PAYMENTS_E2E_EVIDENCE_PATH";
const DEFAULT_EVIDENCE_PATH = "docs/test-plans/payments-e2e.evidence.jsonl";

export function evidencePath(): string {
  return Deno.env.get(EVIDENCE_PATH_ENV) ?? DEFAULT_EVIDENCE_PATH;
}

/**
 * Appends one evidence record. Never overwrites — a run's evidence file is
 * additive across cells, and render-results.ts is responsible for treating
 * the *last* record per cell_id as authoritative if a cell is re-run.
 *
 * Security note (design section 11): callers must not pass raw Paystack
 * request/response bodies as `before`/`after`/`external_references` —
 * references only (e.g. a Paystack transaction reference), never
 * authorization codes, card data, or keys.
 */
export async function recordCell(record: Omit<EvidenceRecord, "timestamp">): Promise<void> {
  if (record.result === "pass" || record.result === "fail") {
    if (record.before === undefined) {
      throw new Error(`recordCell(${record.cell_id}): a ${record.result} record requires 'before' (design AD-R2)`);
    }
    if (record.after === undefined) {
      throw new Error(`recordCell(${record.cell_id}): a ${record.result} record requires 'after' (design AD-R2)`);
    }
    // "Any Tier A cell" is the general rule (design AD-R2); REF-a and the
    // payout transfer cells are themselves Tier A, so this one check covers
    // all three examples the design names.
    if (record.tier === "A" && record.external_references === undefined) {
      throw new Error(
        `recordCell(${record.cell_id}): a Tier A ${record.result} record requires 'external_references' (design AD-R2)`,
      );
    }
  }

  const full: EvidenceRecord = { ...record, timestamp: new Date().toISOString() } as EvidenceRecord;
  const line = JSON.stringify(full) + "\n";
  await Deno.writeTextFile(evidencePath(), line, { append: true, create: true });
}

/** Reads every recorded record, most-recent-per-cell-id winning. */
export async function readEvidence(): Promise<EvidenceRecord[]> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(evidencePath());
  } catch {
    return [];
  }

  const byCellId = new Map<string, EvidenceRecord>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as EvidenceRecord;
    byCellId.set(record.cell_id, record);
  }
  return Array.from(byCellId.values());
}
