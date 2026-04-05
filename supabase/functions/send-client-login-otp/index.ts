import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  wrapEmailTemplate,
  paragraph,
  heading,
  smallText,
  buildFromAddress,
} from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type LoginOtpRequest = {
  email: string;
};

type AuthUserSummary = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function buildOtpTemplate(firstName: string, otp: string) {
  const content = `
    ${heading(`Your sign-in code, ${firstName}`)}
    ${paragraph("Use this one-time code to continue signing in to your Salon Magik account center.")}
    <div style="margin: 28px 0; text-align: center;">
      <div style="
        display: inline-block;
        padding: 16px 24px;
        border-radius: 12px;
        background: #f5f7fa;
        border: 1px solid #e5e7eb;
        color: #1f2937;
        font-size: 32px;
        letter-spacing: 8px;
        font-weight: 600;
      ">${otp}</div>
    </div>
    ${paragraph("Enter this code in the app to verify your email and continue.")}
    ${smallText("If you did not request this code, you can ignore this email.")}
  `;

  return wrapEmailTemplate(content, { mode: "product" });
}

async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<AuthUserSummary | null> {
  // Use custom RPC function for efficient auth.users lookup (single query with index)
  const { data, error } = await admin.rpc("get_auth_user_by_email", {
    lookup_email: email
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email ?? null,
    user_metadata: (data.user_metadata as Record<string, unknown> | null) ?? {},
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { email }: LoginOtpRequest = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authUser = await findUserByEmail(admin, normalizedEmail);
    if (!authUser) {
      return new Response(JSON.stringify({ error: "No account found for this email." }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    } as any);

    if (generated.error) {
      throw generated.error;
    }

    const emailOtp = (generated.data?.properties as Record<string, unknown> | undefined)?.email_otp;
    console.log("Generated OTP for", "OTP:", emailOtp); // TODO: remove this after testing
    if (!emailOtp || typeof emailOtp !== "string") {
      throw new Error("Failed to generate email OTP");
    }

    const firstName =
      ((authUser.user_metadata?.first_name as string | undefined) ||
        (authUser.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
        "there").trim();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [normalizedEmail],
        subject: "Your Salon Magik sign-in code",
        html: buildOtpTemplate(firstName, emailOtp),
      }),
    });

    if (!response.ok) {
      const resendError = await response.text();
      console.error("send-client-login-otp resend error", resendError);
      throw new Error("Failed to send verification email");
    }

    return new Response(JSON.stringify({ success: true, verificationType: "magiclink" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("send-client-login-otp error", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to send verification email",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
