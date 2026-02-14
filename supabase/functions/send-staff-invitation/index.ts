import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  wrapEmailTemplate,
  heading,
  paragraph,
  smallText,
  createButton,
  getSenderName,
} from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvitationRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  invitationId?: string;
  resend?: boolean;
}

// Generate secure temporary password
function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  let password = "";
  
  // 8 alphanumeric chars
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // 2 special chars
  for (let i = 0; i < 2; i++) {
    password += specials.charAt(Math.floor(Math.random() * specials.length));
  }
  
  return password;
}

function buildInvitationEmail(
  firstName: string,
  email: string,
  salonName: string,
  role: string,
  loginLink: string,
  tempPassword: string,
  salonLogoUrl?: string
): string {
  const content = `
    ${heading("Join our team")}
    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(`You've been invited to join <strong>${salonName}</strong> as a <strong>${role}</strong>.`)}
    ${paragraph(`Your login email: <strong>${email}</strong>`)}
    ${paragraph(`Temporary password (you’ll set a new one on first login): <strong>${tempPassword}</strong>`)}
    ${createButton("Sign in now", loginLink)}
    ${smallText("This invitation expires in 7 days. If you weren't expecting this, you can ignore the email.")} 
  `;

  return wrapEmailTemplate(content, {
    mode: "salon",
    salonName,
    salonLogoUrl,
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

  // Last-resort fallback
  return Deno.env.get("SALON_APP_URL") || Deno.env.get("BASE_URL") || "https://app.salonmagik.com";
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    // Regular client for authenticated queries
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service role client for admin operations (creating users)
    const serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = user.id;

    // Get user's tenant
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .limit(1);

    if (rolesError || !userRoles?.length) {
      return new Response(
        JSON.stringify({ error: "No tenant found for user" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const tenantId = userRoles[0].tenant_id;
    const inviterRole = userRoles[0].role;

    // Only owner, manager, supervisor can invite
    if (!["owner", "manager", "supervisor"].includes(inviterRole)) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions to invite staff" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get tenant details including logo
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("name, logo_url")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const requestBody: InvitationRequest = await req.json();
    const { firstName, lastName, email, role, invitationId, resend } = requestBody;

    let invitation: any;
    let tempPassword: string;
    let recipientEmail: string;
    let recipientFirstName: string;
    let recipientRole: string;
    let createdUserId: string | null = null;

    if (resend && invitationId) {
      // Handle resend: lookup existing invitation
      const { data: existingInvitation, error: lookupError } = await supabase
        .from("staff_invitations")
        .select("*")
        .eq("id", invitationId)
        .eq("tenant_id", tenantId)
        .single();

      if (lookupError || !existingInvitation) {
        return new Response(
          JSON.stringify({ error: "Invitation not found" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Use existing temp password and extend expiry
      tempPassword = existingInvitation.temp_password || generateSecurePassword();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const { error: updateError } = await supabase
        .from("staff_invitations")
        .update({
          expires_at: expiresAt.toISOString(),
          status: "pending",
          temp_password: tempPassword,
        })
        .eq("id", invitationId);

      if (updateError) {
        console.error("Error updating invitation:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update invitation" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      invitation = existingInvitation;
      recipientEmail = existingInvitation.email;
      recipientFirstName = existingInvitation.first_name;
      recipientRole = existingInvitation.role;
      createdUserId = existingInvitation.user_id;

      // If user was already created, update their password
      if (createdUserId) {
        const { error: updatePasswordError } = await serviceRoleClient.auth.admin.updateUserById(
          createdUserId,
          { password: tempPassword }
        );
        if (updatePasswordError) {
          console.error("Error updating user password:", updatePasswordError);
        }
      }
    } else {
      // Handle new invitation
      if (!firstName || !lastName || !email || !role) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const normalizedEmail = email.toLowerCase();
      tempPassword = generateSecurePassword();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Check if email already exists in auth.users
      const { data: existingUsers } = await serviceRoleClient.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Create the user account immediately
      const { data: userData, error: createError } = await serviceRoleClient.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true, // Auto-confirm since invitation proves ownership
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          requires_password_change: true, // Flag for forced password change
          invited_via: "staff_invitation",
        },
      });

      if (createError || !userData.user) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: createError?.message || "Failed to create user account" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      createdUserId = userData.user.id;

      // Create profile
      const { error: profileError } = await serviceRoleClient.from("profiles").insert({
        user_id: createdUserId,
        full_name: `${firstName} ${lastName}`,
      });

      if (profileError) {
        console.error("Error creating profile:", profileError);
        // Profile may be created by trigger, continue
      }

      // Create user role
      const { error: roleError } = await serviceRoleClient.from("user_roles").insert({
        user_id: createdUserId,
        tenant_id: tenantId,
        role: role,
        is_active: true,
      });

      if (roleError) {
        console.error("Error creating role:", roleError);
        // Clean up created user
        await serviceRoleClient.auth.admin.deleteUser(createdUserId);
        return new Response(
          JSON.stringify({ error: "Failed to assign role. Please try again." }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Create the invitation record
      const { data: newInvitation, error: insertError } = await supabase
        .from("staff_invitations")
        .insert({
          tenant_id: tenantId,
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          role: role,
          token: crypto.randomUUID(), // Keep token for backwards compatibility
          expires_at: expiresAt.toISOString(),
          invited_by_id: userId,
          status: "pending",
          temp_password: tempPassword,
          user_id: createdUserId, // Link to created user
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating invitation:", insertError);
        // Clean up created user and role
        await serviceRoleClient.from("user_roles").delete().eq("user_id", createdUserId);
        await serviceRoleClient.auth.admin.deleteUser(createdUserId);
        return new Response(
          JSON.stringify({ error: "Failed to create invitation" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      invitation = newInvitation;
      recipientEmail = normalizedEmail;
      recipientFirstName = firstName;
      recipientRole = role;
    }

    // Build login link - goes directly to /login, not accept-invite
    const baseUrl =
      Deno.env.get("SALON_APP_URL") ||
      Deno.env.get("BASE_URL") ||
      getBaseUrlFromRequest(req);
    const loginLink = `${baseUrl}/login`;

    console.log("Generated login link for staff invitation", {
      baseUrl,
      invitationId: invitation?.id,
      createdUserId,
    });

    // Build email content
    const subject = `You're invited to join ${tenant.name}`;
    const htmlBody = buildInvitationEmail(
      recipientFirstName,
      recipientEmail,
      tenant.name,
      recipientRole,
      loginLink,
      tempPassword,
      tenant.logo_url || undefined
    );

    const sanitizedSalonName = getSenderName({ mode: "salon", salonName: tenant.name }).replace(/[<>"\\n\\r]/g, "").trim();

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${sanitizedSalonName} <${fromEmail}>`,
        to: [recipientEmail],
        subject: subject,
        html: htmlBody,
      }),
    });

    const emailResult = await emailResponse.json();
    console.log("Staff invitation email sent:", emailResult);

    // Log the message
    await supabase.from("message_logs").insert({
      tenant_id: tenantId,
      channel: "email",
      recipient: recipientEmail,
      template_type: "staff_invitation",
      status: "sent",
      credits_used: 1,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        invitation: { id: invitation.id, email: recipientEmail, role: recipientRole },
        message: resend ? `Invitation resent to ${recipientEmail}` : `Invitation sent to ${recipientEmail}` 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-staff-invitation function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
