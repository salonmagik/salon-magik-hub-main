import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runChargePass } from "./charge.ts";

// Same rationale as lifecycle.test.ts: runChargePass takes its Supabase
// client as a parameter, so this drives the real function with a
// hand-rolled mock and asserts on what it actually wrote — not scaffolding.
// chargeAuthorization (in _shared/paystack-helpers.ts) is not
// dependency-injected, so the one thing this file does stub is the global
// fetch it calls internally.

Deno.env.set("PAYSTACK_SECRET_KEY_GH", "test-secret-key");

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function thenable(result: QueryResult, methods: string[]) {
  const chain: Record<string, unknown> = {};
  for (const method of methods) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

interface MockOptions {
  dueTenants: QueryResult;
  rpcResults: Record<string, QueryResult>;
}

function createMockSupabase(opts: MockOptions) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

  const supabase = {
    from(table: string) {
      return {
        select: (_cols: string) => thenable(opts.dueTenants, ["select", "not", "lte", "eq", "is"]),
        update: (patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return thenable({ data: null, error: null }, ["eq"]);
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return thenable({ data: null, error: null }, ["select"]);
        },
      };
    },
    rpc: (fn: string, _params: Record<string, unknown>) =>
      Promise.resolve(opts.rpcResults[fn] ?? { data: null, error: null }),
    // deno-lint-ignore no-explicit-any
  } as any;

  return { supabase, updates, inserts };
}

const fakeReq = new Request("http://localhost:8000");
const baseTenant = {
  id: "tenant-1",
  name: "Salon",
  logo_url: null,
  currency: "GHS",
  billing_cycle: "monthly",
  paystack_authorization_code: "AUTH_abc123",
  paystack_authorization_email: "owner@example.com",
  next_billing_at: "2026-09-01T00:00:00.000Z",
  billing_retry_count: 0,
};

