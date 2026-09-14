// Structured evidence records (design AD-7). Every cell appends one JSON
// record here; docs/test-plans/payments-e2e.results.md is rendered from this
// file, never hand-written, so an unrun cell has no record (renders as
// not-run) and a pass always carries the state that justified it.

export type CellResult = "pass" | "fail" | "n/a" | "not-run";
export type CellTier = "A" | "B";

export interface EvidenceRecord {
  cell_id: string;
  requirement_ids: string[];
  currency: "GHS" | "NGN" | "n/a";
  intent: string;
  scenario: string;
  tier: CellTier | "n/a";
  result: CellResult;
  before?: unknown;
  after?: unknown;
  external_references?: Record<string, string | undefined>;
  timestamp: string;
  note: string;
}

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
  const full: EvidenceRecord = { ...record, timestamp: new Date().toISOString() };
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
