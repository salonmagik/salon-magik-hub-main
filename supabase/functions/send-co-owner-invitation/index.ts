import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  wrapEmailTemplate,
  heading,
  paragraph,
  smallText,
  createButton,
  createCredentialBox,
  buildFromAddress,
} from "../_shared/email-template.ts";
import { generateSecurePassword } from "../_shared/secure-password.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_THROTTLE_MINUTES = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  invitationId?: string;
  resend?: boolean;
}

interface OwnerRow {
  user_id: string;
  full_name: string | null;
  email: string;
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getBaseUrlFromRequest(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//i.test(origin)) return origin;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return Deno.env.get("SALON_APP_URL") || Deno.env.get("BASE_URL") || "https://app.salonmagik.com";
}

function ownerNames(owners: OwnerRow[]): string {
  return owners.map((o) => o.full_name || o.email).join(", ");
}

function buildNewAccountEmail(firstName: string, tenantName: string, loginEmail: string, tempPassword: string, loginLink: string) {
  const content = `
    ${heading(`You're invited to co-own ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`You've been invited to become an owner of <strong>${tenantName}</strong> on Salon Magik.`)}
    ${paragraph(`Your login email: <strong>${loginEmail}</strong>`)}
    ${paragraph("Temporary password — you'll set a new one on first login:")}
    ${createCredentialBox("Temporary password", tempPassword)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("This invitation expires in 7 days. If you weren't expecting this, you can ignore the email.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildExistingMemberEmail(firstName: string, tenantName: string, loginLink: string) {
  const content = `
    ${heading(`You're invited to co-own ${tenantName}`)}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`You already work at <strong>${tenantName}</strong>, and you've now been invited to become an owner there. Sign in with your existing password to review and accept.`)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("This invitation expires in 7 days. If you weren't expecting this, you can ignore the email.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

function buildOwnerNoticeEmail(invitedName: string, tenantName: string) {
  const content = `
    ${heading(`A co-owner invitation was sent for ${tenantName}`)}
    ${paragraph(`<strong>${invitedName}</strong> has been invited to become a co-owner of <strong>${tenantName}</strong>.`)}
    ${smallText("If you weren't expecting this, please contact support@salonmagik.com.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [to],
        subject,
        html,
      }),
    });
    return res.ok;
  } catch (emailError) {
    console.error("[send-co-owner-invitation] email send error:", emailError);
    return false;
  }
}

/**
 * Dependency-injected core, modelled on backoffice-add-tenant-co-owner and
 * backoffice-grant-multi-salon-ownership so it can be driven directly by a
 * test (see index.test.ts) without a live Supabase project.
 */
export async function handleSendCoOwnerInvitation(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  // deno-lint-ignore no-explicit-any
  serviceRoleClient: SupabaseClient<any>,
): Promise<Response> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body: SendRequest = await req.json();

    // tenant_id is never taken from the request body (Security Considerations)
    // — resolved from the caller's own membership, matching
    // send-staff-invitation's precedent of using the caller's first tenant row.
    const { data: callerRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1);

    if (rolesError || !callerRoles?.length) {
      return json({ error: "No tenant found for user" }, 400);
    }
    const tenantId = callerRoles[0].tenant_id as string;

    const { data: isOwner, error: isOwnerError } = await serviceRoleClient.rpc("is_tenant_owner", {
      _user_id: user.id,
      _tenant_id: tenantId,
    });
    if (isOwnerError || !isOwner) {
      return json({ error: "You don't have permission to manage owners for this salon." }, 403);
    }

    const { data: tenant, error: tenantError } = await serviceRoleClient
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();
    if (tenantError || !tenant) {
      return json({ error: "Salon not found" }, 404);
    }

    if (body.resend && body.invitationId) {
      return await handleResend(body.invitationId, tenantId, tenant.name, req, serviceRoleClient);
    }

    return await handleNewInvite(body, tenantId, tenant.name, user.id, user.email ?? null, req, serviceRoleClient);
  } catch (error: unknown) {
    console.error("send-co-owner-invitation error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
}

async function handleNewInvite(
  body: SendRequest,
  tenantId: string,
  tenantName: string,
  callerId: string,
  callerEmail: string | null,
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
): Promise<Response> {
  const { firstName, lastName, phone } = body;
  const email = body.email?.trim();

  if (!firstName?.trim() || !lastName?.trim() || !email) {
    return json({ error: "Missing required fields" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address" }, 400);
  }

  const normalizedEmail = email.toLowerCase();

  if (callerEmail?.toLowerCase() === normalizedEmail) {
    return json({ error: "You already own this salon." }, 409);
  }

  const { data: ownerRows, error: ownersError } = await admin.rpc("list_tenant_owners_service", {
    p_tenant_id: tenantId,
  });
  if (ownersError) {
    console.error("[send-co-owner-invitation] list_tenant_owners_service error:", ownersError);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
  const owners: OwnerRow[] = ownerRows || [];

  if (owners.length === 0) {
    return json({ error: "This salon has no owner yet." }, 409);
  }
  if (owners.length >= 2) {
    return json({ error: `This salon already has the maximum of two owners (${ownerNames(owners)}).` }, 409);
  }

  const { data: existingPending } = await admin
    .from("staff_invitations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    return json({
      error: "There's already an invitation outstanding for this salon. Revoke it before sending another.",
    }, 409);
  }

  const { data: availability, error: availError } = await admin.rpc("check_owner_invite_email", {
    p_email: normalizedEmail,
    p_tenant_id: tenantId,
  });
  if (availError) {
    console.error("[send-co-owner-invitation] check_owner_invite_email error:", availError);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
  if (availability?.available === false && availability.reason === "already_owner_this_tenant") {
    return json({ error: "That person already owns this salon." }, 409);
  }
  if (availability?.available === false && availability.reason === "already_owner_other_tenant") {
    return json({
      error: "That person already owns another salon on Salon Magik. Contact Salon Magik to arrange co-ownership.",
    }, 409);
  }
  if (availability?.available === false && availability.reason === "existing_account") {
    return json({ error: "That email can't be invited as an owner. Contact Salon Magik." }, 409);
  }

  const isExistingMember = availability?.available === true && availability.note === "existing_member";

  const { data: existingAuthUser } = await admin.rpc("get_auth_user_by_email", {
    lookup_email: normalizedEmail,
  });

  let targetUserId: string;
  let tempPassword: string | null = null;
  let isNewAccount = false;

  if (existingAuthUser?.id) {
    targetUserId = existingAuthUser.id;
    const { error: metaError } = await admin.auth.admin.updateUserById(targetUserId, {
      user_metadata: { ...(existingAuthUser.user_metadata || {}), pending_co_owner_invite: true },
    });
    if (metaError) {
      console.error("[send-co-owner-invitation] updateUserById (existing member) error:", metaError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
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
        invited_via: "co_owner_invite",
        pending_co_owner_invite: true,
      },
    });
    if (createError || !created.user) {
      console.error("[send-co-owner-invitation] createUser error:", createError);
      return json({ error: createError?.message || "Failed to create account" }, 500);
    }
    targetUserId = created.user.id;

    // Upsert, not insert: a trigger on auth.users already creates a stub
    // profiles row (same reasoning as send-staff-invitation).
    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: targetUserId,
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone || null,
    }, { onConflict: "user_id" });
    if (profileError) console.error("[send-co-owner-invitation] profile upsert error:", profileError);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { data: invitation, error: insertError } = await admin
    .from("staff_invitations")
    .insert({
      tenant_id: tenantId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: normalizedEmail,
      phone: phone || null,
      role: "owner",
      token: crypto.randomUUID(),
      status: "pending",
      temp_password: tempPassword,
      user_id: targetUserId,
      invited_by_id: callerId,
      expires_at: expiresAt.toISOString(),
      invited_via: "co_owner_invite",
    })
    .select()
    .single();

  if (insertError) {
    console.error("[send-co-owner-invitation] insert error:", insertError);
    // Rollback: delete the account only if this invitation just created it
    // (AD-8's same guard shape — never delete a pre-existing account).
    if (isNewAccount) await admin.auth.admin.deleteUser(targetUserId);
    if (insertError.code === "23505") {
      return json({
        error: "There's already an invitation outstanding for this salon. Revoke it before sending another.",
      }, 409);
    }
    return json({ error: "Failed to create invitation" }, 500);
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: callerId,
    action: "co_owner.invitation_sent",
    entity_type: "tenant",
    entity_id: tenantId,
    metadata: { email: normalizedEmail, target_user_id: targetUserId, invitation_id: invitation.id },
  });

  const baseUrl = getBaseUrlFromRequest(req);
  const loginLink = `${baseUrl}/login`;

  let emailDelivered: boolean;
  if (isNewAccount) {
    emailDelivered = await sendEmail(
      normalizedEmail,
      `You're invited to co-own ${tenantName}`,
      buildNewAccountEmail(firstName.trim(), tenantName, normalizedEmail, tempPassword!, loginLink),
    );
  } else {
    emailDelivered = await sendEmail(
      normalizedEmail,
      `You're invited to co-own ${tenantName}`,
      buildExistingMemberEmail(firstName.trim(), tenantName, loginLink),
    );
  }

