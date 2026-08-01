import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, checkIpOtpRateLimit } from "../_shared/otp-ip-throttle.ts";
import { wrapEmailTemplate, paragraph, heading, smallText, buildFromAddress } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OTP_TTL_MINUTES = 10;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashOtp(otp: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(otp));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildOtpTemplate(otp: string) {
  const content = `
    ${heading("Confirm your new email")}
    ${paragraph("Use this one-time code to confirm this is the email you'd like on your Salon Magik account.")}
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
    ${paragraph(`Enter this code in the app. It's valid for ${OTP_TTL_MINUTES} minutes.`)}
    ${smallText("If you didn't request this, you can ignore this email — your account email won't change.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = authData.user.id;

    const { email } = await req.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const { data: available, error: availError } = await (admin.rpc as any)(
      "check_email_available",
      { p_exclude_user_id: callerId, p_email: normalizedEmail },
    );
    if (availError) {
      console.error("[request-email-change-otp] availability check error:", availError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
    if (available === false) {
      return json({ error: "This email is already associated with another account." }, 409);
    }

    const { data: rlSetting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "otp_rate_limit")
      .maybeSingle();
    const rlValue = (rlSetting?.value ?? {}) as Record<string, unknown>;
    const rlEnabled = typeof rlValue.enabled === "boolean" ? rlValue.enabled : true;
    const rlMaxPerHour = typeof rlValue.max_per_hour === "number" ? rlValue.max_per_hour : 3;
    const rlCooldownSeconds = typeof rlValue.cooldown_seconds === "number" ? rlValue.cooldown_seconds : 60;
    const rlMaxPerHourPerIp = typeof rlValue.max_per_hour_per_ip === "number" ? rlValue.max_per_hour_per_ip : 10;

    const clientIp = getClientIp(req);
    const { allowed: ipAllowed } = await checkIpOtpRateLimit(admin, clientIp, rlEnabled, rlMaxPerHourPerIp);
    if (!ipAllowed) {
      return json({ error: "hourly_limit", message: "Too many requests. Please try again later." }, 429);
    }

    if (rlEnabled) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countErr } = await admin
        .from("email_otp_tokens")
        .select("id", { count: "exact" })
        .eq("email", normalizedEmail)
        .eq("user_id", callerId)
        .gte("created_at", hourAgo);

      if (countErr) {
        console.error("[request-email-change-otp] rate-limit count error:", countErr);
        return json({ error: "hourly_limit", message: "Too many requests. Please try again later." }, 429);
      }
      if ((count ?? 0) >= rlMaxPerHour) {
        return json({ error: "hourly_limit", message: "Too many requests. Please try again later." }, 429);
      }

      const cooldownAgo = new Date(Date.now() - rlCooldownSeconds * 1000).toISOString();
      const { data: recent } = await admin
        .from("email_otp_tokens")
        .select("created_at")
        .eq("email", normalizedEmail)
        .eq("user_id", callerId)
        .gte("created_at", cooldownAgo)
        .limit(1)
        .maybeSingle();

      if (recent) {
        return json({ error: "cooldown", message: `Please wait ${rlCooldownSeconds} seconds before requesting another code.` }, 429);
      }
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("email_otp_tokens").insert({
      email: normalizedEmail,
      otp_hash: otpHash,
      user_id: callerId,
      expires_at: expiresAt,
      ip_address: clientIp,
    });
    if (insertError) {
      console.error("[request-email-change-otp] insert error:", insertError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [normalizedEmail],
        subject: "Confirm your new Salon Magik email",
        html: buildOtpTemplate(otp),
      }),
    });
    if (!response.ok) {
      const resendError = await response.text();
      console.error("[request-email-change-otp] resend error:", resendError);
      return json({ error: "Failed to send verification email." }, 500);
    }

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("request-email-change-otp error:", err);
    return json({ error: message }, 500);
  }
});
