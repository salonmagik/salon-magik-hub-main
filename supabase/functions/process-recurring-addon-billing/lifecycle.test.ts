import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runLifecyclePass } from "./lifecycle.ts";

// Unlike this repo's existing serve()-handler test files (which construct a
// mock Supabase client but never actually invoke the handler, since
// createClient is called *inside* those functions with no way to intercept
// it), runLifecyclePass takes its Supabase client as a parameter — so this
// test drives the real function against a hand-rolled mock client and
// asserts on its actual return value and the calls it made. This is what
// protects AC 14 ("a re-run of the daily job must not double-apply a
// transition, a charge, or an email") at the TypeScript orchestration level,
// not just at the guarded-SQL level (already covered by
// supabase/tests/subscription_lifecycle.sql).
//
// One pass always makes its four `.from("tenants").select(...)` calls in a
// fixed order — cancellations due, dunning reminders, grace expiry,
// zero-total restore (see runLifecyclePass) — so selectQueue below is
// consumed by position, not by table name, to keep each stage's mock data
// isolated from the others.

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function thenable(result: QueryResult, extraMethods: string[]) {
  const chain: Record<string, unknown> = {};
  for (const method of extraMethods) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

interface MockSupabaseOptions {
  /** Consumed in order: one per `.from("tenants").select(...)` call. */
  selectQueue: QueryResult[];
  /** Consumed in order: one per guarded `.update(...)` call, across all tables. */
  updateQueue: QueryResult[];
}

function createMockSupabase(opts: MockSupabaseOptions) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const selectQueue = [...opts.selectQueue];
  const updateQueue = [...opts.updateQueue];

  const supabase = {
    from(table: string) {
      return {
        select: (_cols: string) =>
          thenable(selectQueue.shift() ?? { data: [], error: null }, ["select", "not", "lte", "gt", "eq", "in"]),
        update: (_patch: Record<string, unknown>) =>
          thenable(updateQueue.shift() ?? { data: [], error: null }, ["eq", "not", "lte", "select"]),
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return thenable({ data: null, error: null }, ["select"]);
        },
      };
    },
    rpc: (_fn: string, _params: Record<string, unknown>) =>
      Promise.resolve({ data: [{ total_amount: 50, currency: "GHS" }], error: null }),
    // deno-lint-ignore no-explicit-any
  } as any;

  return { supabase, inserts };
}

const fakeReq = new Request("http://localhost:8000");
const noOne: QueryResult = { data: [], error: null };

Deno.test("cancellations due: a due tenant is transitioned and gets exactly one audit log", async () => {
  const { supabase, inserts } = createMockSupabase({
    selectQueue: [
      { data: [{ id: "tenant-1" }], error: null }, // cancellations due
      noOne, // dunning reminders
      noOne, // grace expiry
      noOne, // zero-total restore
    ],
    updateQueue: [{ data: [{ id: "tenant-1" }], error: null }],
  });

  const results = await runLifecyclePass(fakeReq, supabase);

  const cancelResults = results.filter((r) => r.stage === "cancellations_due");
  assertEquals(cancelResults.length, 1);
  assertEquals(cancelResults[0].status, "canceled");
  assertEquals(cancelResults[0].tenantId, "tenant-1");

  const auditInserts = inserts.filter((i) => i.table === "audit_logs" && i.row.action === "subscription_canceled");
  assertEquals(auditInserts.length, 1);
});

Deno.test("cancellations due: a re-run where the guarded update already applied writes no audit log and no result entry (AC 14)", async () => {
  const { supabase, inserts } = createMockSupabase({
    selectQueue: [
      // The tenant still surfaces here (this mock's select doesn't
      // re-evaluate the real predicate), but the guarded UPDATE below
      // returns zero rows — exactly what happens for real once the first
      // run has already flipped the tenant out of 'active'.
      { data: [{ id: "tenant-1" }], error: null },
      noOne,
      noOne,
      noOne,
    ],
    updateQueue: [{ data: [], error: null }],
  });

  const results = await runLifecyclePass(fakeReq, supabase);

  const cancelResults = results.filter((r) => r.stage === "cancellations_due");
  assertEquals(cancelResults.length, 0);

  const auditInserts = inserts.filter((i) => i.table === "audit_logs" && i.row.action === "subscription_canceled");
  assertEquals(auditInserts.length, 0);
});

Deno.test("grace expiry: a tenant past its deadline is suspended with exactly one audit log", async () => {
  const { supabase, inserts } = createMockSupabase({
    selectQueue: [
      noOne, // cancellations due
      noOne, // dunning reminders
      {
        data: [{ id: "tenant-2", name: "Salon", logo_url: null, currency: "GHS", paystack_authorization_email: null }],
        error: null,
      }, // grace expiry
      noOne, // zero-total restore
    ],
    updateQueue: [{ data: [{ id: "tenant-2" }], error: null }],
  });

  const results = await runLifecyclePass(fakeReq, supabase);

  const graceResults = results.filter((r) => r.stage === "grace_expiry");
  assertEquals(graceResults.length, 1);
  assertEquals(graceResults[0].status, "suspended");

  const auditInserts = inserts.filter((i) => i.table === "audit_logs" && i.row.action === "subscription_suspended");
  assertEquals(auditInserts.length, 1);
});

Deno.test("grace expiry: a re-run where the guarded update already applied writes no audit log and no result entry (AC 14)", async () => {
  const { supabase, inserts } = createMockSupabase({
    selectQueue: [
      noOne,
      noOne,
      {
        data: [{ id: "tenant-2", name: "Salon", logo_url: null, currency: "GHS", paystack_authorization_email: null }],
        error: null,
      },
      noOne,
    ],
    updateQueue: [{ data: [], error: null }],
  });

  const results = await runLifecyclePass(fakeReq, supabase);

  const graceResults = results.filter((r) => r.stage === "grace_expiry");
  assertEquals(graceResults.length, 0);

  const auditInserts = inserts.filter((i) => i.table === "audit_logs" && i.row.action === "subscription_suspended");
  assertEquals(auditInserts.length, 0);
});

Deno.test("no due cancellations or grace-expired tenants: lifecycle pass is a clean no-op", async () => {
  const { supabase, inserts } = createMockSupabase({
    selectQueue: [noOne, noOne, noOne, noOne],
    updateQueue: [],
  });

  const results = await runLifecyclePass(fakeReq, supabase);

  assertEquals(results.filter((r) => r.stage === "cancellations_due").length, 0);
  assertEquals(results.filter((r) => r.stage === "grace_expiry").length, 0);
  assertEquals(inserts.length, 0);
});
