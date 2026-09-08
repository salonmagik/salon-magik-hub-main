// Shared preamble for backoffice actions that assign ownership of a
// business — a different tier of consequence than the rest of what
// backoffice does. Deliberately restricted to super_admin only, not the
// usual backoffice permission-template system, and deliberately requires a
// *fresh* TOTP code every time rather than reusing the session-level
// "already verified this session" flag the rest of backoffice relies on.
//
// Extracted from backoffice-add-tenant-owner so the co-owner grant function
// shares the exact same check rather than a copy that can drift — drift
// here is a privilege escalation (AD-8).

import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import * as OTPAuth from "npm:otpauth@9.2.2";

export interface ElevatedAuthResult {
  ok: boolean;
  caller?: Pick<User, "id" | "email">;
  /** Set only when `ok` is false; the caller's ready-to-return Response. */
  response?: Response;
}

function json(body: object, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export async function requireSuperAdminWithFreshTotp(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
  // deno-lint-ignore no-explicit-any
  authClient: SupabaseClient<any>,
  totpToken: string,
  corsHeaders: Record<string, string>,
): Promise<ElevatedAuthResult> {
  const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
  if (callerError || !caller) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401, corsHeaders) };
  }

  const { data: boUser, error: boError } = await admin
    .from("backoffice_users")
    .select("id, role, is_active, totp_secret, totp_enabled")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (boError || !boUser || boUser.role !== "super_admin" || boUser.is_active === false) {
    return { ok: false, response: json({ error: "Super admin access required" }, 403, corsHeaders) };
  }

  if (!boUser.totp_enabled || !boUser.totp_secret) {
    return { ok: false, response: json({ error: "TOTP is not configured for your account" }, 400, corsHeaders) };
  }

  const totp = new OTPAuth.TOTP({
    issuer: "SalonMagik",
    label: caller.email || "BackOffice",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(boUser.totp_secret),
  });
  if (totp.validate({ token: totpToken, window: 1 }) === null) {
    return { ok: false, response: json({ error: "Invalid verification code" }, 401, corsHeaders) };
  }

  return { ok: true, caller };
}
