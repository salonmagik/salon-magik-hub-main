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
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = authData.user.id;

    const { phone, otp } = await req.json();
    if (!phone || !otp || typeof phone !== "string" || typeof otp !== "string") {
      return json({ error: "phone and otp are required" }, 400);
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return json({ error: "Invalid phone or OTP format" }, 400);
    }

    const now = new Date().toISOString();
    // Scoped to THIS caller's own pending change request — a phone-change
    // token is never valid for anyone but the user who requested it.
    const { data: token } = await admin
      .from("phone_otp_tokens")
      .select("id, otp_hash, attempts, expires_at, used")
      .eq("phone", phone)
      .eq("user_id", callerId)
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

    const otpHash = await hashOtp(otp);
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

    // Re-check availability at confirm time too — guards against a race where
    // someone else claimed this phone between request and confirm.
    const { data: available, error: availError } = await (admin.rpc as any)(
      "check_phone_available",
      { p_exclude_user_id: callerId, p_phone: phone },
    );
    if (availError) {
      console.error("[confirm-phone-change] availability check error:", availError);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
    if (available === false) {
      return json({ error: "This phone number is already associated with another account." }, 409);
    }

    await admin.from("phone_otp_tokens").update({ used: true }).eq("id", token.id);

    const { error: profileError } = await admin
      .from("profiles")
      .update({ phone })
      .eq("user_id", callerId);
    if (profileError) {
      console.error("[confirm-phone-change] profile update error:", profileError);
      return json({ error: "Failed to update phone number. Please try again." }, 500);
    }

    // Keep any linked customer record(s) for this exact identity in sync too.
    await admin.from("customers").update({ phone }).eq("user_id", callerId);

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("confirm-phone-change error:", err);
    return json({ error: message }, 500);
  }
});