function withFetch(impl: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("zero total: skips the charge entirely and reschedules without calling Paystack", async () => {
  let fetchCalled = false;
  const { supabase, updates } = createMockSupabase({
    dueTenants: { data: [baseTenant], error: null },
    rpcResults: {
      compute_tenant_recurring_total: { data: [{ total_amount: 0, currency: "GHS", breakdown: {} }], error: null },
    },
  });

  await withFetch(
    () => {
      fetchCalled = true;
      throw new Error("fetch should not be called for a zero-total tenant");
    },
    async () => {
      const results = await runChargePass(fakeReq, supabase);
      assertEquals(results.length, 1);
      assertEquals(results[0].status, "skipped_zero_total");
    },
  );

  assertEquals(fetchCalled, false);
  const tenantsUpdates = updates.filter((u) => u.table === "tenants");
  assertEquals(tenantsUpdates.length, 1);
  assertEquals(tenantsUpdates[0].patch.billing_retry_count, 0);
  assertExists(tenantsUpdates[0].patch.next_billing_at);
});

Deno.test("successful charge stamps the anchor before charging and advances via advance_billing_anchor", async () => {
  const { supabase, updates, inserts } = createMockSupabase({
    dueTenants: { data: [baseTenant], error: null },
    rpcResults: {
      compute_tenant_recurring_total: { data: [{ total_amount: 100, currency: "GHS", breakdown: { discount: 0 } }], error: null },
      advance_billing_anchor: { data: "2026-10-01T00:00:00.000Z" as unknown, error: null },
    },
  });

  let chargeRequestBody: Record<string, unknown> | null = null;

  await withFetch(
    ((input: RequestInfo | URL, init?: RequestInit) => {
      chargeRequestBody = JSON.parse(String(init?.body));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: true,
            data: { status: "success", reference: "ref-123", authorization: {} },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch,
    async () => {
      const results = await runChargePass(fakeReq, supabase);
      assertEquals(results.length, 1);
      assertEquals(results[0].status, "charged");
      assertEquals(results[0].amount, 100);
    },
  );

  assertExists(chargeRequestBody);
  assertEquals((chargeRequestBody as Record<string, unknown>).amount, 10000); // major units -> kobo/pesewas

  const tenantsUpdates = updates.filter((u) => u.table === "tenants");
  // First update stamps the anchor being charged for, before the charge attempt.
  assertEquals(tenantsUpdates[0].patch.billing_period_due_at, baseTenant.next_billing_at);
  // Second (final) update advances via the RPC result, not now+cycle, and clears the anchor.
  const finalUpdate = tenantsUpdates[tenantsUpdates.length - 1];
  assertEquals(finalUpdate.patch.next_billing_at, "2026-10-01T00:00:00.000Z");
  assertEquals(finalUpdate.patch.billing_period_due_at, null);
  assertEquals(finalUpdate.patch.billing_retry_count, 0);

  const chargedAudit = inserts.find((i) => i.table === "audit_logs" && i.row.action === "recurring_addon_billing_charged");
  assertExists(chargedAudit);
});

Deno.test("third consecutive failure opens a grace window and moves the tenant to past_due", async () => {
  const tenantOnThirdStrike = { ...baseTenant, billing_retry_count: 2 };
  const { supabase, updates, inserts } = createMockSupabase({
    dueTenants: { data: [tenantOnThirdStrike], error: null },
    rpcResults: {
      compute_tenant_recurring_total: { data: [{ total_amount: 100, currency: "GHS", breakdown: {} }], error: null },
    },
  });

  await withFetch(
    (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ status: true, data: { status: "failed", gateway_response: "Insufficient funds" } }),
          { status: 200 },
        ),
      )) as typeof fetch,
    async () => {
      const results = await runChargePass(fakeReq, supabase);
      assertEquals(results.length, 1);
      assertEquals(results[0].status, "charge_failed");
      assertEquals(results[0].stoppedRetrying, true);
      assertEquals(results[0].retryCount, 3);
    },
  );

  const tenantsUpdates = updates.filter((u) => u.table === "tenants");
  const stateUpdate = tenantsUpdates.find((u) => u.patch.subscription_status === "past_due");
  assertExists(stateUpdate);
  assertEquals(stateUpdate!.patch.next_billing_at, null);
  assertExists(stateUpdate!.patch.billing_grace_ends_at);
  assertExists(stateUpdate!.patch.billing_grace_started_at);

  const pastDueAudit = inserts.find((i) => i.table === "audit_logs" && i.row.action === "subscription_past_due");
  assertExists(pastDueAudit);
  const failedAudit = inserts.find((i) => i.table === "audit_logs" && i.row.action === "recurring_addon_billing_failed");
  assertExists(failedAudit);
});

Deno.test("a retryable failure (not yet at the max) reschedules for tomorrow without opening grace", async () => {
  const { supabase, updates, inserts } = createMockSupabase({
    dueTenants: { data: [{ ...baseTenant, billing_retry_count: 0 }], error: null },
    rpcResults: {
      compute_tenant_recurring_total: { data: [{ total_amount: 100, currency: "GHS", breakdown: {} }], error: null },
    },
  });

  await withFetch(
    (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ status: true, data: { status: "failed", gateway_response: "Insufficient funds" } }),
          { status: 200 },
        ),
      )) as typeof fetch,
    async () => {
      const results = await runChargePass(fakeReq, supabase);
      assertEquals(results[0].status, "charge_failed");
      assertEquals(results[0].stoppedRetrying, false);
      assertEquals(results[0].retryCount, 1);
    },
  );

  const tenantsUpdates = updates.filter((u) => u.table === "tenants");
  const retryUpdate = tenantsUpdates.find((u) => u.patch.billing_retry_count === 1);
  assertExists(retryUpdate);
  assertEquals(retryUpdate!.patch.subscription_status, undefined);
  assertEquals(retryUpdate!.patch.billing_grace_ends_at, undefined);

  const pastDueAudit = inserts.find((i) => i.table === "audit_logs" && i.row.action === "subscription_past_due");
  assertEquals(pastDueAudit, undefined);
});
