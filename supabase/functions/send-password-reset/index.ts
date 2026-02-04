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

const defaultTemplate = {
  subject: "Reset your Salon Magik password",
  body_html: `<div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #E11D48; font-style: italic; margin: 0; font-size: 32px;">Salon Magik</h1>
  </div>
  
  <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Reset Your Password</h2>
  
  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi there,</p>
  
  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
    We received a request to reset your password. Click the button below to create a new password:
  </p>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="{{reset_link}}" 
       style="background-color: #E11D48; color: white; padding: 14px 28px; 
              text-decoration: none; border-radius: 8px; display: inline-block;
              font-weight: 500; font-size: 16px;">
      Reset Password
    </a>
  </div>
  
  <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
    This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
  </p>
  
  <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
    If the button doesn't work, copy and paste this link into your browser:<br/>
    <a href="{{reset_link}}" style="color: #E11D48; word-break: break-all;">{{reset_link}}</a>
  </p>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
  
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    © 2025 Salon Magik. All rights reserved.
  </p>
</div>`,
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

    // Check if user exists (don't reveal this to prevent email enumeration)
    const { data: users } = await supabase.auth.admin.listUsers();
    const userExists = users?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase());

    // Always return success to prevent email enumeration
    if (!userExists) {
      console.log(`Password reset requested for non-existent email: ${email}`);
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

    // Build reset link
    const resetLink = `${origin}/reset-password?token=${token}`;

    // Replace variables in template
    const htmlBody = defaultTemplate.body_html.replace(/\{\{reset_link\}\}/g, resetLink);

    // Sanitize sender name for email headers
    const sanitizedFromName = "Salon Magik".replace(/[<>"\\n\\r]/g, "");

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${sanitizedFromName} <${fromEmail}>`,
        to: [email],
        subject: defaultTemplate.subject,
        html: htmlBody,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend API error:", errorData);
      throw new Error("Failed to send email");
    }

    console.log("Password reset email sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-password-reset:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send reset email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
