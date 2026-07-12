import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MAX_PER_HOUR = 3;
const DEFAULT_COOLDOWN_SECONDS = 60;

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

async function loadRateLimitConfig(admin: ReturnType<typeof createClient>): Promise<{
  enabled: boolean;
  maxPerHour: number;
  cooldownSeconds: number;
}> {
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "otp_rate_limit")
    .maybeSingle();

  if (!data?.value || typeof data.value !== "object" || Array.isArray(data.value)) {
    return { enabled: true, maxPerHour: DEFAULT_MAX_PER_HOUR, cooldownSeconds: DEFAULT_COOLDOWN_SECONDS };
  }

  const v = data.value as Record<string, unknown>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    maxPerHour: typeof v.max_per_hour === "number" && v.max_per_hour > 0 ? v.max_per_hour : DEFAULT_MAX_PER_HOUR,
    cooldownSeconds: typeof v.cooldown_seconds === "number" && v.cooldown_seconds >= 0 ? v.cooldown_seconds : DEFAULT_COOLDOWN_SECONDS,
  };
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
    const config = await loadRateLimitConfig(admin);

    // Rate limiting disabled — allow immediately without recording an attempt.
    if (!config.enabled) {
      return new Response(
        JSON.stringify({ allowed: true, retryAt: new Date(Date.now() + 1000).toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const cooldownAgo = new Date(now.getTime() - config.cooldownSeconds * 1000).toISOString();

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
    if (latestAttempt && new Date(latestAttempt.created_at).getTime() >= new Date(cooldownAgo).getTime()) {
      const retryAt = new Date(new Date(latestAttempt.created_at).getTime() + config.cooldownSeconds * 1000).toISOString();
      return new Response(JSON.stringify({ allowed: false, reason: "cooldown", retryAt }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (recentAttempts.length >= config.maxPerHour) {
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
        retryAt: new Date(now.getTime() + config.cooldownSeconds * 1000).toISOString(),
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
