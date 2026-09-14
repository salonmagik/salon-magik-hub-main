import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRevokeCoOwnerInvitation } from "./index.ts";

function eqChain(terminal: () => Promise<unknown>) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.single = () => terminal();
  chain.maybeSingle = () => terminal();
  chain.limit = () => terminal();
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => terminal().then(resolve, reject);
  return chain;
}

function baseInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invitation-1",
    tenant_id: "tenant-1",
    user_id: "invitee-1",
    first_name: "Ama",
    email: "ama@example.com",
    status: "pending",
    role: "owner",
    ...overrides,
  };
}

interface Options {
  invitation?: Record<string, unknown> | null;
  isOwner?: boolean;
  roleRows?: Array<{ id: string; is_active: boolean | null }>;
  targetUser?: { user_metadata?: Record<string, unknown> } | null;
  tenant?: { name: string };
}

function createMocks(opts: Options) {
  const invitationUpdates: Array<Record<string, unknown>> = [];
  const deletedUserIds: string[] = [];
  const updatedUsers: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const auditInserts: Array<Record<string, unknown>> = [];

  const admin = {
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: opts.targetUser === undefined ? { user_metadata: { invited_via: "co_owner_invite" } } : opts.targetUser } }),
        deleteUser: (id: string) => {
          deletedUserIds.push(id);
          return Promise.resolve({ data: {}, error: null });
        },
        updateUserById: (id: string, payload: Record<string, unknown>) => {
          updatedUsers.push({ id, payload });
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
    from(table: string) {
      if (table === "staff_invitations") {
        return {
          select: () =>
            eqChain(() =>
              Promise.resolve({
                data: opts.invitation === undefined ? baseInvitation() : opts.invitation,
                error: null,
              }),
            ),
          update: (row: Record<string, unknown>) => {
            invitationUpdates.push(row);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      if (table === "user_roles") {
        return eqChain(() => Promise.resolve({ data: opts.roleRows ?? [], error: null }));
      }
      if (table === "tenants") {
        return eqChain(() => Promise.resolve({ data: opts.tenant ?? { name: "Sunset Salon" }, error: null }));
      }
      if (table === "audit_logs") {
        return {
          insert: (row: Record<string, unknown>) => {
            auditInserts.push(row);
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
        return Promise.resolve({ data: [{ user_id: "owner-1", full_name: "Owner One", email: "owner1@example.com" }], error: null });
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "owner-1" } }, error: null }),
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { admin, supabase, invitationUpdates, deletedUserIds, updatedUsers, auditInserts };
}

function makeRequest(body: Record<string, unknown> = { invitationId: "invitation-1" }) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

Deno.test("non-owner caller is rejected with 403", async () => {
  const { admin, supabase } = createMocks({ isOwner: false });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 403);
});

Deno.test("invitation not found returns 404", async () => {
  const { admin, supabase } = createMocks({ invitation: null });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 404);
});

Deno.test("not-pending invitation returns 409", async () => {
  const { admin, supabase } = createMocks({ invitation: baseInvitation({ status: "accepted" }) });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 409);
});

Deno.test("account created by this invite with no active role is deleted", async () => {
  const { admin, supabase, deletedUserIds, invitationUpdates } = createMocks({
    roleRows: [],
    targetUser: { user_metadata: { invited_via: "co_owner_invite" } },
  });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 200);
  assertEquals(deletedUserIds, ["invitee-1"]);
  assertEquals(invitationUpdates[0].status, "cancelled");
});

Deno.test("account preserved when the user holds any active role", async () => {
  const { admin, supabase, deletedUserIds, updatedUsers } = createMocks({
    roleRows: [{ id: "r1", is_active: true }],
    targetUser: { user_metadata: { invited_via: "co_owner_invite" } },
  });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 200);
  assertEquals(deletedUserIds.length, 0);
  const metaUpdate = updatedUsers.find((u) => u.id === "invitee-1");
  assertEquals((metaUpdate?.payload.user_metadata as Record<string, unknown>)?.pending_co_owner_invite, false);
});

Deno.test("account preserved when it was not created by this invitation", async () => {
  const { admin, supabase, deletedUserIds } = createMocks({
    roleRows: [],
    targetUser: { user_metadata: { invited_via: "staff_invitation" } },
  });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 200);
  assertEquals(deletedUserIds.length, 0);
});

Deno.test("a null is_active row still counts as active (coalesce true)", async () => {
  const { admin, supabase, deletedUserIds } = createMocks({
    roleRows: [{ id: "r1", is_active: null }],
    targetUser: { user_metadata: { invited_via: "co_owner_invite" } },
  });
  const res = await handleRevokeCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 200);
  assertEquals(deletedUserIds.length, 0);
});
