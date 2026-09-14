// Integration repro for the backoffice co-owner grant being permanently
// broken (docs/research/2026-09-14-backoffice-co-owner-grant-broken.md).
//
// Unlike index.test.ts — which mocks admin.rpc and therefore never exercises
// real Postgres auth.uid()/RLS semantics — this drives the real
// handleAddTenantCoOwner against a live local Supabase stack with a real
// service-role client and a real caller JWT. That is the only way to observe
// the defect: get_tenant_owners self-gates on auth.uid(), which is NULL under
// a service-role JWT, so the call at index.ts:143 always raises
// BACKOFFICE_ACCESS_DENIED and the function returns a generic 500.
//
// Requires a running local stack:
//   supabase start
//   deno test -A supabase/functions/backoffice-add-tenant-co-owner/index.integration.test.ts
//
// Not run by CI (ci.yml runs pnpm test only; no deno step).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as OTPAuth from "npm:otpauth@9.2.2";
import { handleAddTenantCoOwner } from "./index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const SA_PASSWORD = "Sup3rAdmin!Pass123";

interface Fixture {
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>;
  // deno-lint-ignore no-explicit-any
  authClient: SupabaseClient<any>;
  tenantId: string;
  existingOwnerUserId: string;
  /** A signed-in user with no backoffice role at all. */
  // deno-lint-ignore no-explicit-any
  outsiderClient: SupabaseClient<any>;
  totpToken: () => string;
  newCoOwnerEmail: string;
}

/** Seeds a salon with exactly one owner plus a super_admin backoffice caller. */
async function seed(tag: string): Promise<Fixture> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const stamp = `${tag}-${Date.now()}`;
  const saEmail = `sa-${stamp}@backoffice.test`;
  const totpSecret = new OTPAuth.Secret({ size: 20 }).base32;

  const { data: saUser, error: saErr } = await admin.auth.admin.createUser({
    email: saEmail, password: SA_PASSWORD, email_confirm: true,
  });
  if (saErr) throw saErr;

  const { error: boErr } = await admin.from("backoffice_users").insert({
    user_id: saUser.user.id,
    role: "super_admin",
    email_domain: "backoffice.test",
    email: saEmail,
    totp_secret: totpSecret,
    totp_enabled: true,
    is_active: true,
  });
  if (boErr) throw boErr;

  const { data: ownerUser, error: ouErr } = await admin.auth.admin.createUser({
    email: `owner-${stamp}@salon.test`, password: "Owner!Pass123", email_confirm: true,
  });
  if (ouErr) throw ouErr;

  const { data: tenant, error: tErr } = await admin.from("tenants")
    .insert({ name: `Repro Salon ${stamp}`, country: "GH", currency: "GHS" })
    .select("id").single();
  if (tErr) throw tErr;

  const { error: urErr } = await admin.from("user_roles").insert({
    user_id: ownerUser.user.id, tenant_id: tenant.id, role: "owner", is_active: true,
  });
  if (urErr) throw urErr;

  await admin.from("profiles").upsert(
    { user_id: ownerUser.user.id, full_name: "Existing Owner" }, { onConflict: "user_id" });

  const loginClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: session, error: siErr } = await loginClient.auth.signInWithPassword({
    email: saEmail, password: SA_PASSWORD,
  });
  if (siErr) throw siErr;

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
    auth: { persistSession: false },
  });

  const { error: outErr } = await admin.auth.admin.createUser({
    email: `outsider-${stamp}@example.test`, password: "Outsider!Pass123", email_confirm: true,
  });
  if (outErr) throw outErr;
  const outsiderLogin = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: outSession, error: outSiErr } = await outsiderLogin.auth.signInWithPassword({
    email: `outsider-${stamp}@example.test`, password: "Outsider!Pass123",
  });
  if (outSiErr) throw outSiErr;
  const outsiderClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${outSession.session!.access_token}` } },
    auth: { persistSession: false },
  });

  const totp = new OTPAuth.TOTP({
    issuer: "SalonMagik", label: saEmail, algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(totpSecret),
  });

  return {
    admin,
    authClient,
    tenantId: tenant.id,
    existingOwnerUserId: ownerUser.user.id,
    outsiderClient,
    totpToken: () => totp.generate(),
    newCoOwnerEmail: `coowner-${stamp}@salon.test`,
  };
}

function addCoOwnerRequest(f: Fixture): Request {
  return new Request("http://localhost/backoffice-add-tenant-co-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: f.tenantId,
      email: f.newCoOwnerEmail,
      firstName: "New",
      lastName: "CoOwner",
      confirmedOwnerUserIds: [f.existingOwnerUserId],
      totpToken: f.totpToken(),
    }),
  });
}

// The defect, stated as the behaviour that must hold once it is fixed: an
// authorized super_admin adding a second owner to a one-owner salon succeeds.
Deno.test("a super_admin can grant co-ownership end-to-end", async () => {
  const f = await seed("grant");

  const res = await handleAddTenantCoOwner(addCoOwnerRequest(f), f.admin, f.authClient);
  const body = await res.json();

  assertEquals(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assertEquals(body.success, true);

  const { data: owners } = await f.admin.from("user_roles")
    .select("user_id, role, is_active")
    .eq("tenant_id", f.tenantId).eq("role", "owner").eq("is_active", true);
  assertEquals(owners?.length, 2, "the salon should now have two active owners");
});

// The invariants that must survive whichever way the fix goes. The defect is
// that a legitimate caller is denied, so the tempting fix is to loosen or drop
// get_tenant_owners' self-gate — PUBLIC holds EXECUTE on this function by
// default (the `grant ... to authenticated` in the migration restricts
// nothing), so that gate is the only thing standing between an anonymous
// caller and every salon's owner roster.
Deno.test("get_tenant_owners stays closed to everyone but a super_admin caller", async () => {
  const f = await seed("gate");

  // A real super_admin, through their own JWT: must work. This is the
  // backoffice dialog's path (AddCoOwnerDialog.tsx) and is not part of the bug.
  // deno-lint-ignore no-explicit-any
  const viaSuperAdmin = await (f.authClient.rpc as any)("get_tenant_owners", { p_tenant_id: f.tenantId });
  assertEquals(
    viaSuperAdmin.error,
    null,
    `a real super_admin's own JWT must pass the gate: ${JSON.stringify(viaSuperAdmin.error)}`,
  );
  assertEquals(viaSuperAdmin.data?.length, 1);

  // Anonymous: must be denied.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  const viaAnon = await (anon.rpc as any)("get_tenant_owners", { p_tenant_id: f.tenantId });
  assertEquals(viaAnon.data, null, "anon must not read the owner roster");
  assertEquals(viaAnon.error?.message, "BACKOFFICE_ACCESS_DENIED");

  // A signed-in user who is not a backoffice super_admin: must be denied.
  // deno-lint-ignore no-explicit-any
  const viaOutsider = await (f.outsiderClient.rpc as any)("get_tenant_owners", { p_tenant_id: f.tenantId });
  assertEquals(viaOutsider.data, null, "a non-super-admin signed-in user must not read the owner roster");
  assertEquals(viaOutsider.error?.message, "BACKOFFICE_ACCESS_DENIED");
});
