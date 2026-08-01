import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendArkeselSMS, resolveArkeselSenderId } from "../_shared/arkesel-client.ts";
import { getClientIp, checkIpOtpRateLimit } from "../_shared/otp-ip-throttle.ts";
import { sendOtpEmailFallback } from "../_shared/otp-email-fallback.ts";

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

    // This is the salon-admin login endpoint specifically — see
    // send-client-phone-otp for the client-portal counterpart. Split into two
    // functions (rather than a client-suppliable `strict` flag) so which
    // identity gets preferred, and whether a miss is silent or honest, can
    // never be toggled by whoever is calling.
    //
    // Look up user by phone stored in profiles table. A salon admin's contact
    // number and a customer's client-portal login phone are different
    // identity domains, kept deliberately separate — but both live in the
    // same profiles.phone column, so the SAME digits can legitimately match
    // two different accounts (e.g. an admin adds a customer using their own
    // number). .maybeSingle() would throw on that (previously left
    // unchecked, silently misreported as "no profile found"). Fetch all
    // matches and, when ambiguous, prefer the active salon-admin account.
    const { data: profileRows, error: profileLookupError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone", phone);

    if (profileLookupError) {
      console.error("[send-phone-otp] profile lookup error:", profileLookupError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }

    let profile: { user_id: string } | null = profileRows?.[0] ?? null;
    if (profileRows && profileRows.length > 1) {
      const candidateIds = profileRows.map((r) => r.user_id);
      const { data: adminRoles } = await admin
        .from("user_roles")
        .select("user_id")
        .in("user_id", candidateIds)
        .eq("is_active", true);
      const adminIds = new Set((adminRoles || []).map((r) => r.user_id));
      profile = profileRows.find((r) => adminIds.has(r.user_id)) ?? profileRows[0];
    }

    if (!profile?.user_id) {
      console.warn(`[send-phone-otp] no profile found for phone prefix +${phone.slice(1, 4)}`);
      // Silent success to avoid phone-number enumeration on the admin
      // login surface.
      return json({ success: true });
    }

    // Read rate limit config from platform_settings (falls back to safe defaults)
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
      // Hourly window cap — use select("id") without head:true so the count
      // comes back in the response body; head:true returns count via headers
      // which Deno's fetch silently drops, making count always null.
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countErr } = await admin
        .from("phone_otp_tokens")
        .select("id", { count: "exact" })
        .eq("phone", phone)
        .gte("created_at", hourAgo);

      if (countErr) {
        console.error("[send-phone-otp] rate-limit count error:", countErr);
        return json({ error: "hourly_limit", message: "Too many OTP requests. Please try again later." }, 429);
      }

      if ((count ?? 0) >= rlMaxPerHour) {
        return json({ error: "hourly_limit", message: "Too many OTP requests. Please try again later." }, 429);
      }

      // Per-request cooldown
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
      user_id: profile.user_id,
      expires_at: expiresAt,
      ip_address: clientIp,
    });

    console.log(`[send-phone-otp] Sending OTP to ${phone} for user ${profile.user_id}`);
    const smsResult = await sendArkeselSMS({
      to: phone,
      from: resolveArkeselSenderId(phone, null, "transactional"),
      message: `Your Salon Magik sign-in code is: ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
      useCase: "transactional",
    });
    console.log(`[send-phone-otp] SMS sent successfully. Message ID: ${JSON.stringify(smsResult?.data)}`);

    await sendOtpEmailFallback(admin, profile.user_id, otp, OTP_TTL_MINUTES);

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-phone-otp error:", err);
    return json({ error: message }, 500);
  }
});
