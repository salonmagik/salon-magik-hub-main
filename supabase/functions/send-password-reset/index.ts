import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  wrapEmailTemplate,
  createButton,
  paragraph,
  heading,
  getSenderName,
} from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PasswordResetRequest {
  email: string;
  origin?: string;
}

const defaultTemplate = {
  subject: "Reset your Salon Magik password",
  build: (resetLink: string) => {
    const content = `
      ${heading("Reset your password")}
      ${paragraph("We received a request to reset your password. Click below to create a new one.")}
      ${createButton("Reset password", resetLink)}
      ${paragraph("This link expires in 1 hour. If you didn’t request this, you can ignore this email.")}
      ${paragraph(
        `If the button doesn't work, copy and paste this link:<br/><a href="${resetLink}" style="color: #2563EB; word-break: break-all;">${resetLink}</a>`
      )}
    `;
    return wrapEmailTemplate(content, { mode: "product" });
  },
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
    const resolvedOrigin =
      origin?.trim() ||
      Deno.env.get("SALON_APP_URL") ||
      Deno.env.get("BASE_URL") ||
      "http://localhost:8080";
    const resetLink = `${resolvedOrigin.replace(/\/+$/, "")}/reset-password?token=${token}`;

    const htmlBody = defaultTemplate.build(resetLink);

    const sanitizedFromName = getSenderName({ mode: "product" }).replace(/[<>"\\n\\r]/g, "");

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
