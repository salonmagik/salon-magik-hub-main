import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

// Salon Magik Design System
const STYLES = {
  primaryColor: "#2563EB",
  textColor: "#1f2937",
  textMuted: "#4b5563",
  textLight: "#6b7280",
  textLighter: "#9ca3af",
  surfaceColor: "#f5f7fa",
  borderColor: "#e5e7eb",
  fontFamily: "'Questrial', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

function buildInvitationEmail(
  firstName: string,
  email: string,
  salonName: string,
  role: string,
  loginLink: string,
  tempPassword: string,
  salonLogoUrl?: string
): string {
  // Header with salon branding if available
  let headerSection = `
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: ${STYLES.primaryColor}; font-style: italic; margin: 0; font-size: 32px; font-family: ${STYLES.fontFamily};">Salon Magik</h1>
    </div>
  `;

  if (salonLogoUrl) {
    headerSection = `
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${salonLogoUrl}" alt="${salonName} Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;" />
        <p style="color: ${STYLES.textMuted}; font-size: 12px; margin: 0; font-family: ${STYLES.fontFamily};">Powered by Salon Magik</p>
      </div>
    `;
  } else {
    headerSection = `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: ${STYLES.primaryColor}; margin: 0 0 8px 0; font-size: 28px; font-family: ${STYLES.fontFamily};">${salonName}</h1>
        <p style="color: ${STYLES.textMuted}; font-size: 12px; margin: 0; font-family: ${STYLES.fontFamily};">Powered by Salon Magik</p>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Questrial&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${STYLES.surfaceColor}; font-family: ${STYLES.fontFamily};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${headerSection}
          
          <h2 style="color: ${STYLES.textColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Join Our Team</h2>
          
          <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Hi ${firstName},</p>
          
          <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
            You've been invited to join <strong>${salonName}</strong> as a <strong>${role}</strong>.
          </p>
          
          <div style="background-color: ${STYLES.surfaceColor}; padding: 20px; border-radius: 8px; margin: 24px 0;">
            <p style="color: ${STYLES.textMuted}; font-size: 14px; margin: 0 0 12px 0; font-family: ${STYLES.fontFamily};">
              <strong>Your login credentials:</strong>
            </p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: ${STYLES.textLight}; font-size: 14px;">Email:</td>
                <td style="padding: 8px 0; color: ${STYLES.textColor}; font-size: 14px; font-family: monospace;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: ${STYLES.textLight}; font-size: 14px;">Temporary Password:</td>
                <td style="padding: 8px 0; color: ${STYLES.textColor}; font-size: 16px; font-family: monospace; letter-spacing: 1px; background-color: #fff; padding: 8px 12px; border-radius: 4px;">
                  ${tempPassword}
                </td>
              </tr>
            </table>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${loginLink}" 
               style="background-color: ${STYLES.primaryColor}; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 500; font-size: 16px; font-family: ${STYLES.fontFamily};">
              Sign In Now
            </a>
          </div>

          <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6; text-align: center; font-family: ${STYLES.fontFamily};">
            You'll be prompted to set a permanent password on your first login.
          </p>
          
          <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
            This invitation expires in 7 days.
          </p>
          
          <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid ${STYLES.borderColor}; margin: 32px 0;" />
          
          <p style="color: ${STYLES.textLighter}; font-size: 12px; text-align: center; font-family: ${STYLES.fontFamily};">
            © 2026 Salon Magik. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  return "https://salonmagik.lovable.app";
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
    const baseUrl = Deno.env.get("APP_URL") || getBaseUrlFromRequest(req);
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

    // Sanitize sender name
    const sanitizedSalonName = tenant.name.replace(/[<>"\\n\\r]/g, "").trim();

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
