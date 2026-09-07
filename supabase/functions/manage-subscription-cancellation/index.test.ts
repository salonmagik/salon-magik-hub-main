import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleManageSubscriptionCancellation } from "./index.ts";

// handleManageSubscriptionCancellation is the extracted, dependency-injected
// core of this function (see index.ts) — driven here directly with a mock
// Supabase client and a fake authenticated user, exercising the real
// request/response logic end to end rather than scaffolding around it.

interface SingleResult {
  data: unknown;
  error: { message: string } | null;
}

function singleChain(result: SingleResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    chain[method] = () => chain;
  }
  chain.single = () => Promise.resolve(result);
  return chain;
}

interface MockOptions {
  userRole: SingleResult;
  tenant: SingleResult;
  rpcResults: Record<string, { data: unknown; error: { message: string } | null }>;
}

function createMockSupabase(opts: MockOptions) {
  const rpcCalls: string[] = [];
  const supabase = {
    from(table: string) {
      if (table === "user_roles") return singleChain(opts.userRole);
      if (table === "tenants") return singleChain(opts.tenant);
      throw new Error(`Unexpected table in test: ${table}`);
    },
    rpc: (fn: string, _params: Record<string, unknown>) => {
      rpcCalls.push(fn);
      return Promise.resolve(opts.rpcResults[fn] ?? { data: null, error: null });
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { supabase, rpcCalls };
}

const owner = { id: "user-1", email: "owner@example.com" };
const tenantRow = { data: { id: "tenant-1", name: "Salon", logo_url: null }, error: null };

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

Deno.test("missing tenantId/action returns 400", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: tenantRow,
    rpcResults: {},
  });
  const res = await handleManageSubscriptionCancellation(makeRequest({}), supabase, owner);
  assertEquals(res.status, 400);
});

Deno.test("cancel without a valid reason returns 400", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: tenantRow,
    rpcResults: {},
  });
  const res = await handleManageSubscriptionCancellation(
    makeRequest({ tenantId: "tenant-1", action: "cancel", reason: "not_a_real_reason" }),
    supabase,
    owner,
  );
  assertEquals(res.status, 400);
});

Deno.test("non-owner is rejected with 403 before any RPC is attempted", async () => {
  const { supabase, rpcCalls } = createMockSupabase({
    userRole: { data: { role: "staff" }, error: null },
    tenant: tenantRow,
    rpcResults: {
      request_subscription_cancellation: { data: "should never be reached", error: null },
    },
  });
  const res = await handleManageSubscriptionCancellation(
    makeRequest({ tenantId: "tenant-1", action: "cancel", reason: "too_expensive" }),
    supabase,
    owner,
  );
  assertEquals(res.status, 403);
  assertEquals(rpcCalls.length, 0);
});

Deno.test("tenant not found returns 404", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: { data: null, error: null },
    rpcResults: {},
  });
  const res = await handleManageSubscriptionCancellation(
    makeRequest({ tenantId: "tenant-1", action: "cancel", reason: "too_expensive" }),
    supabase,
    owner,
  );
  assertEquals(res.status, 404);
});

Deno.test("successful cancel returns 200 with the access-end date", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: tenantRow,
    rpcResults: {
      request_subscription_cancellation: { data: "2026-10-05T00:00:00.000Z", error: null },
    },
  });
  const res = await handleManageSubscriptionCancellation(
    makeRequest({ tenantId: "tenant-1", action: "cancel", reason: "too_expensive", note: "  bye  " }),
    supabase,
    owner,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.cancelAt, "2026-10-05T00:00:00.000Z");
});

Deno.test("an already-pending cancellation maps SUBSCRIPTION_NOT_CANCELLABLE to 409", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: tenantRow,
    rpcResults: {
      request_subscription_cancellation: { data: null, error: { message: "SUBSCRIPTION_NOT_CANCELLABLE" } },
    },
  });
  const res = await handleManageSubscriptionCancellation(
    makeRequest({ tenantId: "tenant-1", action: "cancel", reason: "too_expensive" }),
    supabase,
    owner,
  );
  assertEquals(res.status, 409);
});

Deno.test("successful resume returns 200 with the next billing date", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: tenantRow,
    rpcResults: {
      resume_subscription: { data: "2026-10-05T00:00:00.000Z", error: null },
    },
  });
  const res = await handleManageSubscriptionCancellation(makeRequest({ tenantId: "tenant-1", action: "resume" }), supabase, owner);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.resumed, true);
  assertEquals(body.nextBillingAt, "2026-10-05T00:00:00.000Z");
});

Deno.test("resume with nothing pending maps NOTHING_TO_RESUME to 409", async () => {
  const { supabase } = createMockSupabase({
    userRole: { data: { role: "owner" }, error: null },
    tenant: tenantRow,
    rpcResults: {
      resume_subscription: { data: null, error: { message: "NOTHING_TO_RESUME" } },
    },
  });
  const res = await handleManageSubscriptionCancellation(makeRequest({ tenantId: "tenant-1", action: "resume" }), supabase, owner);
  assertEquals(res.status, 409);
});
