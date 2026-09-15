// Unit tests for evidence.ts (design AD-R2, amending AD-7). No live stack —
// the evidence file is redirected into a temp path via env var.
//
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/evidence.test.ts

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readEvidence, recordCell } from "./evidence.ts";

async function withTempEvidenceFile(run: (path: string) => Promise<void>) {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/evidence.jsonl`;
  const previous = Deno.env.get("PAYMENTS_E2E_EVIDENCE_PATH");
  try {
    Deno.env.set("PAYMENTS_E2E_EVIDENCE_PATH", path);
    await run(path);
  } finally {
    if (previous === undefined) Deno.env.delete("PAYMENTS_E2E_EVIDENCE_PATH");
    else Deno.env.set("PAYMENTS_E2E_EVIDENCE_PATH", previous);
    await Deno.remove(dir, { recursive: true });
  }
}

const BASE = {
  cell_id: "PAY-BOOK-OK-GHS",
  requirement_ids: ["FR-6"],
  currency: "GHS" as const,
  intent: "BOOK",
  scenario: "OK",
  note: "ok",
};

Deno.test("recordCell throws for a pass record missing before", async () => {
  await withTempEvidenceFile(async () => {
    await assertRejects(
      () =>
        // deno-lint-ignore no-explicit-any
        recordCell({ ...BASE, tier: "B", result: "pass", after: { x: 1 } } as any),
      Error,
      "requires 'before'",
    );
  });
});

Deno.test("recordCell throws for a fail record missing after", async () => {
  await withTempEvidenceFile(async () => {
    await assertRejects(
      () =>
        // deno-lint-ignore no-explicit-any
        recordCell({ ...BASE, tier: "B", result: "fail", before: { x: 1 } } as any),
      Error,
      "requires 'after'",
    );
  });
});

Deno.test("recordCell accepts n/a without before/after", async () => {
  await withTempEvidenceFile(async (path) => {
    await recordCell({ ...BASE, tier: "n/a", result: "n/a" });
    const raw = await Deno.readTextFile(path);
    assertEquals(raw.trim().length > 0, true);
  });
});

Deno.test("recordCell accepts not-run without before/after", async () => {
  await withTempEvidenceFile(async (path) => {
    await recordCell({ ...BASE, tier: "n/a", result: "not-run" });
    const raw = await Deno.readTextFile(path);
    assertEquals(raw.trim().length > 0, true);
  });
});

Deno.test("recordCell throws when a Tier A pass omits external_references", async () => {
  await withTempEvidenceFile(async () => {
    await assertRejects(
      () => recordCell({ ...BASE, tier: "A", result: "pass", before: { x: 0 }, after: { x: 1 } }),
      Error,
      "requires 'external_references'",
    );
  });
});

Deno.test("recordCell accepts a Tier A pass with external_references", async () => {
  await withTempEvidenceFile(async (path) => {
    await recordCell({
      ...BASE,
      tier: "A",
      result: "pass",
      before: { x: 0 },
      after: { x: 1 },
      external_references: { paystack_reference: "ref_123" },
    });
    const raw = await Deno.readTextFile(path);
    assertEquals(raw.trim().length > 0, true);
  });
});

Deno.test("recordCell does not require external_references for a Tier B pass", async () => {
  await withTempEvidenceFile(async (path) => {
    await recordCell({ ...BASE, tier: "B", result: "pass", before: { x: 0 }, after: { x: 1 } });
    const raw = await Deno.readTextFile(path);
    assertEquals(raw.trim().length > 0, true);
  });
});

Deno.test("readEvidence still parses legacy lines lacking before/after/external_references", async () => {
  await withTempEvidenceFile(async (path) => {
    const legacyLine = JSON.stringify({
      cell_id: "PAY-BOOK-DUP-GHS",
      requirement_ids: ["FR-12"],
      currency: "GHS",
      intent: "BOOK",
      scenario: "DUP",
      tier: "B",
      result: "fail",
      timestamp: "2026-09-14T22:22:31.000Z",
      note: "legacy record, no before/after",
    });
    await Deno.writeTextFile(path, legacyLine + "\n");
    const records = await readEvidence();
    assertEquals(records.length, 1);
    assertEquals(records[0].cell_id, "PAY-BOOK-DUP-GHS");
  });
});
