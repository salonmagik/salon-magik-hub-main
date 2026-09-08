import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCreatePayoutDestination } from "./index.ts";

// handleCreatePayoutDestination is the extracted, dependency-injected core
// of this function (see index.ts) — driven here with mock Supabase clients
// and a stubbed global fetch. Covers the new membership check (AD-6/F-1,
// T-4) and the owner-notification fan-out (FR-10, AC-10).

Deno.env.set("PAYSTACK_SECRET_KEY_GH", "test-secret-key");

const user = { id: "user-1", email: "caller@example.com" };

function thenable(result: unknown) {
  return { then: (resolve: (v: unknown) => void) => resolve(result) };
}

function roleChain(roles: Array<{ role: string; is_active: boolean | null }>) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  Object.assign(chain, thenable({ data: roles, error: null }));
  return chain;
}

interface Options {
  roles: Array<{ role: string; is_active: boolean | null }>;
  ownerRoleRows?: Array<{ user_id: string; role: string; is_active: boolean | null }>;
}

function createMocks(opts: Options) {
  const inserted: Record<string, unknown>[] = [];
  const sentEmails: Array<{ to: string[]; subject: string }> = [];

  const supabase = {
    from(table: string) {
      if (table === "user_roles") return roleChain(opts.roles);
      throw new Error(`Unexpected table on user client: ${table}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const serviceSupabase = {
    from(table: string) {
      if (table === "tenants") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.single = () => Promise.resolve({ data: { name: "Test Salon", platform_percentage_charge: 0.5, payout_mode: "auto" }, error: null });
        chain.update = () => ({ eq: () => Promise.resolve({ data: null, error: null }) });
        return chain;
      }
      if (table === "platform_settings") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
        return chain;
      }
      if (table === "salon_payout_destinations") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.head = true;
        (chain as any).then = (resolve: (v: unknown) => void) => resolve({ count: 1, error: null });
        chain.update = () => ({ eq: () => Promise.resolve({ data: null, error: null }) });
        chain.insert = (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "dest-1", ...row }, error: null }),
            }),
          };
        };
        return chain;
      }
      if (table === "user_roles") {
        const roles = opts.ownerRoleRows ?? [{ user_id: "owner-1", role: "owner", is_active: true }];
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
        Object.assign(chain, thenable({ data: roles, error: null }));
        return chain;
      }
      if (table === "profiles") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "in"]) chain[m] = () => chain;
        Object.assign(chain, thenable({ data: [{ user_id: "owner-1", full_name: "Ama Owner" }], error: null }));
        return chain;
      }
      throw new Error(`Unexpected table on service client: ${table}`);
    },
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: { email: `${id}@example.com` } }, error: null }),
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { supabase, serviceSupabase, inserted, sentEmails };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    destinationType: "mobile_money",
    country: "GH",
    currency: "GHS",
    momoProvider: "mtn",
    momoNumber: "0551234567",
    ...overrides,
  };
}

function withFetch(impl: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function successfulPaystackFetch(): typeof fetch {
  return ((url: string) => {
    if (url.includes("transferrecipient")) {
      return Promise.resolve(
        new Response(JSON.stringify({ status: true, data: { recipient_code: "RCP_1" } }), { status: 200 }),
      );
    }
    if (url.includes("subaccount")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ status: true, data: { subaccount_code: "ACCT_1", id: 1, active: true } }),
          { status: 200 },
        ),
      );
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as unknown as typeof fetch;
}

Deno.test("non-member is rejected with the generic 403 body", async () => {
  const { supabase, serviceSupabase } = createMocks({ roles: [] });
  const res = await handleCreatePayoutDestination(makeRequest(baseBody()), supabase, serviceSupabase, user);
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "You don't have permission to manage payouts for this salon.");
});

Deno.test("a manager is allowed", async () => {
  const { supabase, serviceSupabase } = createMocks({ roles: [{ role: "manager", is_active: true }] });
  await withFetch(successfulPaystackFetch(), async () => {
    const res = await handleCreatePayoutDestination(makeRequest(baseBody()), supabase, serviceSupabase, user);
    assertEquals(res.status, 200);
  });
});

Deno.test("an owner who also holds a manager row is allowed (AC-4, F-2 regression)", async () => {
  const { supabase, serviceSupabase } = createMocks({
    roles: [{ role: "owner", is_active: true }, { role: "manager", is_active: true }],
  });
  await withFetch(successfulPaystackFetch(), async () => {
    const res = await handleCreatePayoutDestination(makeRequest(baseBody()), supabase, serviceSupabase, user);
    assertEquals(res.status, 200);
  });
});

Deno.test("successful call fans a notification out to the active owner (AC-10)", async () => {
  const { supabase, serviceSupabase } = createMocks({ roles: [{ role: "owner", is_active: true }] });
  let resendCalled = false;
  await withFetch(
    ((url: string, init?: RequestInit) => {
      if (url === "https://api.resend.com/emails") {
        resendCalled = true;
        return Promise.resolve(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
      }
      return successfulPaystackFetch()(url as unknown as Request, init);
    }) as unknown as typeof fetch,
    async () => {
      Deno.env.set("RESEND_API_KEY", "test-resend-key");
      try {
        const res = await handleCreatePayoutDestination(makeRequest(baseBody()), supabase, serviceSupabase, user);
        assertEquals(res.status, 200);
      } finally {
        Deno.env.delete("RESEND_API_KEY");
      }
    },
  );
  assertEquals(resendCalled, true);
});

Deno.test("a throwing Resend call does not fail the request", async () => {
  const { supabase, serviceSupabase } = createMocks({ roles: [{ role: "owner", is_active: true }] });
  await withFetch(
    ((url: string, init?: RequestInit) => {
      if (url === "https://api.resend.com/emails") {
        throw new Error("Resend is down");
      }
      return successfulPaystackFetch()(url as unknown as Request, init);
    }) as unknown as typeof fetch,
    async () => {
      Deno.env.set("RESEND_API_KEY", "test-resend-key");
      try {
        const res = await handleCreatePayoutDestination(makeRequest(baseBody()), supabase, serviceSupabase, user);
        assertEquals(res.status, 200);
      } finally {
        Deno.env.delete("RESEND_API_KEY");
      }
    },
  );
});
