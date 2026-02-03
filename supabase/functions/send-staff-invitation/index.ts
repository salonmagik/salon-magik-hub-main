import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvitationRequest {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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

    // Get tenant details
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { firstName, lastName, email, role }: InvitationRequest = await req.json();

    // Validate required fields
    if (!firstName || !lastName || !email || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate secure token
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create invitation record
    const { data: invitation, error: insertError } = await supabase
      .from("staff_invitations")
      .insert({
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase(),
        role: role,
        token: inviteToken,
        expires_at: expiresAt.toISOString(),
        invited_by_id: userId,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating invitation:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build invitation link
    const baseUrl = req.headers.get("origin") || "https://salonmagik.app";
    const invitationLink = `${baseUrl}/accept-invite?token=${inviteToken}`;

    // Get email template (or use default)
    const { data: emailTemplate } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenantId)
      .eq("template_type", "staff_invitation")
      .single();

    let subject = `You're invited to join ${tenant.name}`;
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Join Our Team</h1>
        <p>Hi ${firstName},</p>
        <p>You've been invited to join <strong>${tenant.name}</strong> as a <strong>${role}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${invitationLink}" 
             style="background-color: #E11D48; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
        <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `;

    // Apply custom template if exists
    if (emailTemplate) {
      subject = emailTemplate.subject
        .replace(/{{staff_name}}/g, firstName)
        .replace(/{{salon_name}}/g, tenant.name)
        .replace(/{{role}}/g, role);
      
      htmlBody = emailTemplate.body_html
        .replace(/{{staff_name}}/g, firstName)
        .replace(/{{salon_name}}/g, tenant.name)
        .replace(/{{role}}/g, role)
        .replace(/{{invitation_link}}/g, invitationLink);
    }

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Salon Magik <noreply@salonmagik.app>",
        to: [email],
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
      recipient: email,
      template_type: "staff_invitation",
      status: "sent",
      credits_used: 1,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        invitation: { id: invitation.id, email, role },
        message: `Invitation sent to ${email}` 
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
