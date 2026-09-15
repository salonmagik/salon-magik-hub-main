// Unit tests for render-results.ts (design AD-R1, AD-R5). No live stack —
// every path is redirected into a temp directory via env vars so the real
// docs/test-plans files are never touched.
//
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/render-results.test.ts

import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { main as renderResults } from "./render-results.ts";

const ENV_VARS = [
  "PAYMENTS_E2E_MANIFEST_PATH",
  "PAYMENTS_E2E_VERDICT_PATH",
  "PAYMENTS_E2E_RESULTS_PATH",
  "PAYMENTS_E2E_EVIDENCE_PATH",
];

const MANIFEST = {
  cells: [
    { cell_id: "PAY-BOOK-OK-GHS", requirement_ids: ["FR-6"], currency: "GHS", intent: "BOOK", scenario: "OK", applicable: true },
    { cell_id: "PAY-BOOK-OK-NGN", requirement_ids: ["FR-6"], currency: "NGN", intent: "BOOK", scenario: "OK", applicable: true },
    { cell_id: "PAY-SPT-REF-GHS", requirement_ids: ["FR-13"], currency: "GHS", intent: "SPT", scenario: "REF", applicable: false, reason_if_not_applicable: "no refund surface" },
  ],
};

async function withTempFiles(
  setup: (dir: string, paths: { manifest: string; verdict: string; results: string; evidence: string }) => Promise<void>,
  run: (paths: { manifest: string; verdict: string; results: string; evidence: string }) => Promise<void>,
) {
  const dir = await Deno.makeTempDir();
  const paths = {
    manifest: `${dir}/cells.json`,
    verdict: `${dir}/verdict.md`,
    results: `${dir}/results.md`,
    evidence: `${dir}/evidence.jsonl`,
  };
  const previous: Record<string, string | undefined> = {};
  for (const key of ENV_VARS) previous[key] = Deno.env.get(key);

  try {
    Deno.env.set("PAYMENTS_E2E_MANIFEST_PATH", paths.manifest);
    Deno.env.set("PAYMENTS_E2E_VERDICT_PATH", paths.verdict);
    Deno.env.set("PAYMENTS_E2E_RESULTS_PATH", paths.results);
    Deno.env.set("PAYMENTS_E2E_EVIDENCE_PATH", paths.evidence);
    await setup(dir, paths);
    await run(paths);
  } finally {
    for (const key of ENV_VARS) {
      if (previous[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[key]!);
    }
    await Deno.remove(dir, { recursive: true });
  }
}

function evidenceLine(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    cell_id: "PAY-BOOK-OK-GHS",
    requirement_ids: ["FR-6"],
    currency: "GHS",
    intent: "BOOK",
    scenario: "OK",
    tier: "B",
    result: "pass",
    before: { balance: 0 },
    after: { balance: 100 },
    timestamp: "2026-01-01T00:00:00.000Z",
    note: "ok",
    ...overrides,
  });
}

Deno.test("inlines the verdict body verbatim when the file exists", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
      await Deno.writeTextFile(paths.verdict, "**(a) Payout path:** GO.\n");
    },
    async (paths) => {
      await renderResults();
      const rendered = await Deno.readTextFile(paths.results);
      assertMatch(rendered, /## Verdict\n\n\*\*\(a\) Payout path:\*\* GO\./);
    },
  );
});

Deno.test("renders the placeholder and warns when the verdict file is absent", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
    },
    async (paths) => {
      await renderResults();
      const rendered = await Deno.readTextFile(paths.results);
      assertMatch(rendered, /No verdict has been authored yet/);
      assertMatch(rendered, /_TODO/);
    },
  );
});

Deno.test("renders the placeholder when the verdict file is empty", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
      await Deno.writeTextFile(paths.verdict, "   \n");
    },
    async (paths) => {
      await renderResults();
      const rendered = await Deno.readTextFile(paths.results);
      assertMatch(rendered, /No verdict has been authored yet/);
    },
  );
});

Deno.test("rendering twice produces byte-identical output apart from the timestamp line", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
      await Deno.writeTextFile(paths.verdict, "Fixed verdict text.\n");
      await Deno.writeTextFile(paths.evidence, evidenceLine({}) + "\n");
    },
    async (paths) => {
      await renderResults();
      const first = (await Deno.readTextFile(paths.results)).split("\n").filter((l) => !l.startsWith("Rendered "));
      await renderResults();
      const second = (await Deno.readTextFile(paths.results)).split("\n").filter((l) => !l.startsWith("Rendered "));
      assertEquals(first, second);
    },
  );
});

Deno.test("orphaned evidence surfaces in its own section, not counted in totals", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
      await Deno.writeTextFile(
        paths.evidence,
        [
          evidenceLine({}),
          evidenceLine({ cell_id: "CHECKOUT-GUARD-1", result: "pass", note: "checkout guard cell" }),
        ].join("\n") + "\n",
      );
    },
    async (paths) => {
      await renderResults();
      const rendered = await Deno.readTextFile(paths.results);
      assertMatch(rendered, /## Orphaned evidence/);
      assertMatch(rendered, /CHECKOUT-GUARD-1/);
      assertMatch(rendered, /\*\*Totals:\*\* 1 pass, 0 fail, 1 n\/a, 1 not-run\./);
    },
  );
});

Deno.test("omits the orphaned evidence section when there are none", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
    },
    async (paths) => {
      await renderResults();
      const rendered = await Deno.readTextFile(paths.results);
      assertEquals(rendered.includes("## Orphaned evidence"), false);
    },
  );
});

Deno.test("empty evidence file renders without error", async () => {
  await withTempFiles(
    async (_dir, paths) => {
      await Deno.writeTextFile(paths.manifest, JSON.stringify(MANIFEST));
    },
    async (paths) => {
      await renderResults();
      const rendered = await Deno.readTextFile(paths.results);
      assertMatch(rendered, /\*\*Totals:\*\* 0 pass, 0 fail, 1 n\/a, 2 not-run\./);
    },
  );
});
