import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireTenantRole, resolveTenantRoles } from "./tenant-auth.ts";

interface Row {
  role: string;
  is_active: boolean | null;
}

function mockClient(rows: Row[]) {
  return {
    from(_table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      // resolveTenantRoles awaits the builder directly (no terminal call),
      // so the chain itself must be thenable.
      (chain as any).then = (resolve: (v: unknown) => void) =>
        resolve({ data: rows, error: null });
      return chain;
    },
  };
}

const corsHeaders = { "Access-Control-Allow-Origin": "*" };
const forbidden = { error: "not allowed" };

Deno.test("resolveTenantRoles: single owner row -> [owner]", async () => {
  const client = mockClient([{ role: "owner", is_active: true }]);
  assertEquals(await resolveTenantRoles(client, "u1", "t1"), ["owner"]);
});

Deno.test("resolveTenantRoles: owner + manager rows -> both (F-2 regression)", async () => {
  const client = mockClient([
    { role: "owner", is_active: true },
    { role: "manager", is_active: true },
  ]);
  assertEquals(await resolveTenantRoles(client, "u1", "t1"), ["owner", "manager"]);
});

Deno.test("resolveTenantRoles: inactive owner row is excluded", async () => {
  const client = mockClient([{ role: "owner", is_active: false }]);
  assertEquals(await resolveTenantRoles(client, "u1", "t1"), []);
});

Deno.test("resolveTenantRoles: no rows -> []", async () => {
  const client = mockClient([]);
  assertEquals(await resolveTenantRoles(client, "u1", "t1"), []);
});

Deno.test("requireTenantRole: owner + manager rows, allowed=[owner] -> ok", async () => {
  const client = mockClient([
    { role: "owner", is_active: true },
    { role: "manager", is_active: true },
  ]);
  const result = await requireTenantRole(client, "u1", "t1", ["owner"], forbidden, corsHeaders);
  assertEquals(result.ok, true);
  assertEquals(result.role, "owner");
});

Deno.test("requireTenantRole: manager only, allowed=[owner] -> denied", async () => {
  const client = mockClient([{ role: "manager", is_active: true }]);
  const result = await requireTenantRole(client, "u1", "t1", ["owner"], forbidden, corsHeaders);
  assertEquals(result.ok, false);
  assertEquals(result.response?.status, 403);
});

Deno.test("requireTenantRole: inactive owner row -> denied", async () => {
  const client = mockClient([{ role: "owner", is_active: false }]);
  const result = await requireTenantRole(client, "u1", "t1", ["owner"], forbidden, corsHeaders);
  assertEquals(result.ok, false);
});

Deno.test("requireTenantRole: no rows -> denied", async () => {
  const client = mockClient([]);
  const result = await requireTenantRole(client, "u1", "t1", ["owner", "manager", "supervisor"], forbidden, corsHeaders);
  assertEquals(result.ok, false);
});
