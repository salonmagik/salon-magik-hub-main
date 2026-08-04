import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as OTPAuth from "npm:otpauth@9.2.2";
import { wrapEmailTemplate, heading, paragraph, smallText, createButton, createCredentialBox, buildFromAddress } from "../_shared/email-template.ts";
import { getSalonAppUrl } from "../_shared/salon-app-url.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  let password = "";
  for (let i = 0; i < 8; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
  for (let i = 0; i < 2; i++) password += specials.charAt(Math.floor(Math.random() * specials.length));
  return password;
}

function buildNewOwnerEmail(firstName: string, tenantName: string, loginEmail: string, tempPassword: string, loginLink: string) {
  const content = `
    ${heading(`You're now the owner of ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`The Salon Magik team has set up an account for you as the owner of <strong>${tenantName}</strong>.`)}
    ${paragraph(`Your login email: <strong>${loginEmail}</strong>`)}
    ${paragraph("Temporary password — you'll set a new one on first login:")}
    ${createCredentialBox("Temporary password", tempPassword)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("For your security, you'll be asked to choose a new password the first time you sign in.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildExistingOwnerEmail(firstName: string, tenantName: string, loginLink: string) {
  const content = `
    ${heading(`You're now the owner of ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`The Salon Magik team has added <strong>${tenantName}</strong> to your existing account. Sign in and use the business switcher in the header to jump into it.`)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("If you weren't expecting this, please contact support@salonmagik.com.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) return json({ error: "Unauthorized" }, 401);

    // This action is deliberately restricted to super_admin only, not the
    // usual backoffice permission-template system — assigning ownership of
    // a business is a different tier of consequence than the rest of what
    // backoffice does.
    const { data: boUser, error: boError } = await admin
      .from("backoffice_users")
      .select("id, role, is_active, totp_secret, totp_enabled")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (boError || !boUser || boUser.role !== "super_admin" || boUser.is_active === false) {
      return json({ error: "Super admin access required" }, 403);
    }

    const { tenantId, email, firstName, lastName, phone, totpToken } = await req.json();
    if (!tenantId || !email || !firstName?.trim() || !lastName?.trim() || !totpToken) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address" }, 400);
    }

    // Fresh 2FA re-validation — deliberately not reusing the session-level
    // "already verified TOTP this session" flag the rest of backoffice
    // relies on. Assigning ownership gets its own check, every time.
    if (!boUser.totp_enabled || !boUser.totp_secret) {
      return json({ error: "TOTP is not configured for your account" }, 400);
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
      return json({ error: "Invalid verification code" }, 401);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: tenant } = await admin.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
    if (!tenant) return json({ error: "Salon not found" }, 404);

    // This action is for salons missing an owner only — not for
    // reassigning ownership away from an existing one.
    const { data: existingOwnerRoles } = await admin
      .from("user_roles")
      .select("id, is_active")
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((existingOwnerRoles || []).some((r) => r.is_active ?? true)) {
      return json({ error: "This salon already has an owner." }, 409);
    }

    const { data: availability, error: availError } = await (admin.rpc as any)(
      "check_owner_invite_email",
      { p_email: normalizedEmail },
    );
    if (availError) {
      console.error("[backoffice-add-tenant-owner] availability check error:", availError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
    if (availability?.available === false) {
      return json({
        error:
          availability.reason === "already_owner"
            ? "This email already owns another salon on Salon Magik."
            : "This email already has a Salon Magik account under a different role.",
      }, 409);
    }

    const { data: existingAuthUser } = await (admin.rpc as any)("get_auth_user_by_email", {
      lookup_email: normalizedEmail,
    });

    let targetUserId: string;
    let isNewAccount = false;
    let tempPassword: string | null = null;

    if (existingAuthUser?.id) {
      targetUserId = existingAuthUser.id;
    } else {
      isNewAccount = true;
      tempPassword = generateSecurePassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          requires_password_change: true,
          invited_via: "backoffice_owner_add",
        },
      });
      if (createError || !created.user) {
        console.error("[backoffice-add-tenant-owner] createUser error:", createError);
        return json({ error: createError?.message || "Failed to create account" }, 500);
      }
      targetUserId = created.user.id;

      const { error: profileError } = await admin.from("profiles").insert({
        user_id: targetUserId,
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone || null,
      });
      if (profileError) console.error("[backoffice-add-tenant-owner] profile insert error:", profileError);
    }

    const { error: roleError } = await admin.from("user_roles").insert({
      user_id: targetUserId,
      tenant_id: tenantId,
      role: "owner",
      is_active: true,
    });
    if (roleError) {
      console.error("[backoffice-add-tenant-owner] role insert error:", roleError);
      if (isNewAccount) await admin.auth.admin.deleteUser(targetUserId);
      return json({
        error: roleError.message?.includes("already owns")
          ? "This email already owns another salon on Salon Magik."
          : "Failed to assign ownership. Please try again.",
      }, 500);
    }

    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: caller.id,
      action: "backoffice.owner_added",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: { email: normalizedEmail, mode: isNewAccount ? "new_account" : "existing_account" },
    });

    if (RESEND_API_KEY) {
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
      const loginLink = `${getSalonAppUrl(req).replace(/\/+$/, "")}/login`;
      const html = isNewAccount
        ? buildNewOwnerEmail(firstName.trim(), tenant.name, normalizedEmail, tempPassword!, loginLink)
        : buildExistingOwnerEmail(firstName.trim(), tenant.name, loginLink);

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: buildFromAddress({ mode: "product", fromEmail }),
            to: [normalizedEmail],
            subject: `You're now the owner of ${tenant.name}`,
            html,
          }),
        });
      } catch (emailError) {
        console.error("[backoffice-add-tenant-owner] email send error:", emailError);
      }
    }

    return json({ success: true, mode: isNewAccount ? "new_account" : "existing_account" });
  } catch (error: unknown) {
    console.error("backoffice-add-tenant-owner error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
