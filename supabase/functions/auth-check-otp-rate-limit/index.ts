import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (isEmail) {
    return { value: trimmed.toLowerCase(), type: "email" as const, channel: "email" as const };
  }

  const digits = trimmed.replace(/[^\d+]/g, "");
  const normalized = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : `+${digits.replace(/\D/g, "")}`;
  return { value: normalized, type: "phone" as const, channel: "sms" as const };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { identifier, appScope = "client_portal" } = await req.json();
    if (!identifier || typeof identifier !== "string") {
      return new Response(JSON.stringify({ error: "Identifier is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const normalized = normalizeIdentifier(identifier);
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const minuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();

    const { data: attempts, error: attemptError } = await admin
      .from("auth_otp_attempts")
      .select("id, created_at")
      .eq("identifier", normalized.value)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });

    if (attemptError) {
      throw attemptError;
    }

    const recentAttempts = attempts ?? [];
    const latestAttempt = recentAttempts[0];
    if (latestAttempt && new Date(latestAttempt.created_at).getTime() >= new Date(minuteAgo).getTime()) {
      const retryAt = new Date(new Date(latestAttempt.created_at).getTime() + 60 * 1000).toISOString();
      return new Response(JSON.stringify({ allowed: false, reason: "cooldown", retryAt }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (recentAttempts.length >= 3) {
      const oldestActiveAttempt = recentAttempts[recentAttempts.length - 1];
      const retryAt = new Date(new Date(oldestActiveAttempt.created_at).getTime() + 60 * 60 * 1000).toISOString();
      return new Response(JSON.stringify({ allowed: false, reason: "hourly_limit", retryAt }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { error: insertError } = await admin.from("auth_otp_attempts").insert({
      identifier: normalized.value,
      identifier_type: normalized.type,
      channel: normalized.channel,
      app_scope: appScope,
    });

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        retryAt: new Date(now.getTime() + 60 * 1000).toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("auth-check-otp-rate-limit error", error);
    return new Response(JSON.stringify({ error: "Failed to validate OTP rate limit" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
