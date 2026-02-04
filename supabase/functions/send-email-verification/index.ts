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

const welcomeTemplate = {
  subject: "Welcome to Salon Magik - Verify your email",
  body_html: `<div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #E11D48; font-style: italic; margin: 0; font-size: 32px;">Salon Magik</h1>
  </div>
  
  <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Welcome, {{first_name}}!</h2>
  
  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
    Thank you for signing up for Salon Magik. We're excited to help you manage your salon business.
  </p>
  
  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
    Please verify your email address to get started:
  </p>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="{{verification_link}}" 
       style="background-color: #E11D48; color: white; padding: 14px 28px; 
              text-decoration: none; border-radius: 8px; display: inline-block;
              font-weight: 500; font-size: 16px;">
      Verify Email
    </a>
  </div>
  
  <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="color: #991b1b; margin: 0; font-size: 14px;">
      <strong>🎉 Your 14-day free trial has started!</strong><br/>
      No credit card required to explore all features.
    </p>
  </div>
  
  <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
    This link expires in 24 hours. If you didn't sign up for Salon Magik, you can safely ignore this email.
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
