import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const otpHash = await hashOtp(otp);
    const now = new Date().toISOString();

    // Find most recent valid token for this phone
    const { data: token } = await admin
      .from("phone_otp_tokens")
      .select("id, user_id, otp_hash, attempts, expires_at, used")
      .eq("phone", phone)
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

    // Mark token as used immediately to prevent replay
    await admin
      .from("phone_otp_tokens")
      .update({ used: true })
      .eq("id", token.id);

    // A successful OTP-based login is itself proof of phone ownership —
    // mark it verified so the profile screen never asks for a separate
    // verification step for a number the user just logged in with.
    await admin
      .from("profiles")
      .update({ phone_verified_at: new Date().toISOString() })
      .eq("user_id", token.user_id as string)
      .eq("phone", phone);

    // Mint a session for the user. supabase-js v2 dropped the admin
    // "create session" helper and GoTrue exposes no REST endpoint to mint a
    // session by user id, so use the supported passwordless pattern: generate a
    // magiclink token for the user (admin), then verify that token to obtain a
    // real access/refresh token pair.
    const { data: userData, error: getUserErr } = await admin.auth.admin.getUserById(
      token.user_id as string,
    );
    if (getUserErr || !userData?.user) {
      console.error("[verify-phone-otp] could not resolve user:", getUserErr);
      return json({ error: "Failed to create session. Please try again." }, 500);
    }

    let email = userData.user.email;
    if (!email) {
      // Phone-only account (no email on file) — generateLink's magiclink type
      // is email-keyed, so assign an internal, non-deliverable placeholder
      // email so a session can still be minted. Never shown to the user and
      // does not affect their real contact info (phone remains the identity
      // they actually log in with).
      email = `${token.user_id}@phone.internal.salonmagik.com`;
      const { error: setEmailErr } = await admin.auth.admin.updateUserById(token.user_id as string, {
        email,
        email_confirm: true,
      });
      if (setEmailErr) {
        console.error("[verify-phone-otp] failed to assign placeholder email:", setEmailErr);
        return json({ error: "Failed to create session. Please try again." }, 500);
      }
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkErr || !hashedToken) {
      console.error("[verify-phone-otp] generateLink error:", linkErr);
      return json({ error: "Failed to create session. Please try again." }, 500);
    }

    // Verify the magiclink token on a non-admin client to get a session back.
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sessionData, error: verifyErr } = await authClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedToken,
    });
    const access_token = sessionData?.session?.access_token;
    const refresh_token = sessionData?.session?.refresh_token;

    if (verifyErr || !access_token || !refresh_token) {
      console.error("[verify-phone-otp] verifyOtp error:", verifyErr);
      return json({ error: "Failed to create session. Please try again." }, 500);
    }

    return json({ success: true, access_token, refresh_token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("verify-phone-otp error:", err);
    return json({ error: message }, 500);
  }
});
