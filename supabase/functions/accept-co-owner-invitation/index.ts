import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { wrapEmailTemplate, heading, paragraph, smallText } from "../_shared/email-template.ts";
import { buildFromAddress } from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Same regex complete-password-change uses (Validation: "same regex
// complete-password-change uses").
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;

interface AcceptRequest {
  newPassword?: string;
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function buildOwnerNoticeEmail(newOwnerName: string, tenantName: string) {
  const content = `
    ${heading(`${newOwnerName} accepted co-ownership of ${tenantName}`)}
    ${paragraph(`<strong>${newOwnerName}</strong> has accepted the invitation to become a co-owner of <strong>${tenantName}</strong>.`)}
    ${smallText("If you weren't expecting this, please contact support@salonmagik.com.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
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
    console.error("[accept-co-owner-invitation] email send error:", emailError);
  }
}

/**
 * Dependency-injected core, modelled on backoffice-add-tenant-co-owner and
 * send-co-owner-invitation so it can be driven directly by a test.
 */
export async function handleAcceptCoOwnerInvitation(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
): Promise<Response> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { newPassword }: AcceptRequest = await req.json();

    // user_id comes from the JWT, never the body — otherwise any
    // authenticated user could accept someone else's invitation.
    const { data: invitation, error: lookupError } = await admin
      .from("staff_invitations")
      .select("*")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "pending")
      .maybeSingle();

    if (lookupError || !invitation) {
      return json({ error: "This invitation is no longer valid. Ask the salon owner to send a new one." }, 409);
    }

    if (new Date(invitation.expires_at) <= new Date()) {
      return json({ error: "This invitation is no longer valid. Ask the salon owner to send a new one." }, 409);
    }

    const requiresPasswordChange = (user as User).user_metadata?.requires_password_change === true;

    if (requiresPasswordChange) {
      if (!newPassword) {
        return json({ error: "New password is required" }, 400);
      }
      if (invitation.temp_password && newPassword === invitation.temp_password) {
        return json({ error: "You cannot reuse your temporary password. Please choose a new password." }, 400);
      }
      if (!PASSWORD_REGEX.test(newPassword)) {
        return json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        }, 400);
      }
    }

    // grant_tenant_co_owner runs FIRST (AD-4) — a refused acceptance must
    // leave the invitee's credentials exactly as they were.
    let grantResult: { status: string };
    try {
      const { data, error } = await admin.rpc("grant_tenant_co_owner", {
        p_tenant_id: invitation.tenant_id,
        p_user_id: user.id,
      });
      if (error) throw error;
      grantResult = data;
    } catch (grantError: unknown) {
      const message = (grantError as { message?: string })?.message ?? String(grantError);
      console.error("[accept-co-owner-invitation] grant_tenant_co_owner error:", grantError);

      if (message === "CO_OWNER_CAP_REACHED") {
        return json({ error: "This salon already has two owners, so this invitation can no longer be accepted." }, 409);
      }
      if (message === "CO_OWNER_NO_EXISTING_OWNER") {
        return json({ error: "This salon no longer has an owner who can add you. Contact Salon Magik." }, 409);
      }
      // trg_enforce_single_owner_tenant's fixed, untouched message — matched
      // by substring, same as backoffice-add-tenant-co-owner (AD-9 of
      // second-owner-foundation.design.md).
      if (message.includes("already owns another salon")) {
        return json({
          error: "You already own another salon on Salon Magik, so you can't also own this one. Contact Salon Magik.",
        }, 409);
      }
      return json({ error: "Failed to accept invitation. Please try again." }, 500);
    }

    const newMetadata: Record<string, unknown> = { pending_co_owner_invite: false };
    if (newPassword) {
      newMetadata.requires_password_change = false;
    }

    const { error: updateUserError } = await admin.auth.admin.updateUserById(user.id, {
      ...(newPassword ? { password: newPassword } : {}),
      user_metadata: { ...(user as User).user_metadata, ...newMetadata },
    });
    if (updateUserError) {
      console.error("[accept-co-owner-invitation] updateUserById error:", updateUserError);
      return json({ error: "Failed to accept invitation. Please try again." }, 500);
    }

    await admin
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        password_changed_at: newPassword ? new Date().toISOString() : null,
        temp_password: null,
        temp_password_used: Boolean(newPassword),
      })
      .eq("id", invitation.id);

    await admin.from("audit_logs").insert({
      tenant_id: invitation.tenant_id,
      actor_user_id: user.id,
      action: "co_owner.invitation_accepted",
      entity_type: "tenant",
      entity_id: invitation.tenant_id,
      metadata: { invitation_id: invitation.id, status: grantResult.status },
    });

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", invitation.tenant_id).single();
    const { data: ownerRows } = await admin.rpc("list_tenant_owners_service", { p_tenant_id: invitation.tenant_id });
    const newOwnerName = `${invitation.first_name} ${invitation.last_name}`.trim();
    for (const owner of ownerRows || []) {
      if (owner.user_id === user.id) continue;
      await sendEmail(
        owner.email,
        `${newOwnerName} accepted co-ownership of ${tenant?.name || "your salon"}`,
        buildOwnerNoticeEmail(newOwnerName, tenant?.name || "your salon"),
      );
    }

    return json({ success: true, tenantId: invitation.tenant_id });
  } catch (error: unknown) {
    console.error("accept-co-owner-invitation error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  return await handleAcceptCoOwnerInvitation(req, supabase, admin);
});
