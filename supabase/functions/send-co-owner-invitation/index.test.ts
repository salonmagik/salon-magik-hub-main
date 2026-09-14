import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleSendCoOwnerInvitation } from "./index.ts";

const caller = { id: "owner-1", email: "owner1@example.com" };

function eqChain(terminal: () => unknown) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.select = () => chain;
  chain.limit = () => terminal();
  chain.single = () => terminal();
  chain.maybeSingle = () => terminal();
  return chain;
}

interface Options {
  isOwner?: boolean;
  tenant?: { name: string } | null;
  owners?: Array<{ user_id: string; full_name: string | null; email: string }>;
  existingPending?: { id: string } | null;
  availability?: { available: boolean; reason?: string; note?: string };
  existingAuthUser?: { id: string; user_metadata?: Record<string, unknown> } | null;
  createUserResult?: { data: { user: { id: string } } | null; error: { message: string } | null };
  insertInvitationResult?: { data: { id: string } | null; error: { code?: string; message?: string } | null };
}

function createMocks(opts: Options) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const deletedUserIds: string[] = [];
  const updatedUsers: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const admin = {
    auth: {
      admin: {
        createUser: (payload: Record<string, unknown>) =>
          Promise.resolve(
            opts.createUserResult ?? { data: { user: { id: "new-user-1" } }, error: null },
          ),
        updateUserById: (id: string, payload: Record<string, unknown>) => {
          updatedUsers.push({ id, payload });
          return Promise.resolve({ data: {}, error: null });
        },
        deleteUser: (id: string) => {
          deletedUserIds.push(id);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
    from(table: string) {
      if (table === "tenants") {
        return eqChain(() =>
          Promise.resolve({
            data: opts.tenant === undefined ? { name: "Sunset Salon" } : opts.tenant,
            error: null,
          }),
        );
      }
      if (table === "staff_invitations") {
        return {
          select: () => eqChain(() => Promise.resolve({ data: opts.existingPending ?? null, error: null })),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve(
                  opts.insertInvitationResult ?? { data: { id: "invitation-1" }, error: null },
                ),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return { upsert: () => Promise.resolve({ data: null, error: null }) };
      }
      if (table === "audit_logs" || table === "message_logs") {
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
      if (fn === "is_tenant_owner") {
        return Promise.resolve({ data: opts.isOwner ?? true, error: null });
      }
      if (fn === "list_tenant_owners_service") {
        return Promise.resolve({
          data: opts.owners ?? [{ user_id: "owner-1", full_name: "Owner One", email: "owner1@example.com" }],
          error: null,
        });
      }
      if (fn === "check_owner_invite_email") {
        return Promise.resolve({ data: opts.availability ?? { available: true }, error: null });
      }
      if (fn === "get_auth_user_by_email") {
        return Promise.resolve({ data: opts.existingAuthUser ?? null, error: null });
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: caller }, error: null }),
    },
    from(table: string) {
      if (table === "user_roles") {
        return eqChain(() => Promise.resolve({ data: [{ tenant_id: "tenant-1" }], error: null }));
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { admin, supabase, inserts, deletedUserIds, updatedUsers };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:8000", {
    method: "POST",
    headers: { origin: "https://app.salonmagik.com" },
    body: JSON.stringify(body),
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    email: "invitee@example.com",
    firstName: "Ama",
    lastName: "Mensah",
    ...overrides,
  };
}

Deno.test("non-owner caller is rejected with 403", async () => {
  const { admin, supabase } = createMocks({ isOwner: false });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 403);
});

Deno.test("tenant_id from the body is ignored — resolved from the caller's own membership", async () => {
  const { admin, supabase, inserts } = createMocks({});
  const res = await handleSendCoOwnerInvitation(
    makeRequest(baseBody({ tenant_id: "attacker-tenant" })),
    supabase,
    admin,
  );
  assertEquals(res.status, 200);
  const auditRow = inserts.find((i) => i.table === "audit_logs");
  assertEquals(auditRow?.row.tenant_id, "tenant-1");
});

Deno.test("self-invite is rejected with 409", async () => {
  const { admin, supabase } = createMocks({});
  const res = await handleSendCoOwnerInvitation(
    makeRequest(baseBody({ email: "OWNER1@example.com" })),
    supabase,
    admin,
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "You already own this salon.");
});

Deno.test("zero owners returns 409", async () => {
  const { admin, supabase } = createMocks({ owners: [] });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
});

Deno.test("two owners already: cap reached returns 409 with names", async () => {
  const { admin, supabase } = createMocks({
    owners: [
      { user_id: "o1", full_name: "Ama Mensah", email: "ama@example.com" },
      { user_id: "o2", full_name: "Kofi Osei", email: "kofi@example.com" },
    ],
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Ama Mensah"), true);
  assertEquals(body.error.includes("Kofi Osei"), true);
});

Deno.test("pending owner invitation invitation outstanding returns 409", async () => {
  const { admin, supabase } = createMocks({ existingPending: { id: "existing-1" } });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("invitation outstanding"), true);
});

Deno.test("already_owner_this_tenant maps to its message", async () => {
  const { admin, supabase } = createMocks({
    availability: { available: false, reason: "already_owner_this_tenant" },
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "That person already owns this salon.");
});

Deno.test("already_owner_other_tenant maps to its message", async () => {
  const { admin, supabase } = createMocks({
    availability: { available: false, reason: "already_owner_other_tenant" },
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Contact Salon Magik"), true);
});

Deno.test("existing_account maps to its message", async () => {
  const { admin, supabase } = createMocks({
    availability: { available: false, reason: "existing_account" },
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, "That email can't be invited as an owner. Contact Salon Magik.");
});

Deno.test("new account: creates a user and returns status 'invited'", async () => {
  const { admin, supabase } = createMocks({ existingAuthUser: null });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "invited");
});

Deno.test("existing member: promotes in place and returns status 'invited_existing_member'", async () => {
  const { admin, supabase, updatedUsers } = createMocks({
    availability: { available: true, note: "existing_member" },
    existingAuthUser: { id: "member-1", user_metadata: { full_name: "Existing Member" } },
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "invited_existing_member");
  const metaUpdate = updatedUsers.find((u) => u.id === "member-1");
  assertEquals((metaUpdate?.payload.user_metadata as Record<string, unknown>)?.pending_co_owner_invite, true);
});

Deno.test("account is deleted when the invitation insert fails after creating it", async () => {
  const { admin, supabase, deletedUserIds } = createMocks({
    existingAuthUser: null,
    createUserResult: { data: { user: { id: "rollback-user" } }, error: null },
    insertInvitationResult: { data: null, error: { message: "boom" } },
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 500);
  assertEquals(deletedUserIds.includes("rollback-user"), true);
});

Deno.test("a 23505 on the insert maps to the 'invitation outstanding' message", async () => {
  const { admin, supabase } = createMocks({
    existingAuthUser: null,
    insertInvitationResult: { data: null, error: { code: "23505" } },
  });
  const res = await handleSendCoOwnerInvitation(makeRequest(baseBody()), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("invitation outstanding"), true);
});
