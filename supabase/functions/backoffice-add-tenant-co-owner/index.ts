import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { wrapEmailTemplate, heading, paragraph, smallText, createButton, createCredentialBox, buildFromAddress } from "../_shared/email-template.ts";
import { getSalonAppUrl } from "../_shared/salon-app-url.ts";
import { requireSuperAdminWithFreshTotp } from "../_shared/backoffice-elevated-auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TenantOwner {
  userId: string;
  fullName: string | null;
  email: string;
}

function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  let password = "";
  for (let i = 0; i < 8; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
  for (let i = 0; i < 2; i++) password += specials.charAt(Math.floor(Math.random() * specials.length));
  return password;
}

function buildNewCoOwnerEmail(firstName: string, tenantName: string, loginEmail: string, tempPassword: string, loginLink: string) {
  const content = `
    ${heading(`You're now an owner of ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`The Salon Magik team has set up an account for you as an owner of <strong>${tenantName}</strong>.`)}
    ${paragraph(`Your login email: <strong>${loginEmail}</strong>`)}
    ${paragraph("Temporary password — you'll set a new one on first login:")}
    ${createCredentialBox("Temporary password", tempPassword)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("For your security, you'll be asked to choose a new password the first time you sign in.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildExistingCoOwnerEmail(firstName: string, tenantName: string, loginLink: string) {
  const content = `
    ${heading(`You're now an owner of ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`The Salon Magik team has added <strong>${tenantName}</strong> to your existing account as an owner. Sign in and use the business switcher in the header to jump into it.`)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("If you weren't expecting this, please contact support@salonmagik.com.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildPromotedCoOwnerEmail(firstName: string, tenantName: string, loginLink: string) {
  const content = `
    ${heading(`You're now an owner of ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`The Salon Magik team has upgraded your access at <strong>${tenantName}</strong> to owner.`)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("If you weren't expecting this, please contact support@salonmagik.com.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildExistingOwnerNoticeEmail(newOwnerName: string, tenantName: string) {
  const content = `
    ${heading(`${newOwnerName} now has owner access to ${tenantName}`)}
    ${paragraph(`The Salon Magik team has added <strong>${newOwnerName}</strong> as a second owner of <strong>${tenantName}</strong>, alongside you.`)}
    ${smallText("If you weren't expecting this, please contact support@salonmagik.com.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function ownersEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return;
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [to],
        subject,
        html,
      }),
    });
  } catch (emailError) {
    console.error("[backoffice-add-tenant-co-owner] email send error:", emailError);
  }
}

/**
 * The actual add-co-owner logic, factored out from the serve() handler
 * below so it can be driven directly by a test with an injected
 * admin/authClient (see index.test.ts).
 */
export async function handleAddTenantCoOwner(
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
  // deno-lint-ignore no-explicit-any
  authClient: SupabaseClient<any>,
): Promise<Response> {
  try {
    const { tenantId, email, firstName, lastName, phone, confirmedOwnerUserIds, totpToken } = await req.json();

    if (!tenantId || !email || !totpToken || !Array.isArray(confirmedOwnerUserIds)) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address" }, 400);
    }

    const auth = await requireSuperAdminWithFreshTotp(admin, authClient, totpToken, corsHeaders);
    if (!auth.ok) return auth.response!;
    const caller = auth.caller!;

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: tenant } = await admin.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
    if (!tenant) return json({ error: "Salon not found" }, 404);

    const { data: currentOwnerRows, error: ownersError } = await (admin.rpc as any)("get_tenant_owners", {
      p_tenant_id: tenantId,
    });
    if (ownersError) {
      console.error("[backoffice-add-tenant-co-owner] get_tenant_owners error:", ownersError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
    const currentOwners: TenantOwner[] = (currentOwnerRows || []).map((row: any) => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
    }));

    if (currentOwners.length === 0) {
      return json({ error: 'This salon has no owner yet. Use "Add owner" to assign the first one.' }, 409);
    }
    if (currentOwners.length >= 2) {
      const names = currentOwners.map((o) => o.fullName || o.email).join(", ");
      return json({ error: `This salon already has the maximum of two owners (${names}).` }, 409);
    }

    const currentOwnerIds = currentOwners.map((o) => o.userId);
    if (!ownersEqual(currentOwnerIds, confirmedOwnerUserIds)) {
      return json({
        error: "This salon's owners changed while you were confirming. Reopen the dialog and try again.",
      }, 409);
    }

    const { data: availability, error: availError } = await (admin.rpc as any)(
      "check_owner_invite_email",
      { p_email: normalizedEmail, p_tenant_id: tenantId },
    );
    if (availError) {
      console.error("[backoffice-add-tenant-co-owner] availability check error:", availError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
    if (availability?.available === false && availability.reason === "already_owner_other_tenant") {
      return json({ error: "This email already owns another salon on Salon Magik." }, 409);
    }
    if (availability?.available === false && availability.reason === "existing_account") {
      return json({
        error: "This email has a Salon Magik account under a different role at another salon and can't be made an owner yet.",
      }, 409);
    }
    // reason === "already_owner_this_tenant" deliberately falls through —
    // grant_tenant_co_owner will detect it and respond with the 200
    // already_owner no-op below (AC-7). check_owner_invite_email is for
    // messaging here, not the safety boundary (Validation notes).

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
      if (!firstName?.trim()) {
        return json({ error: "Missing required field: firstName" }, 400);
      }
      if (!lastName?.trim()) {
        return json({ error: "Missing required field: lastName" }, 400);
      }

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
          invited_via: "backoffice_co_owner_add",
        },
      });
      if (createError || !created.user) {
        console.error("[backoffice-add-tenant-co-owner] createUser error:", createError);
        return json({ error: createError?.message || "Failed to create account" }, 500);
      }
      targetUserId = created.user.id;

      // Upsert: a DB trigger on auth.users already creates a stub profiles
      // row, so a plain insert here hits a duplicate-key conflict and
      // silently drops the real name/phone.
      const { error: profileError } = await admin.from("profiles").upsert({
        user_id: targetUserId,
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone || null,
      }, { onConflict: "user_id" });
      if (profileError) console.error("[backoffice-add-tenant-co-owner] profile insert error:", profileError);
    }

    let grantResult: { status: string; deactivated_roles?: string[] };
    try {
      const { data, error } = await (admin.rpc as any)("grant_tenant_co_owner", {
        p_tenant_id: tenantId,
        p_user_id: targetUserId,
      });
      if (error) throw error;
      grantResult = data;
    } catch (grantError: any) {
      console.error("[backoffice-add-tenant-co-owner] grant_tenant_co_owner error:", grantError);
      if (isNewAccount) await admin.auth.admin.deleteUser(targetUserId);

      const message = grantError?.message;
      if (message === "CO_OWNER_CAP_REACHED") {
        const names = currentOwners.map((o) => o.fullName || o.email).join(", ");
        return json({ error: `This salon already has the maximum of two owners (${names}).` }, 409);
      }
      if (message === "CO_OWNER_NO_EXISTING_OWNER") {
        return json({ error: 'This salon has no owner yet. Use "Add owner" to assign the first one.' }, 409);
      }
      if (typeof message === "string" && message.includes("already owns another salon")) {
        return json({ error: "This email already owns another salon on Salon Magik." }, 409);
      }
      return json({ error: "Failed to assign ownership. Please try again." }, 500);
    }

    const displayName = existingAuthUser?.user_metadata?.full_name
      || (isNewAccount ? `${firstName.trim()} ${lastName.trim()}` : normalizedEmail);

    if (grantResult.status === "already_owner") {
      return json({
        success: true,
        status: "already_owner",
        message: `${displayName} is already an owner of this salon. No change was made.`,
        owners: currentOwners,
      });
    }

    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: caller.id,
      action: "backoffice.co_owner_added",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: {
        email: normalizedEmail,
        target_user_id: targetUserId,
        status: grantResult.status,
        deactivated_roles: grantResult.deactivated_roles ?? [],
        prior_owner_user_ids: currentOwnerIds,
      },
    });

    const loginLink = `${getSalonAppUrl(req).replace(/\/+$/, "")}/login`;
    const newOwnerFirstName = isNewAccount ? firstName.trim() : (displayName.split(" ")[0] || displayName);

    if (isNewAccount) {
      await sendEmail(
        normalizedEmail,
        `You're now an owner of ${tenant.name}`,
        buildNewCoOwnerEmail(newOwnerFirstName, tenant.name, normalizedEmail, tempPassword!, loginLink),
      );
    } else if (grantResult.status === "promoted_member") {
      await sendEmail(
        normalizedEmail,
        `You're now an owner of ${tenant.name}`,
        buildPromotedCoOwnerEmail(newOwnerFirstName, tenant.name, loginLink),
      );
    } else {
      await sendEmail(
        normalizedEmail,
        `You're now an owner of ${tenant.name}`,
        buildExistingCoOwnerEmail(newOwnerFirstName, tenant.name, loginLink),
      );
    }

    const existingOwner = currentOwners[0];
    if (existingOwner?.email) {
      await sendEmail(
        existingOwner.email,
        `${displayName} now has owner access to ${tenant.name}`,
        buildExistingOwnerNoticeEmail(displayName, tenant.name),
      );
    }

    return json({
      success: true,
      status: grantResult.status,
      owners: [...currentOwners, { userId: targetUserId, fullName: displayName, email: normalizedEmail }],
    });
  } catch (error: unknown) {
    console.error("backoffice-add-tenant-co-owner error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  return await handleAddTenantCoOwner(req, admin, authClient);
});
