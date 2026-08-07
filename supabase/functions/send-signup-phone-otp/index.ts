import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendArkeselSMS, resolveArkeselSenderId } from "../_shared/arkesel-client.ts";
import { getClientIp, checkIpOtpRateLimit } from "../_shared/otp-ip-throttle.ts";

// Verifies phone ownership BEFORE a trial account is created — trials don't
// require a card (deliberate, to build trust), so a real, reachable phone
// number is one of the few abuse signals available. Deliberately its own
// function rather than a flag on send-phone-otp/send-client-phone-otp:
// this one runs pre-account (no user_id yet, phone_otp_tokens.user_id is
// null here) and checks signup-specific dedup before ever sending an SMS.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OTP_TTL_MINUTES = 10;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashOtp(otp: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(otp));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      return json({ error: "Valid E.164 phone number required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Same dedup check the signup form itself hits on submit — checking it
    // here too means a phone that's already used (or trial-used) never
    // triggers an SMS send at all, not just a rejected final submit.
    const { data: conflict, error: conflictError } = await admin.rpc(
      "check_identity_availability",
      { p_email: null, p_phone: phone },
    );
    if (conflictError) {
      console.error("[send-signup-phone-otp] identity availability check failed:", conflictError);
    } else if (conflict === "tenant_phone") {
      return json({ error: "A salon already exists with this phone number. Please sign in." }, 409);
    } else if (conflict === "tenant_phone_trial_used") {
      return json({ error: "This phone number has already been used for a free trial. Please contact support if you'd like to start another one." }, 409);
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
      return json({ error: "hourly_limit", message: "Too many OTP requests. Please try again later." }, 429);
    }

    if (rlEnabled) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countErr } = await admin
        .from("phone_otp_tokens")
        .select("id", { count: "exact" })
        .eq("phone", phone)
        .gte("created_at", hourAgo);

      if (countErr) {
        console.error("[send-signup-phone-otp] rate-limit count error:", countErr);
        return json({ error: "hourly_limit", message: "Too many OTP requests. Please try again later." }, 429);
      }

      if ((count ?? 0) >= rlMaxPerHour) {
        return json({ error: "hourly_limit", message: "Too many OTP requests. Please try again later." }, 429);
      }

      const cooldownAgo = new Date(Date.now() - rlCooldownSeconds * 1000).toISOString();
      const { data: recent } = await admin
        .from("phone_otp_tokens")
        .select("created_at")
        .eq("phone", phone)
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

    await admin.from("phone_otp_tokens").insert({
      phone,
      otp_hash: otpHash,
      user_id: null,
      expires_at: expiresAt,
      ip_address: clientIp,
    });

    await sendArkeselSMS({
      to: phone,
      from: resolveArkeselSenderId(phone, null, "transactional"),
      message: `Your Salon Magik verification code is: ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
      useCase: "transactional",
    });

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-signup-phone-otp error:", err);
    return json({ error: message }, 500);
  }
});
