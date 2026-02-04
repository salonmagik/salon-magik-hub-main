import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompleteResetRequest {
  token: string;
  password: string;
}

const passwordChangedTemplate = {
  subject: "Your Salon Magik password has been changed",
  body_html: `<div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #E11D48; font-style: italic; margin: 0; font-size: 32px;">Salon Magik</h1>
  </div>
  
  <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Password Changed Successfully</h2>
  
  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi there,</p>
  
  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
    Your password has been successfully changed. You can now sign in with your new password.
  </p>
  
  <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #E11D48;">
    <p style="color: #991b1b; margin: 0; font-size: 14px;">
      <strong>Didn't make this change?</strong><br/>
      If you didn't reset your password, please contact our support team immediately.
    </p>
  </div>
  
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

    const { token, password }: CompleteResetRequest = await req.json();

    if (!token || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Token and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Password validation
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find and validate token
    const { data: tokenData, error: findError } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (findError || !tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check expiration
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Token has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if already used
    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ success: false, error: "Token has already been used" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find user by email
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(
      (u) => u.email?.toLowerCase() === tokenData.email.toLowerCase()
    );

    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update password using Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: password,
    });

    if (updateError) {
      console.error("Failed to update password:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update password" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark token as used
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    // Send confirmation email
    try {
      const sanitizedFromName = "Salon Magik".replace(/[<>"\\n\\r]/g, "");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${sanitizedFromName} <${fromEmail}>`,
          to: [tokenData.email],
          subject: passwordChangedTemplate.subject,
          html: passwordChangedTemplate.body_html,
        }),
      });
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the whole operation if email fails
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in complete-password-reset:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
