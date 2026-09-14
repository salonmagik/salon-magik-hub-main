import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAcceptCoOwnerInvitation } from "./index.ts";

function eqChain(terminal: () => unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.single = () => terminal();
  chain.maybeSingle = () => terminal();
  return chain;
}

interface Options {
  user?: { id: string; user_metadata?: Record<string, unknown> };
  invitation?: Record<string, unknown> | null;
  grantResult?: { data: { status: string } | null; error: { message: string } | null };
  tenant?: { name: string };
  owners?: Array<{ user_id: string; full_name: string | null; email: string }>;
}

function baseInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invitation-1",
    tenant_id: "tenant-1",
    user_id: "invitee-1",
    first_name: "Ama",
    last_name: "Mensah",
    email: "ama@example.com",
    temp_password: "TempPass1!",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: "pending",
    role: "owner",
    ...overrides,
  };
}

function createMocks(opts: Options) {
  const updatedUsers: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const invitationUpdates: Array<Record<string, unknown>> = [];
  const auditInserts: Array<Record<string, unknown>> = [];

  const user = opts.user ?? { id: "invitee-1", user_metadata: { requires_password_change: true } };

  const admin = {
    auth: {
      admin: {
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
      if (table === "audit_logs") {
        return {
          insert: (row: Record<string, unknown>) => {
            auditInserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "tenants") {
        return eqChain(() => Promise.resolve({ data: opts.tenant ?? { name: "Sunset Salon" }, error: null }));
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
    rpc: (fn: string) => {
      if (fn === "grant_tenant_co_owner") {
        return Promise.resolve(opts.grantResult ?? { data: { status: "granted" }, error: null });
      }
      if (fn === "list_tenant_owners_service") {
        return Promise.resolve({
          data: opts.owners ?? [{ user_id: "owner-1", full_name: "Owner One", email: "owner1@example.com" }],
          error: null,
        });
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  const supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { admin, supabase, updatedUsers, invitationUpdates, auditInserts };
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request("http://localhost:8000", { method: "POST", body: JSON.stringify(body) });
}

Deno.test("no pending invitation returns 409", async () => {
  const { admin, supabase } = createMocks({ invitation: null });
  const res = await handleAcceptCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 409);
});

Deno.test("expired invitation is refused", async () => {
  const { admin, supabase } = createMocks({
    invitation: baseInvitation({ expires_at: new Date(Date.now() - 1000).toISOString() }),
  });
  const res = await handleAcceptCoOwnerInvitation(makeRequest(), supabase, admin);
  assertEquals(res.status, 409);
});

Deno.test("password required only when requires_password_change is true", async () => {
  const { admin, supabase } = createMocks({
    user: { id: "invitee-1", user_metadata: {} },
  });
  const res = await handleAcceptCoOwnerInvitation(makeRequest({}), supabase, admin);
  assertEquals(res.status, 200);
});

Deno.test("missing password when required returns 400", async () => {
  const { admin, supabase } = createMocks({});
  const res = await handleAcceptCoOwnerInvitation(makeRequest({}), supabase, admin);
  assertEquals(res.status, 400);
});

Deno.test("reused temp password is refused", async () => {
  const { admin, supabase } = createMocks({});
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "TempPass1!" }), supabase, admin);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.includes("cannot reuse"), true);
});

Deno.test("weak password is refused", async () => {
  const { admin, supabase } = createMocks({});
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "weak" }), supabase, admin);
  assertEquals(res.status, 400);
});

Deno.test("grant is attempted before the password change, and a failed grant leaves it untouched", async () => {
  const { admin, supabase, updatedUsers, invitationUpdates } = createMocks({
    grantResult: { data: null, error: { message: "CO_OWNER_CAP_REACHED" } },
  });
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "NewPassword1!" }), supabase, admin);
  assertEquals(res.status, 409);
  assertEquals(updatedUsers.length, 0);
  assertEquals(invitationUpdates.length, 0);
});

Deno.test("CO_OWNER_NO_EXISTING_OWNER maps to its message", async () => {
  const { admin, supabase } = createMocks({
    grantResult: { data: null, error: { message: "CO_OWNER_NO_EXISTING_OWNER" } },
  });
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "NewPassword1!" }), supabase, admin);
  assertEquals(res.status, 409);
});

Deno.test("cross-salon substring match maps to its message", async () => {
  const { admin, supabase } = createMocks({
    grantResult: { data: null, error: { message: "This account already owns another salon. Each owner can only own one active salon at a time." } },
  });
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "NewPassword1!" }), supabase, admin);
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error.includes("Contact Salon Magik"), true);
});

Deno.test("already_owner is treated as success", async () => {
  const { admin, supabase, invitationUpdates } = createMocks({
    grantResult: { data: { status: "already_owner" }, error: null },
  });
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "NewPassword1!" }), supabase, admin);
  assertEquals(res.status, 200);
  assertEquals(invitationUpdates.length, 1);
  assertEquals(invitationUpdates[0].status, "accepted");
});

Deno.test("body-supplied user id is ignored — invitation is looked up by the JWT user", async () => {
  const { admin, supabase } = createMocks({});
  const res = await handleAcceptCoOwnerInvitation(
    makeRequest({ newPassword: "NewPassword1!", userId: "someone-else" }),
    supabase,
    admin,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.tenantId, "tenant-1");
});

Deno.test("happy path sets password, clears metadata, and flips the invitation", async () => {
  const { admin, supabase, updatedUsers, invitationUpdates } = createMocks({});
  const res = await handleAcceptCoOwnerInvitation(makeRequest({ newPassword: "NewPassword1!" }), supabase, admin);
  assertEquals(res.status, 200);
  assertEquals(updatedUsers[0].payload.password, "NewPassword1!");
  assertEquals((updatedUsers[0].payload.user_metadata as Record<string, unknown>).pending_co_owner_invite, false);
  assertEquals((updatedUsers[0].payload.user_metadata as Record<string, unknown>).requires_password_change, false);
  assertEquals(invitationUpdates[0].status, "accepted");
  assertEquals(invitationUpdates[0].temp_password, null);
});

Deno.test("promote-in-place (no password) does not touch the password field", async () => {
  const { admin, supabase, updatedUsers } = createMocks({
    user: { id: "invitee-1", user_metadata: {} },
  });
  await handleAcceptCoOwnerInvitation(makeRequest({}), supabase, admin);
  assertEquals("password" in updatedUsers[0].payload, false);
});
