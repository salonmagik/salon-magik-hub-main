import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as OTPAuth from "npm:otpauth@9.2.2";
import { handleAddTenantOwner } from "./index.ts";

// handleAddTenantOwner is the extracted, dependency-injected core of this
// function (see index.ts) — driven here with a mock admin/authClient.
// Pins T-3 / AD-2: this function's guard must stay byte-for-byte unchanged
// now that its super-admin/TOTP preamble is shared with
// backoffice-add-tenant-co-owner (AD-8).

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

function thenable(result: unknown) {
  return { then: (resolve: (v: unknown) => void) => resolve(result) };
}

function singleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle"]) {
    chain[m] = m === "maybeSingle" ? () => Promise.resolve(result) : () => chain;
  }
  return chain;
}

interface Options {
  ownerRows: Array<{ id: string; is_active: boolean | null }>;
  availability?: { available: boolean; reason?: string };
  boUser?: { role: string; is_active: boolean; totp_secret: string; totp_enabled: boolean } | null;
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
        return singleChain({ data: { id: "tenant-1", name: "Salon" }, error: null });
      }
      if (table === "user_roles") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        Object.assign(chain, thenable({ data: opts.ownerRows, error: null }));
        chain.insert = (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        };
        return chain;
      }
      if (table === "profiles") {
        return { upsert: () => Promise.resolve({ data: null, error: null }) };
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
      if (fn === "check_owner_invite_email") {
        return Promise.resolve({ data: opts.availability ?? { available: true }, error: null });
      }
      if (fn === "get_auth_user_by_email") {
        return Promise.resolve({ data: null, error: null });
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    auth: {
      admin: {
        createUser: () =>
          Promise.resolve({
            data: { user: { id: "new-owner-1" } },
            error: null,
          }),
        deleteUser: () => Promise.resolve({ error: null }),
      },
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

Deno.test("a tenant with an active owner still gets 409 (T-3, pins AD-2)", async () => {
  const { admin, authClient } = createMocks({ ownerRows: [{ id: "role-1", is_active: true }] });
  const res = await handleAddTenantOwner(
    makeRequest({
      tenantId: "tenant-1",
      email: "new-owner@example.com",
      firstName: "Jane",
      lastName: "Doe",
      totpToken: currentTotpToken(),
    }),
    admin,
    authClient,
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "This salon already has an owner.");
});

Deno.test("a tenant with no owner succeeds and writes the owner_added audit action", async () => {
  const { admin, authClient, inserts } = createMocks({ ownerRows: [] });
  const res = await handleAddTenantOwner(
    makeRequest({
      tenantId: "tenant-1",
      email: "new-owner@example.com",
      firstName: "Jane",
      lastName: "Doe",
      totpToken: currentTotpToken(),
    }),
    admin,
    authClient,
  );
  assertEquals(res.status, 200);
  const auditInsert = inserts.find((i) => i.table === "audit_logs");
  assertEquals(auditInsert?.row.action, "backoffice.owner_added");
});

Deno.test("bad TOTP is rejected with 401", async () => {
  const { admin, authClient } = createMocks({ ownerRows: [] });
  const res = await handleAddTenantOwner(
    makeRequest({
      tenantId: "tenant-1",
      email: "new-owner@example.com",
      firstName: "Jane",
      lastName: "Doe",
      totpToken: "000000",
    }),
    admin,
    authClient,
  );
  assertEquals(res.status, 401);
});

Deno.test("non-super-admin is rejected with 403", async () => {
  const { admin, authClient } = createMocks({
    ownerRows: [],
    boUser: { role: "support_agent", is_active: true, totp_secret: TOTP_SECRET, totp_enabled: true },
  });
  const res = await handleAddTenantOwner(
    makeRequest({
      tenantId: "tenant-1",
      email: "new-owner@example.com",
      firstName: "Jane",
      lastName: "Doe",
      totpToken: currentTotpToken(),
    }),
    admin,
    authClient,
  );
  assertEquals(res.status, 403);
});

Deno.test("non-super-admin with missing fields still gets 403, not 400 (auth precedes payload validation)", async () => {
  const { admin, authClient } = createMocks({
    ownerRows: [],
    boUser: { role: "support_agent", is_active: true, totp_secret: TOTP_SECRET, totp_enabled: true },
  });
  const res = await handleAddTenantOwner(
    // No firstName/lastName — a request this malformed must still be
    // rejected on authorization, not leak a payload-shape error to an
    // unauthorized caller.
    makeRequest({ tenantId: "tenant-1", email: "new-owner@example.com", totpToken: currentTotpToken() }),
    admin,
    authClient,
  );
  assertEquals(res.status, 403);
});

Deno.test("bad TOTP with missing fields still gets 401, not 400 (auth precedes payload validation)", async () => {
  const { admin, authClient } = createMocks({ ownerRows: [] });
  const res = await handleAddTenantOwner(
    makeRequest({ tenantId: "tenant-1", email: "new-owner@example.com", totpToken: "000000" }),
    admin,
    authClient,
  );
  assertEquals(res.status, 401);
});
