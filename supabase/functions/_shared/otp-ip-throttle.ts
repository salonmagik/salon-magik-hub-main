import type { createClient } from "npm:@supabase/supabase-js@2";

type AdminClient = ReturnType<typeof createClient>;

/** Best-effort sender IP from the edge runtime's proxy headers. */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || null;
}

/**
 * Caps OTP sends per sender IP across ALL target phone numbers — the
 * existing per-phone limit alone doesn't stop one IP rotating through many
 * numbers. Reads its own knob from the same otp_rate_limit platform_setting
 * the per-phone limit uses, so it inherits the same enabled/disabled switch.
 */
export async function checkIpOtpRateLimit(
  admin: AdminClient,
  ip: string | null,
  enabled: boolean,
  maxPerHourPerIp: number,
): Promise<{ allowed: boolean }> {
  if (!ip || !enabled) return { allowed: true };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("phone_otp_tokens")
    .select("id", { count: "exact" })
    .eq("ip_address", ip)
    .gte("created_at", hourAgo);

  if (error) {
    console.error("[otp-ip-throttle] count error:", error);
    // Fail open on the IP check specifically — the per-phone limit above it
    // is the load-bearing guard; don't block real users on a metrics query.
    return { allowed: true };
  }

  return { allowed: (count ?? 0) < maxPerHourPerIp };
}
