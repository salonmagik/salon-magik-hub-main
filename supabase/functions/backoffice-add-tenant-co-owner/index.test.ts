import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as OTPAuth from "npm:otpauth@9.2.2";
import { handleAddTenantCoOwner } from "./index.ts";

// handleAddTenantCoOwner is the extracted, dependency-injected core of this
// function (see index.ts) — driven here with a mock admin/authClient
// following the pattern established for backoffice-add-tenant-owner.

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
const owner1 = { userId: "owner-1", full_name: "Ama Mensah", email: "ama@example.com" };
const owner2 = { userId: "owner-2", full_name: "Kofi Osei", email: "kofi@example.com" };

function singleChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

interface Options {
  boUser?: { role: string; is_active: boolean; totp_secret: string; totp_enabled: boolean } | null;
  owners: Array<{ userId: string; full_name: string; email: string }>;
  availability?: { available: boolean; reason?: string; note?: string };
  existingAuthUser?: { id: string; user_metadata?: Record<string, unknown> } | null;
  grantResult?: { data: unknown; error: { message: string } | null };
  createUserFails?: boolean;
}

function createMocks(opts: Options) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const deletedUsers: string[] = [];

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
    rpc: (fn: string, params: Record<string, unknown>) => {
      if (fn === "get_tenant_owners") {
        return Promise.resolve({
          data: opts.owners.map((o) => ({ user_id: o.userId, full_name: o.full_name, email: o.email })),
          error: null,
        });
      }
      if (fn === "check_owner_invite_email") {
        return Promise.resolve({ data: opts.availability ?? { available: true }, error: null });
      }
      if (fn === "get_auth_user_by_email") {
        return Promise.resolve({ data: opts.existingAuthUser ?? null, error: null });
      }
      if (fn === "grant_tenant_co_owner") {
        return Promise.resolve(opts.grantResult ?? { data: { status: "promoted_member", deactivated_roles: ["manager"] }, error: null });
      }
      throw new Error(`Unexpected rpc in test: ${fn} ${JSON.stringify(params)}`);
    },
    auth: {
      admin: {
        createUser: () =>
          opts.createUserFails
            ? Promise.resolve({ data: { user: null }, error: { message: "createUser failed" } })
            : Promise.resolve({ data: { user: { id: "new-co-owner-1" } }, error: null }),
        deleteUser: (id: string) => {
          deletedUsers.push(id);
          return Promise.resolve({ error: null });
        },
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

  return { admin, authClient, inserts, deletedUsers };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    email: "new-co-owner@example.com",
    firstName: "Jane",
    lastName: "Doe",
    confirmedOwnerUserIds: ["owner-1"],
    totpToken: currentTotpToken(),
    ...overrides,
  };
}

Deno.test("non-super-admin is rejected with 403", async () => {
  const { admin, authClient } = createMocks({
    owners: [owner1],
    boUser: { role: "support_agent", is_active: true, totp_secret: TOTP_SECRET, totp_enabled: true },
  });
  const res = await handleAddTenantCoOwner(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 403);
});

Deno.test("bad TOTP is rejected with 401", async () => {
  const { admin, authClient } = createMocks({ owners: [owner1] });
  const res = await handleAddTenantCoOwner(
    makeRequest(baseBody({ totpToken: "000000" })),
    admin,
    authClient,
  );
  assertEquals(res.status, 401);
});

Deno.test("0 owners returns 409 recovery message", async () => {
  const { admin, authClient } = createMocks({ owners: [] });
  const res = await handleAddTenantCoOwner(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Add owner"), true);
});

Deno.test("2 owners returns 409 cap message naming both", async () => {
  const { admin, authClient } = createMocks({ owners: [owner1, owner2] });
  const res = await handleAddTenantCoOwner(
    makeRequest(baseBody({ confirmedOwnerUserIds: ["owner-1", "owner-2"] })),
    admin,
    authClient,
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Ama Mensah"), true);
  assertEquals(body.error.includes("Kofi Osei"), true);
});

Deno.test("stale confirmedOwnerUserIds returns 409", async () => {
  const { admin, authClient } = createMocks({ owners: [owner1] });
  const res = await handleAddTenantCoOwner(
    makeRequest(baseBody({ confirmedOwnerUserIds: ["someone-else"] })),
    admin,
    authClient,
  );
  assertEquals(res.status, 409);
});

Deno.test("already-owner is a 200 no-op", async () => {
  const { admin, authClient, inserts } = createMocks({
    owners: [owner1],
    grantResult: { data: { status: "already_owner" }, error: null },
  });
  const res = await handleAddTenantCoOwner(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "already_owner");
  assertEquals(inserts.find((i) => i.table === "audit_logs"), undefined);
});

Deno.test("target owns another salon returns 409", async () => {
  const { admin, authClient } = createMocks({
    owners: [owner1],
    availability: { available: false, reason: "already_owner_other_tenant" },
  });
  const res = await handleAddTenantCoOwner(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("already owns another salon"), true);
});

Deno.test("happy path returns 200 and writes one co_owner_added audit log", async () => {
  const { admin, authClient, inserts } = createMocks({ owners: [owner1] });
  const res = await handleAddTenantCoOwner(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);

  const auditInserts = inserts.filter((i) => i.table === "audit_logs");
  assertEquals(auditInserts.length, 1);
  assertEquals(auditInserts[0].row.action, "backoffice.co_owner_added");
});

Deno.test("grant_tenant_co_owner failure after account creation deletes the auth user", async () => {
  const { admin, authClient, deletedUsers } = createMocks({
    owners: [owner1],
    grantResult: { data: null, error: { message: "CO_OWNER_CAP_REACHED" } },
  });
  const res = await handleAddTenantCoOwner(makeRequest(baseBody()), admin, authClient);
  assertEquals(res.status, 409);
  assertExists(deletedUsers.find((id) => id === "new-co-owner-1"));
});
