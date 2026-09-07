import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMigrateChainAnnualBilling } from "./index.ts";

// handleMigrateChainAnnualBilling is the extracted, dependency-injected core
// of this function (see index.ts) — driven here with a mock Supabase client
// and a stubbed global fetch (the three Paystack calls — list, get, disable
// — are not injected), exercising the real disable-then-realign sequencing,
// the dry-run/no-mutation guarantee, and the re-run idempotency the design
// specifically calls for.

Deno.env.set("PAYSTACK_SECRET_KEY_GH", "test-secret-key");

const chainTenant = {
  id: "tenant-1",
  name: "Chain Salon",
  currency: "GHS",
  billing_cycle: "annual",
  plan: "chain",
  subscription_status: "active",
  next_billing_at: "2026-09-30T00:00:00.000Z",
  paystack_customer_code: "CUS_1",
  paystack_authorization_code: "AUTH_1",
};

function thenable<T>(result: T, methods: string[]) {
  const chain: Record<string, unknown> = {};
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

interface MockOptions {
  tenants: { data: unknown; error: { message: string } | null };
  chainPlan?: { data: unknown; error: null };
  chainPriceQuote?: { data: unknown; error: null };
}

function createMockAdmin(opts: MockOptions) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

  const admin = {
    from(table: string) {
      if (table === "tenants") {
        return {
          select: (_cols: string) => thenable(opts.tenants, ["eq", "in"]),
          update: (patch: Record<string, unknown>) => {
            updates.push({ table, patch });
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      if (table === "plans") {
        return {
          select: (_cols: string) => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(opts.chainPlan ?? { data: { id: "chain-plan-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "audit_logs") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserts.push({ table, row });
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
    rpc: (fn: string, _params: Record<string, unknown>) => {
      if (fn === "compute_chain_price") {
        return Promise.resolve(opts.chainPriceQuote ?? { data: [{ total_price: 1000 }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { admin, updates, inserts };
}

const caller = { id: "super-admin-1" };

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

function fetchRouter(routes: { subscriptionList?: unknown; subscriptionDetail?: unknown; disable?: unknown }) {
  const calls: string[] = [];
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/subscription?customer=")) {
      calls.push("list");
      return Promise.resolve(
        new Response(JSON.stringify(routes.subscriptionList ?? { status: true, data: [] }), { status: 200 }),
      );
    }
    if (url.includes("/subscription/disable")) {
      calls.push("disable");
      return Promise.resolve(
        new Response(JSON.stringify(routes.disable ?? { status: true, data: {} }), { status: 200 }),
      );
    }
    if (url.includes("/subscription/")) {
      calls.push("detail");
      return Promise.resolve(
        new Response(JSON.stringify(routes.subscriptionDetail ?? { status: true, data: {} }), { status: 200 }),
      );
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof fetch;
  return { impl, calls };
}

const activeSubscriptionList = {
  status: true,
  data: [{ subscription_code: "SUB_1", status: "active" }],
};

const subscriptionDetail = {
  status: true,
  data: { subscription_code: "SUB_1", email_token: "tok_1", status: "active", next_payment_date: "2026-11-01T00:00:00.000Z" },
};

Deno.test("dry run reports would_disable_and_realign and mutates nothing", async () => {
  const { admin, updates, inserts } = createMockAdmin({ tenants: { data: [chainTenant], error: null } });
  const { impl, calls } = fetchRouter({ subscriptionList: activeSubscriptionList, subscriptionDetail });

  await withFetch(impl, async () => {
    const res = await handleMigrateChainAnnualBilling(makeRequest({ dryRun: true }), admin, caller);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.dryRun, true);
    assertEquals(body.tenants.length, 1);
    assertEquals(body.tenants[0].action, "would_disable_and_realign");
  });

  assertEquals(calls.includes("disable"), false);
  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test("a real run disables the subscription, then realigns next_billing_at to the Paystack next_payment_date", async () => {
  const { admin, updates, inserts } = createMockAdmin({ tenants: { data: [chainTenant], error: null } });
  const { impl, calls } = fetchRouter({ subscriptionList: activeSubscriptionList, subscriptionDetail });

  await withFetch(impl, async () => {
    const res = await handleMigrateChainAnnualBilling(makeRequest({ dryRun: false }), admin, caller);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.tenants[0].action, "disabled_and_realigned");
  });

  assertEquals(calls.includes("disable"), true);

  const tenantsUpdate = updates.find((u) => u.table === "tenants");
  assertExists(tenantsUpdate);
  assertEquals(tenantsUpdate!.patch.next_billing_at, "2026-11-01T00:00:00.000Z");

  const disabledAudit = inserts.find((i) => i.row.action === "chain_annual_paystack_subscription_disabled");
  assertExists(disabledAudit);
  const migratedAudit = inserts.find((i) => i.row.action === "chain_annual_migrated_to_self_managed_billing");
  assertExists(migratedAudit);
  // Disable-then-realign, not the other way — the disable audit lets a
  // re-run detect a half-migrated tenant if the realign write below fails.
  assertEquals(inserts.indexOf(disabledAudit!) < inserts.indexOf(migratedAudit!), true);
});

Deno.test("a re-run after migration finds no active subscription and skips, without disabling anything twice", async () => {
  const { admin, updates, inserts } = createMockAdmin({ tenants: { data: [chainTenant], error: null } });
  const { impl, calls } = fetchRouter({ subscriptionList: { status: true, data: [] } });

  await withFetch(impl, async () => {
    const res = await handleMigrateChainAnnualBilling(makeRequest({ dryRun: false }), admin, caller);
    const body = await res.json();
    assertEquals(body.tenants[0].action, "skip_already_migrated");
  });

  assertEquals(calls.includes("disable"), false);
  assertEquals(calls.includes("detail"), false);
  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test("a tenant with no reusable authorization is reported blocked and left untouched", async () => {
  const tenantNoAuth = { ...chainTenant, paystack_authorization_code: null };
  const { admin, updates, inserts } = createMockAdmin({ tenants: { data: [tenantNoAuth], error: null } });
  const { impl, calls } = fetchRouter({ subscriptionList: activeSubscriptionList, subscriptionDetail });

  await withFetch(impl, async () => {
    const res = await handleMigrateChainAnnualBilling(makeRequest({ dryRun: false }), admin, caller);
    const body = await res.json();
    assertEquals(body.tenants[0].action, "blocked_no_authorization");
  });

  assertEquals(calls.includes("disable"), false);
  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test("annual Chain pricing not yet configured blocks the tenant without disabling their subscription", async () => {
  const { admin, updates, inserts } = createMockAdmin({
    tenants: { data: [chainTenant], error: null },
    chainPriceQuote: { data: [{ total_price: null }], error: null },
  });
  const { impl, calls } = fetchRouter({ subscriptionList: activeSubscriptionList, subscriptionDetail });

  await withFetch(impl, async () => {
    const res = await handleMigrateChainAnnualBilling(makeRequest({ dryRun: false }), admin, caller);
    const body = await res.json();
    assertEquals(body.tenants[0].action, "blocked_no_annual_pricing");
  });

  assertEquals(calls.includes("disable"), false);
  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 0);
});