  for (const owner of owners) {
    await sendEmail(
      owner.email,
      `A co-owner invitation was sent for ${tenantName}`,
      buildOwnerNoticeEmail(`${firstName.trim()} ${lastName.trim()}`, tenantName),
    );
  }

  await admin.from("message_logs").insert({
    tenant_id: tenantId,
    channel: "email",
    recipient: normalizedEmail,
    template_type: "co_owner_invitation",
    status: emailDelivered ? "sent" : "failed",
    provider: "resend",
    initiated_by: "system",
    credits_used: 0,
    sent_at: new Date().toISOString(),
  });

  return json({
    success: true,
    status: isExistingMember ? "invited_existing_member" : "invited",
    invitation: { id: invitation.id, email: normalizedEmail },
    emailDelivered,
  });
}

async function handleResend(
  invitationId: string,
  tenantId: string,
  tenantName: string,
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
): Promise<Response> {
  const { data: invitation, error: lookupError } = await admin
    .from("staff_invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .maybeSingle();

  if (lookupError || !invitation) {
    return json({ error: "Invitation not found" }, 404);
  }
  if (invitation.status !== "pending") {
    return json({ error: "That invitation is no longer pending." }, 409);
  }

  // Server-side mirror of useStaffInvitations' 30-minute client throttle — a
  // client-side-only throttle is not a throttle for an owner-level credential.
  if (invitation.last_resent_at) {
    const minutesSinceResend = (Date.now() - new Date(invitation.last_resent_at).getTime()) / (1000 * 60);
    if (minutesSinceResend < RESEND_THROTTLE_MINUTES) {
      const minutesRemaining = Math.ceil(RESEND_THROTTLE_MINUTES - minutesSinceResend);
      return json({ error: `Please wait ${minutesRemaining} minutes before resending.` }, 409);
    }
  }

  let tempPassword: string | null = invitation.temp_password;
  // Only a new-account invitation has a temp password to rotate (AD-10) — a
  // promote-in-place invitee's real password is never touched.
  if (invitation.temp_password && invitation.user_id) {
    tempPassword = generateSecurePassword();
    const { error: updatePasswordError } = await admin.auth.admin.updateUserById(invitation.user_id, {
      password: tempPassword,
      user_metadata: { requires_password_change: true },
    });
    if (updatePasswordError) {
      console.error("[send-co-owner-invitation] resend password rotation error:", updatePasswordError);
      return json({ error: "Failed to resend invitation" }, 500);
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { error: updateError } = await admin
    .from("staff_invitations")
    .update({
      temp_password: tempPassword,
      expires_at: expiresAt.toISOString(),
      last_resent_at: new Date().toISOString(),
      resend_count: (invitation.resend_count || 0) + 1,
      status: "pending",
    })
    .eq("id", invitationId);

  if (updateError) {
    console.error("[send-co-owner-invitation] resend update error:", updateError);
    return json({ error: "Failed to resend invitation" }, 500);
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: invitation.invited_by_id,
    action: "co_owner.invitation_resent",
    entity_type: "tenant",
    entity_id: tenantId,
    metadata: { email: invitation.email, invitation_id: invitationId },
  });

  const baseUrl = getBaseUrlFromRequest(req);
  const loginLink = `${baseUrl}/login`;

  const emailDelivered = tempPassword
    ? await sendEmail(
      invitation.email,
      `You're invited to co-own ${tenantName}`,
      buildNewAccountEmail(invitation.first_name, tenantName, invitation.email, tempPassword, loginLink),
    )
    : await sendEmail(
      invitation.email,
      `You're invited to co-own ${tenantName}`,
      buildExistingMemberEmail(invitation.first_name, tenantName, loginLink),
    );

  return json({
    success: true,
    status: "resent",
    invitation: { id: invitationId, email: invitation.email },
    emailDelivered,
  });
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
  const serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);

  return await handleSendCoOwnerInvitation(req, supabase, serviceRoleClient);
});
