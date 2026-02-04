import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailVerificationRequest {
  email: string;
  firstName: string;
  userId: string;
  origin: string;
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
  successBg: "#dcfce7",
  successBorder: "#16a34a",
  successText: "#166534",
  fontFamily: "'Questrial', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

const welcomeTemplate = {
  subject: "Welcome to Salon Magik - Verify your email",
  body_html: `
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
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: ${STYLES.primaryColor}; font-style: italic; margin: 0; font-size: 32px; font-family: ${STYLES.fontFamily};">Salon Magik</h1>
          </div>
          
          <h2 style="color: ${STYLES.textColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Welcome, {{first_name}}!</h2>
          
          <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
            Thank you for signing up for Salon Magik. We're excited to help you manage your salon business.
          </p>
          
          <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
            Please verify your email address to get started:
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="{{verification_link}}" 
               style="background-color: ${STYLES.primaryColor}; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: 500; font-size: 16px; font-family: ${STYLES.fontFamily};">
              Verify Email
            </a>
          </div>
          
          <div style="background: ${STYLES.successBg}; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid ${STYLES.successBorder};">
            <p style="color: ${STYLES.successText}; margin: 0; font-size: 14px; font-family: ${STYLES.fontFamily};">
              <strong>🎉 Your 14-day free trial has started!</strong><br/>
              No credit card required to explore all features.
            </p>
          </div>
          
          <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
            This link expires in 24 hours. If you didn't sign up for Salon Magik, you can safely ignore this email.
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

    const { email, firstName, userId, origin }: EmailVerificationRequest = await req.json();

    if (!email || !firstName || !userId) {
      return new Response(
        JSON.stringify({ error: "Email, firstName, and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Delete any existing tokens for this user
    await supabase
      .from("email_verification_tokens")
      .delete()
      .eq("user_id", userId);

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token
    const { error: insertError } = await supabase.from("email_verification_tokens").insert({
      user_id: userId,
      email: email.toLowerCase(),
      token,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Failed to store verification token:", insertError);
      throw new Error("Failed to generate verification link");
    }

    // Build verification link
    const verificationLink = `${origin}/verify-email?token=${token}`;

    // Replace variables in template
    const htmlBody = welcomeTemplate.body_html
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{verification_link\}\}/g, verificationLink);

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
        subject: welcomeTemplate.subject,
        html: htmlBody,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend API error:", errorData);
      throw new Error("Failed to send email");
    }

    console.log("Verification email sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-email-verification:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send verification email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
