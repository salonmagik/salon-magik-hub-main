// Unit tests for generate-manifest.ts (design AD-R3). No live stack, no
// file I/O against the real docs/test-plans files — buildCells() is pure.
//
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/generate-manifest.test.ts

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertManifestInvariants, buildCells, type ManifestCell } from "./generate-manifest.ts";

Deno.test("no applicable cell_id matches the phantom -REF- parent pattern", () => {
  const cells = buildCells();
  for (const cell of cells) {
    if (!cell.applicable) continue;
    assertEquals(
      /-REF-(GHS|NGN)$/.test(cell.cell_id),
      false,
      `${cell.cell_id} is a phantom REF parent cell`,
    );
  }
});

Deno.test("not-applicable REF rows are kept for SPT, MSG, SUB", () => {
  const cells = buildCells();
  for (const intent of ["SPT", "MSG", "SUB"]) {
    for (const currency of ["GHS", "NGN"]) {
      const found = cells.find((c) => c.intent === intent && c.scenario === "REF" && c.currency === currency);
      assertEquals(found?.applicable, false, `expected a not-applicable PAY-${intent}-REF-${currency} row`);
    }
  }
});

Deno.test("REF-a/b/c are emitted for exactly BOOK, CPT, INV", () => {
  const cells = buildCells();
  const refIntents = new Set(
    cells.filter((c) => ["REF-a", "REF-b", "REF-c"].includes(c.scenario)).map((c) => c.intent),
  );
  assertEquals(refIntents, new Set(["BOOK", "CPT", "INV"]));
});

Deno.test("every intent in {BOOK,CPT,INV} gets all three REF sub-cells for both currencies", () => {
  const cells = buildCells();
  for (const intent of ["BOOK", "CPT", "INV"]) {
    for (const sub of ["REF-a", "REF-b", "REF-c"]) {
      for (const currency of ["GHS", "NGN"]) {
        const found = cells.find((c) => c.intent === intent && c.scenario === sub && c.currency === currency);
        assertEquals(found !== undefined, true, `missing PAY-${intent}-${sub}-${currency}`);
      }
    }
  }
});

Deno.test("cell_ids are unique", () => {
  const cells = buildCells();
  const ids = cells.map((c) => c.cell_id);
  assertEquals(ids.length, new Set(ids).size);
});

Deno.test("assertManifestInvariants passes for the real manifest", () => {
  const cells = buildCells();
  assertManifestInvariants(cells);
});

Deno.test("assertManifestInvariants throws on a duplicate cell_id", () => {
  const cells: ManifestCell[] = [
    { cell_id: "PAY-BOOK-OK-GHS", requirement_ids: [], currency: "GHS", intent: "BOOK", scenario: "OK", applicable: true },
    { cell_id: "PAY-BOOK-OK-GHS", requirement_ids: [], currency: "GHS", intent: "BOOK", scenario: "OK", applicable: true },
  ];
  assertThrows(() => assertManifestInvariants(cells), Error, "duplicate cell_id");
});

Deno.test("assertManifestInvariants throws on a phantom -REF- parent cell", () => {
  const cells: ManifestCell[] = [
    { cell_id: "PAY-BOOK-REF-GHS", requirement_ids: [], currency: "GHS", intent: "BOOK", scenario: "REF", applicable: true },
  ];
  assertThrows(() => assertManifestInvariants(cells), Error, "phantom REF parent cell");
});
