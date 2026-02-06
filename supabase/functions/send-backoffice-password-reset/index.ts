import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PasswordResetRequest {
  email: string;
  origin: string;
}

// BackOffice Design System
const STYLES = {
  primaryColor: "#dc2626", // destructive red for backoffice
  textColor: "#1f2937",
  textMuted: "#4b5563",
  textLight: "#6b7280",
  textLighter: "#9ca3af",
  surfaceColor: "#f5f7fa",
  borderColor: "#e5e7eb",
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const emailTemplate = {
  subject: "Reset your BackOffice password",
  body_html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${STYLES.surfaceColor}; font-family: ${STYLES.fontFamily};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background-color: #fef2f2; border-radius: 50%; padding: 16px;">
              <span style="font-size: 32px;">🛡️</span>
            </div>
            <h1 style="color: ${STYLES.primaryColor}; margin: 16px 0 0 0; font-size: 24px;">BackOffice</h1>
          </div>
          
          <h2 style="color: ${STYLES.textColor}; margin-bottom: 16px; font-size: 20px;">Reset Your Password</h2>
          
          <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6;">
            A password reset was requested for your BackOffice account. Click the button below to create a new password:
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="{{reset_link}}" 
               style="background-color: ${STYLES.primaryColor}; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 500; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6;">
            This link expires in 1 hour. If you didn't request this, please contact your system administrator immediately.
          </p>
          
          <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="{{reset_link}}" style="color: ${STYLES.primaryColor}; word-break: break-all;">{{reset_link}}</a>
          </p>
          
          <hr style="border: none; border-top: 1px solid ${STYLES.borderColor}; margin: 32px 0;" />
          
          <p style="color: ${STYLES.textLighter}; font-size: 12px; text-align: center;">
            Salon Magik BackOffice — Restricted Access
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, origin }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user exists AND is a backoffice user
    const { data: backofficeUser } = await supabase
      .from("backoffice_users")
      .select("user_id, email_domain")
      .eq("email_domain", email.toLowerCase().split("@")[1] || "")
      .single();

    // Verify the user exists in auth and matches backoffice record
    const { data: users } = await supabase.auth.admin.listUsers();
    const authUser = users?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    // Always return success to prevent email enumeration
    if (!authUser || !backofficeUser || authUser.id !== backofficeUser.user_id) {
      console.log(`BackOffice password reset requested for non-backoffice email: ${email}`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Delete any existing tokens for this email
    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("email", email.toLowerCase());

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token
    const { error: insertError } = await supabase.from("password_reset_tokens").insert({
      email: email.toLowerCase(),
      token,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Failed to store reset token:", insertError);
      throw new Error("Failed to generate reset link");
    }

    // Build reset link - note the /backoffice path
    const resetLink = `${origin}/backoffice/reset-password?token=${token}`;

    // Replace variables in template
    const htmlBody = emailTemplate.body_html.replace(/\{\{reset_link\}\}/g, resetLink);

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Salon Magik BackOffice <${fromEmail}>`,
        to: [email],
        subject: emailTemplate.subject,
        html: htmlBody,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend API error:", errorData);
      throw new Error("Failed to send email");
    }

    console.log("BackOffice password reset email sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-backoffice-password-reset:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send reset email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
