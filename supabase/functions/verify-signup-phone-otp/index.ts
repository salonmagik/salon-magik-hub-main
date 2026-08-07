import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Signup counterpart to verify-phone-otp — that one mints a login session
// for an existing user, which doesn't apply here (no account exists yet).
// This just proves phone ownership as a boolean gate the signup form
// requires before it can submit. Scoped to user_id is null tokens, which
// send-signup-phone-otp always inserts, keeping this naturally separate
// from login/phone-change tokens for the same number.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 5;

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
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const otpHash = await hashOtp(otp);
    const now = new Date().toISOString();

    const { data: token } = await admin
      .from("phone_otp_tokens")
      .select("id, otp_hash, attempts, expires_at, used")
      .eq("phone", phone)
      .is("user_id", null)
      .eq("used", false)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!token) {
      return json({ error: "Code expired or not found. Request a new one." }, 400);
    }

    if (token.attempts >= MAX_ATTEMPTS) {
      await admin.from("phone_otp_tokens").update({ used: true }).eq("id", token.id);
      return json({ error: "Too many incorrect attempts. Request a new code." }, 429);
    }

    if (token.otp_hash !== otpHash) {
      const attempts = token.attempts + 1;
      await admin.from("phone_otp_tokens").update({ attempts }).eq("id", token.id);
      const remaining = MAX_ATTEMPTS - attempts;
      return json(
        {
          error:
            remaining > 0
              ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
              : "Too many incorrect attempts. Request a new code.",
        },
        400,
      );
    }

    // Mark token as used immediately to prevent replay. This IS the proof
    // of ownership send-email-verification re-checks before letting the
    // signup through — the frontend's "verified" flag is a UX convenience,
    // not the source of truth.
    await admin
      .from("phone_otp_tokens")
      .update({ used: true })
      .eq("id", token.id);

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("verify-signup-phone-otp error:", err);
    return json({ error: message }, 500);
  }
});
