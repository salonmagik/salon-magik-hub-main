import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendArkeselSMS } from "../_shared/arkesel-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OTP_TTL_MINUTES = 10;
const OTP_SENDER = "SalonMagik";

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

    // Look up user by phone stored in profiles table
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone", phone)
      .maybeSingle();

    if (!profile?.user_id) {
      // Return generic success to avoid phone enumeration
      return json({ success: true });
    }

    // Rate limit: max 4 OTPs per phone per 30 minutes (aligns with client 4-attempt lockout)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("phone_otp_tokens")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", thirtyMinAgo);

    if ((count ?? 0) >= 4) {
      return json({ error: "hourly_limit", message: "Too many OTP requests. Please try again in 30 minutes." }, 429);
    }

    // Cooldown: must wait 60s between requests
    const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("phone_otp_tokens")
      .select("created_at")
      .eq("phone", phone)
      .gte("created_at", minuteAgo)
      .limit(1)
      .maybeSingle();

    if (recent) {
      return json({ error: "cooldown", message: "Please wait 60 seconds before requesting another code." }, 429);
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    await admin.from("phone_otp_tokens").insert({
      phone,
      otp_hash: otpHash,
      user_id: profile.user_id,
      expires_at: expiresAt,
    });

    console.log(`[send-phone-otp] Sending OTP to ${phone} for user ${profile.user_id}`);
    const smsResult = await sendArkeselSMS({
      to: phone,
      from: OTP_SENDER,
      message: `Your Salon Magik sign-in code is: ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
    });
    console.log(`[send-phone-otp] SMS sent successfully. Message ID: ${JSON.stringify(smsResult?.data)}`);

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-phone-otp error:", err);
    return json({ error: message }, 500);
  }
});
