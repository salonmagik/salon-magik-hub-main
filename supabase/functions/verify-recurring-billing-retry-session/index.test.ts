import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleVerifyRecurringBillingRetrySession } from "./index.ts";

// handleVerifyRecurringBillingRetrySession is the extracted, dependency-
// injected core of this function (see index.ts) — driven here with a mock
// Supabase client and a stubbed global fetch (Paystack verify is not
// injected), exercising the real settlement logic including AC 9 (resume on
// the anchor, not now+cycle) and AC 10 (a declined charge mutates nothing).

Deno.env.set("PAYSTACK_SECRET_KEY_GH", "test-secret-key");

interface SingleResult {
  data: unknown;
  error: { message: string } | null;
}

function ownerRoleChain(result: SingleResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(result);
  return chain;
}

function idempotencyChain(result: SingleResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "contains"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

function tenantChain(result: SingleResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(result);
  return chain;
}

interface MockOptions {
  userRole: SingleResult;
  existingLog: SingleResult;
  tenant: SingleResult;
  rpcResults?: Record<string, { data: unknown; error: { message: string } | null }>;
}

function createMockSupabase(opts: MockOptions) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  // audit_logs is both selected (idempotency check) and inserted (writing logs) —
  // track which call this is via a small counter so each gets the right mock.
  let auditLogsSelectDone = false;

  const supabase = {
    from(table: string) {
      if (table === "user_roles") return ownerRoleChain(opts.userRole);
      if (table === "audit_logs") {
        return {
          select: (_cols: string) => {
            auditLogsSelectDone = true;
            return idempotencyChain(opts.existingLog);
          },
          insert: (row: Record<string, unknown>) => {
            inserts.push({ table, row });
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "tenants") {
        return {
          select: (_cols: string) => tenantChain(opts.tenant),
          update: (patch: Record<string, unknown>) => {
            updates.push({ table, patch });
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      throw new Error(`Unexpected table in test: ${table}, auditLogsSelectDone=${auditLogsSelectDone}`);
    },
    rpc: (fn: string, _params: Record<string, unknown>) =>
      Promise.resolve(opts.rpcResults?.[fn] ?? { data: null, error: null }),
    // deno-lint-ignore no-explicit-any
  } as any;

  return { supabase, updates, inserts };
}

const owner = { id: "user-1", email: "owner@example.com" };
const tenantRow = {
  id: "tenant-1",
  name: "Salon",
  logo_url: null,
  currency: "GHS",
  billing_cycle: "monthly",
  subscription_status: "past_due",
  billing_period_due_at: "2026-09-01T00:00:00.000Z",
};

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

function withFetch(impl: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function successfulVerifyResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: true,
      data: {
        status: "success",
        amount: 10000,
        metadata: { intent: "recurring_billing_retry", tenant_id: "tenant-1" },
        authorization: { reusable: true, authorization_code: "AUTH_new" },
        customer: { email: "owner@example.com", customer_code: "CUS_1" },
        ...overrides,
      },
    }),
    { status: 200 },
  );
}

Deno.test("already-applied reference is a no-op and mutates nothing (idempotency guard)", async () => {
  const { supabase, updates, inserts } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    existingLog: { data: { id: "existing-log-1" }, error: null },
    tenant: { data: tenantRow, error: null },
  });

  const res = await handleVerifyRecurringBillingRetrySession(
    makeRequest({ reference: "ref-1", tenantId: "tenant-1" }),
    supabase,
    owner,
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.alreadyApplied, true);
  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test("settlement from past_due resumes on the anchor date, not now+cycle (AC 9)", async () => {
  const { supabase, updates, inserts } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    existingLog: { data: null, error: null },
    tenant: { data: tenantRow, error: null },
    rpcResults: {
      advance_billing_anchor: { data: "2026-10-01T00:00:00.000Z" as unknown, error: null },
    },
  });

  await withFetch(
    (() => Promise.resolve(successfulVerifyResponse())) as typeof fetch,
    async () => {
      const res = await handleVerifyRecurringBillingRetrySession(
        makeRequest({ reference: "ref-1", tenantId: "tenant-1" }),
        supabase,
        owner,
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.applied, true);
    },
  );

  const tenantsUpdate = updates.find((u) => u.table === "tenants");
  assertExists(tenantsUpdate);
  assertEquals(tenantsUpdate!.patch.next_billing_at, "2026-10-01T00:00:00.000Z");
  assertEquals(tenantsUpdate!.patch.subscription_status, "active");
  assertEquals(tenantsUpdate!.patch.billing_grace_ends_at, null);
  assertEquals(tenantsUpdate!.patch.suspended_at, null);
  assertEquals(tenantsUpdate!.patch.billing_period_due_at, null);

  const reactivatedAudit = inserts.find((i) => i.table === "audit_logs" && i.row.action === "subscription_reactivated");
  assertExists(reactivatedAudit);
  assertEquals((reactivatedAudit!.row.metadata as Record<string, unknown>).from_status, "past_due");
});

Deno.test("settlement from suspended resumes to active the same way", async () => {
  const suspendedTenant = { ...tenantRow, subscription_status: "suspended" };
  const { supabase, updates } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    existingLog: { data: null, error: null },
    tenant: { data: suspendedTenant, error: null },
    rpcResults: {
      advance_billing_anchor: { data: "2026-10-01T00:00:00.000Z" as unknown, error: null },
    },
  });

  await withFetch(
    (() => Promise.resolve(successfulVerifyResponse())) as typeof fetch,
    async () => {
      const res = await handleVerifyRecurringBillingRetrySession(
        makeRequest({ reference: "ref-1", tenantId: "tenant-1" }),
        supabase,
        owner,
      );
      assertEquals(res.status, 200);
    },
  );

  const tenantsUpdate = updates.find((u) => u.table === "tenants");
  assertExists(tenantsUpdate);
  assertEquals(tenantsUpdate!.patch.subscription_status, "active");
});

Deno.test("a declined charge returns an error and mutates nothing, preserving the grace deadline (AC 10)", async () => {
  const { supabase, updates, inserts } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    existingLog: { data: null, error: null },
    tenant: { data: tenantRow, error: null },
  });

  await withFetch(
    (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ status: true, data: { status: "failed" } }),
          { status: 200 },
        ),
      )) as typeof fetch,
    async () => {
      const res = await handleVerifyRecurringBillingRetrySession(
        makeRequest({ reference: "ref-1", tenantId: "tenant-1" }),
        supabase,
        owner,
      );
      assertEquals(res.status, 400);
      const body = await res.json();
      assertExists(body.error);
    },
  );

  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test("a non-reusable card is rejected without mutating anything", async () => {
  const { supabase, updates } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    existingLog: { data: null, error: null },
    tenant: { data: tenantRow, error: null },
  });

  await withFetch(
    (() =>
      Promise.resolve(
        successfulVerifyResponse({ authorization: { reusable: false, authorization_code: "AUTH_new" } }),
      )) as typeof fetch,
    async () => {
      const res = await handleVerifyRecurringBillingRetrySession(
        makeRequest({ reference: "ref-1", tenantId: "tenant-1" }),
        supabase,
        owner,
      );
      assertEquals(res.status, 400);
    },
  );

  assertEquals(updates.length, 0);
});

Deno.test("non-owner is rejected with 403", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "staff" }, error: null },
    existingLog: { data: null, error: null },
    tenant: { data: tenantRow, error: null },
  });

  const res = await handleVerifyRecurringBillingRetrySession(
    makeRequest({ reference: "ref-1", tenantId: "tenant-1" }),
    supabase,
    owner,
  );
  assertEquals(res.status, 403);
});
