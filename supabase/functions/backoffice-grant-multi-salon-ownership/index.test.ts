import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as OTPAuth from "npm:otpauth@9.2.2";
import { handleGrantMultiSalonOwnership } from "./index.ts";

// handleGrantMultiSalonOwnership is the extracted, dependency-injected core
// of this function (see index.ts), modelled on
// backoffice-add-tenant-co-owner/index.test.ts.

const TOTP_SECRET = new OTPAuth.Secret({ size: 20 }).base32;

function currentTotpToken() {
  const totp = new OTPAuth.TOTP({
    issuer: "SalonMagik",
    label: "test",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(TOTP_SECRET),
  });
  return totp.generate();
}

const caller = { id: "super-admin-1", email: "super@example.com" };

function singleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

interface Options {
  boUser?: { role: string; is_active: boolean; totp_secret: string; totp_enabled: boolean } | null;
  targetTenant?: { id: string; name: string } | null;
  failingTenant?: { name: string; subscription_status: string } | null;
  grantResult?: { data: unknown; error: { message: string } | null };
}

function createMocks(opts: Options) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

  const admin = {
    from(table: string) {
      if (table === "backoffice_users") {
        return singleChain({
          data: opts.boUser === undefined
            ? { role: "super_admin", is_active: true, totp_secret: TOTP_SECRET, totp_enabled: true }
            : opts.boUser,
          error: null,
        });
      }
      if (table === "tenants") {
        return singleChain({
          data: opts.targetTenant !== undefined
            ? opts.targetTenant
            : (opts.failingTenant ? opts.failingTenant : { id: "tenant-b", name: "Salon B" }),
          error: null,
        });
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
    rpc: (fn: string) => {
      if (fn === "create_owner_multi_salon_grant") {
        return Promise.resolve(
          opts.grantResult ?? {
            data: { grantId: "grant-1", bound: true, standing: { allGood: true, salons: [] } },
            error: null,
          },
        );
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const authClient = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: caller }, error: null }),
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { admin, authClient, inserts };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: "owner-1",
    tenantId: "tenant-b",
    reason: "Verified franchise expansion, all salons in good standing",
    totpToken: currentTotpToken(),
    ...overrides,
  };
}

Deno.test("non-super-admin is rejected with 403", async () => {
  const { admin, authClient } = createMocks({
    boUser: { role: "support_agent", is_active: true, totp_secret: TOTP_SECRET, totp_enabled: true },
  });
  const res = await handleGrantMultiSalonOwnership(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 403);
});

Deno.test("stale TOTP is rejected with 401", async () => {
  const { admin, authClient } = createMocks({});
  const res = await handleGrantMultiSalonOwnership(
    makeRequest(baseBody({ totpToken: "000000" })),
    admin,
    authClient,
  );
  assertEquals(res.status, 401);
});

Deno.test("auth precedes payload validation: non-super-admin with missing fields still gets 403", async () => {
  const { admin, authClient } = createMocks({
    boUser: { role: "support_agent", is_active: true, totp_secret: TOTP_SECRET, totp_enabled: true },
  });
  const res = await handleGrantMultiSalonOwnership(
    makeRequest({ totpToken: currentTotpToken() }),
    admin,
    authClient,
  );
  assertEquals(res.status, 403);
});

Deno.test("reason under 10 characters is rejected with 400", async () => {
  const { admin, authClient } = createMocks({});
  const res = await handleGrantMultiSalonOwnership(
    makeRequest(baseBody({ reason: "too short" })),
    admin,
    authClient,
  );
  assertEquals(res.status, 400);
});

Deno.test("MULTI_SALON_NOT_AN_OWNER returns 409", async () => {
  const { admin, authClient } = createMocks({
    grantResult: { data: null, error: { message: "MULTI_SALON_NOT_AN_OWNER" } },
  });
  const res = await handleGrantMultiSalonOwnership(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 409);
});

Deno.test("MULTI_SALON_STANDING_FAILED names the offending salon", async () => {
  const { admin, authClient } = createMocks({
    grantResult: { data: null, error: { message: "MULTI_SALON_STANDING_FAILED:tenant-a" } },
    failingTenant: { name: "Bright Cuts", subscription_status: "past_due" },
  });
  const res = await handleGrantMultiSalonOwnership(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Bright Cuts"), true);
  assertEquals(body.error.includes("past_due"), true);
});

Deno.test("MULTI_SALON_TARGET_IN_TRIAL names the target salon", async () => {
  const { admin, authClient } = createMocks({
    targetTenant: { id: "tenant-b", name: "Sunset Braids" },
    grantResult: { data: null, error: { message: "MULTI_SALON_TARGET_IN_TRIAL" } },
  });
  const res = await handleGrantMultiSalonOwnership(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Sunset Braids"), true);
});

Deno.test("target tenant not found returns 404", async () => {
  const { admin, authClient } = createMocks({ targetTenant: null });
  const res = await handleGrantMultiSalonOwnership(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 404);
});

Deno.test("happy path returns 200 and writes one audit log", async () => {
  const { admin, authClient, inserts } = createMocks({});
  const res = await handleGrantMultiSalonOwnership(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.grantId, "grant-1");

  const auditInserts = inserts.filter((i) => i.table === "audit_logs");
  assertEquals(auditInserts.length, 1);
  assertEquals(auditInserts[0].row.action, "backoffice.multi_salon_ownership_granted");
});

Deno.test("unbound grant (no tenantId) skips the target-tenant lookup and succeeds", async () => {
  const { admin, authClient } = createMocks({
    grantResult: { data: { grantId: "grant-2", bound: false, standing: { allGood: true, salons: [] } }, error: null },
  });
  const res = await handleGrantMultiSalonOwnership(
    makeRequest(baseBody({ tenantId: null })),
    admin,
    authClient,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.bound, false);
});
