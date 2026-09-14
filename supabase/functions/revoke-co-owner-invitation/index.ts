import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { wrapEmailTemplate, heading, paragraph, smallText, buildFromAddress } from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RevokeRequest {
  invitationId?: string;
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function buildInviteeWithdrawnEmail(firstName: string, tenantName: string) {
  const content = `
    ${heading("Invitation withdrawn")}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`Your invitation to become an owner of <strong>${tenantName}</strong> has been withdrawn.`)}
    ${smallText("If you believe this is a mistake, please contact the salon directly.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildOwnerNoticeEmail(invitedEmail: string, tenantName: string) {
  const content = `
    ${heading(`A co-owner invitation was revoked for ${tenantName}`)}
    ${paragraph(`The invitation sent to <strong>${invitedEmail}</strong> for <strong>${tenantName}</strong> has been revoked.`)}
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
    console.error("[revoke-co-owner-invitation] email send error:", emailError);
  }
}

/**
 * Dependency-injected core, modelled on send-co-owner-invitation and
 * accept-co-owner-invitation so it can be driven directly by a test.
 */
export async function handleRevokeCoOwnerInvitation(
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

    const { invitationId }: RevokeRequest = await req.json();
    if (!invitationId) {
      return json({ error: "Missing required field: invitationId" }, 400);
    }

    const { data: invitation, error: lookupError } = await admin
      .from("staff_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("role", "owner")
      .maybeSingle();

    if (lookupError || !invitation) {
      return json({ error: "Invitation not found" }, 404);
    }

    const { data: isOwner, error: isOwnerError } = await admin.rpc("is_tenant_owner", {
      _user_id: user.id,
      _tenant_id: invitation.tenant_id,
    });
    if (isOwnerError || !isOwner) {
      return json({ error: "You don't have permission to manage owners for this salon." }, 403);
    }

    if (invitation.status !== "pending") {
      return json({ error: "That invitation is no longer pending." }, 409);
    }

    const { error: updateError } = await admin
      .from("staff_invitations")
      .update({ status: "cancelled", temp_password: null })
      .eq("id", invitationId);
    if (updateError) {
      console.error("[revoke-co-owner-invitation] update error:", updateError);
      return json({ error: "Failed to revoke invitation. Please try again." }, 500);
    }

    let accountDeleted = false;
    if (invitation.user_id) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("id, is_active")
        .eq("user_id", invitation.user_id);
      // coalesce(is_active, true) — matches every RPC in this feature that
      // treats a null is_active as active.
      const hasActiveRole = (roleRows || []).some((r: { is_active: boolean | null }) => r.is_active !== false);

      const { data: targetUser } = await admin.auth.admin.getUserById(invitation.user_id);
      const createdByThisInvite = targetUser?.user?.user_metadata?.invited_via === "co_owner_invite";

      // Delete the account only if this invitation created it AND it holds
      // no active role anywhere (AD-8) — otherwise, only clear the flag.
      if (createdByThisInvite && !hasActiveRole) {
        await admin.auth.admin.deleteUser(invitation.user_id);
        accountDeleted = true;
      } else {
        await admin.auth.admin.updateUserById(invitation.user_id, {
          user_metadata: { ...(targetUser?.user?.user_metadata || {}), pending_co_owner_invite: false },
        });
      }
    }

    await admin.from("audit_logs").insert({
      tenant_id: invitation.tenant_id,
      actor_user_id: user.id,
      action: "co_owner.invitation_revoked",
      entity_type: "tenant",
      entity_id: invitation.tenant_id,
      metadata: { invitation_id: invitationId, email: invitation.email, account_deleted: accountDeleted },
    });

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", invitation.tenant_id).single();
    const tenantName = tenant?.name || "the salon";

    if (!accountDeleted) {
      await sendEmail(
        invitation.email,
        "Invitation withdrawn",
        buildInviteeWithdrawnEmail(invitation.first_name, tenantName),
      );
    }

    const { data: ownerRows } = await admin.rpc("list_tenant_owners_service", { p_tenant_id: invitation.tenant_id });
    for (const owner of ownerRows || []) {
      await sendEmail(
        owner.email,
        `A co-owner invitation was revoked for ${tenantName}`,
        buildOwnerNoticeEmail(invitation.email, tenantName),
      );
    }

    return json({ success: true });
  } catch (error: unknown) {
    console.error("revoke-co-owner-invitation error:", error);
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

  return await handleRevokeCoOwnerInvitation(req, supabase, admin);
});
