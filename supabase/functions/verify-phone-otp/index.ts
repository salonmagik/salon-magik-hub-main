import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const { phone, otp } = await req.json();

    if (!phone || !otp || typeof phone !== "string" || typeof otp !== "string") {
      return json({ error: "phone and otp are required" }, 400);
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return json({ error: "Invalid phone or OTP format" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const otpHash = await hashOtp(otp);
    const now = new Date().toISOString();

    // Find most recent valid token for this phone
    const { data: token } = await admin
      .from("phone_otp_tokens")
      .select("id, user_id, otp_hash, expires_at, used")
      .eq("phone", phone)
      .eq("used", false)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!token) {
      return json({ error: "Code expired or not found. Request a new one." }, 400);
    }

    // Constant-time hash comparison (both are hex strings of same length)
    if (token.otp_hash !== otpHash) {
      return json({ error: "Incorrect code. Please try again." }, 400);
    }

    // Mark token as used immediately to prevent replay
    await admin
      .from("phone_otp_tokens")
      .update({ used: true })
      .eq("id", token.id);

    // supabase-js v2 removed the createSession/signInAsUser SDK wrapper;
    // call the GoTrue admin endpoint directly.
    const sessionRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${token.user_id}/session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({}),
      },
    );

    if (!sessionRes.ok) {
      const errBody = await sessionRes.json().catch(() => ({})) as Record<string, unknown>;
      console.error("[verify-phone-otp] session creation error:", errBody);
      return json({ error: "Failed to create session. Please try again." }, 500);
    }

    const sessionJson = await sessionRes.json() as Record<string, unknown>;
    const access_token = sessionJson.access_token as string | undefined;
    const refresh_token = sessionJson.refresh_token as string | undefined;

    if (!access_token || !refresh_token) {
      console.error("[verify-phone-otp] session missing tokens:", sessionJson);
      return json({ error: "Failed to create session. Please try again." }, 500);
    }

    return json({ success: true, access_token, refresh_token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("verify-phone-otp error:", err);
    return json({ error: message }, 500);
  }
});
