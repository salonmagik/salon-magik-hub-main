import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Enforcement limits
const MAX_BROWSERS_PER_DEVICE = 2;
const MAX_DEVICES_PER_USER = 2;

interface GeoResult {
  city?: string;
  region?: string;
  country?: string;
}

async function lookupGeo(ip: string): Promise<GeoResult> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip === "::1") {
    return {};
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,regionName,country`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return {};
    const data = await res.json();
    if (data.status !== "success") return {};
    return { city: data.city, region: data.regionName, country: data.country };
  } catch {
    return {};
  }
}

function parseDeviceType(ua: string): string {
  const lower = ua.toLowerCase();
  if (/mobile|android|iphone|ipod/.test(lower)) return "mobile";
  if (/tablet|ipad/.test(lower)) return "tablet";
  return "desktop";
}

function parseBrowserName(ua: string): string {
  const lower = ua.toLowerCase();
  // Order matters: Edge and Opera both contain "chrome", check them first.
  if (/edg\/|edge\//.test(lower)) return "Edge";
  if (/opr\/|opera/.test(lower)) return "Opera";
  if (/chrome\//.test(lower) && !/chromium/.test(lower)) return "Chrome";
  if (/chromium\//.test(lower)) return "Chromium";
  if (/firefox\//.test(lower)) return "Firefox";
  if (/safari\//.test(lower) && !/chrome/.test(lower)) return "Safari";
  if (/msie|trident/.test(lower)) return "IE";
  return "Unknown";
}

function getRealIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    ""
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!roleRow?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant found for user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId: string = body.tenant_id || roleRow.tenant_id;

    const ip = getRealIp(req);
    const ua = req.headers.get("user-agent") || "";
    const deviceType = parseDeviceType(ua);
    const browserName = parseBrowserName(ua);
    const geo = await lookupGeo(ip);
    const now = new Date().toISOString();

    const sessionToken = authHeader.replace("Bearer ", "");

    // Detect new-device login BEFORE upserting so we can compare against
    // existing sessions. A "new device" means: this session token has never
    // been seen before AND no other active session from this IP exists.
    const { data: existingToken } = await supabase
      .from("staff_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .maybeSingle();

    const isNewSession = !existingToken;

    let isNewDevice = false;
    if (isNewSession && ip) {
      const { data: sessionsFromIp } = await supabase
        .from("staff_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("ip_address", ip)
        .is("ended_at", null)
        .limit(1);
      isNewDevice = !sessionsFromIp || sessionsFromIp.length === 0;
    }

    // Upsert current session — allows multiple concurrent sessions per user.
    await supabase.from("staff_sessions").upsert(
      {
        user_id: user.id,
        tenant_id: tenantId,
        session_token: sessionToken,
        last_activity_at: now,
        ended_at: null,
        end_reason: null,
        ip_address: ip || null,
        user_agent: ua || null,
        device_type: deviceType,
        browser_name: browserName,
        city: geo.city || null,
        country: geo.country || null,
        region: geo.region || null,
      },
      { onConflict: "session_token" },
    );

    // Also clean up any old NULL-token sessions left before the migration.
    await supabase
      .from("staff_sessions")
      .update({ ended_at: now, end_reason: "replaced" })
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .is("session_token", null)
      .is("ended_at", null);

    // --- Enforce per-device and per-user session limits ---
    // Fetch all active sessions for this user+tenant, oldest first.
    const { data: activeSessions } = await supabase
      .from("staff_sessions")
      .select("id, session_token, ip_address, last_activity_at")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .is("ended_at", null)
      .order("last_activity_at", { ascending: true });

    if (activeSessions && activeSessions.length > 0) {
      const toRevoke: string[] = [];

      // Group sessions by ip_address (proxy for "device").
      const byIp = new Map<string, typeof activeSessions>();
      for (const s of activeSessions) {
        const key = s.ip_address || "unknown";
        if (!byIp.has(key)) byIp.set(key, []);
        byIp.get(key)!.push(s);
      }

      // Per-device limit: max MAX_BROWSERS_PER_DEVICE concurrent sessions per IP.
      for (const [, sessions] of byIp) {
        if (sessions.length > MAX_BROWSERS_PER_DEVICE) {
          // Sessions are already sorted oldest-first. Skip the current session.
          const candidates = sessions.filter((s) => s.session_token !== sessionToken);
          const excess = sessions.length - MAX_BROWSERS_PER_DEVICE;
          candidates.slice(0, excess).forEach((s) => {
            if (!toRevoke.includes(s.id)) toRevoke.push(s.id);
          });
        }
      }

      // Per-user limit: max MAX_DEVICES_PER_USER distinct IPs (devices).
      // Determine "most recently active" timestamp per IP to rank them.
      const ipLatest = new Map<string, string>();
      for (const s of activeSessions) {
        const key = s.ip_address || "unknown";
        if (!ipLatest.has(key) || s.last_activity_at > ipLatest.get(key)!) {
          ipLatest.set(key, s.last_activity_at);
        }
      }

      const currentIpKey = ip || "unknown";
      const sortedIps = [...ipLatest.entries()]
        .sort((a, b) => a[1].localeCompare(b[1])); // oldest activity first

      if (sortedIps.length > MAX_DEVICES_PER_USER) {
        // Revoke all sessions from excess (oldest) IPs, never the current IP.
        const excess = sortedIps.length - MAX_DEVICES_PER_USER;
        const ipsToRevoke = new Set(
          sortedIps
            .filter(([ipKey]) => ipKey !== currentIpKey)
            .slice(0, excess)
            .map(([ipKey]) => ipKey),
        );
        for (const s of activeSessions) {
          const key = s.ip_address || "unknown";
          if (ipsToRevoke.has(key) && !toRevoke.includes(s.id)) {
            toRevoke.push(s.id);
          }
        }
      }

      if (toRevoke.length > 0) {
        await supabase
          .from("staff_sessions")
          .update({ ended_at: now, end_reason: "replaced" })
          .in("id", toRevoke);
      }
    }

    // Send new-device security email (fire-and-forget — never block the login)
    if (isNewDevice && user.email) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "security@salonmagik.com";
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://app.salonmagik.com";

      if (resendApiKey) {
        const locationLabel = [geo.city, geo.country].filter(Boolean).join(", ") || "Unknown location";
        const deviceLabel = `${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} · ${browserName}`;
        const signInTime = new Date(now).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        const reviewUrl = `${appBaseUrl}/login?review-sessions=true`;

        const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f4f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <div style="max-width:560px;background:#fff;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <div style="text-align:center;margin-bottom:28px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Salon Magik Security</p>
        </div>
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">New sign-in to your account</h1>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
          We noticed a new sign-in to your Salon Magik account. If this was you, no action is needed.
        </p>
        <div style="background:#f1f4f9;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:4px 0;width:120px;">Device</td>
              <td style="color:#111827;font-size:13px;font-weight:500;padding:4px 0;">${deviceLabel}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:4px 0;">Location</td>
              <td style="color:#111827;font-size:13px;font-weight:500;padding:4px 0;">${locationLabel}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:4px 0;">Time</td>
              <td style="color:#111827;font-size:13px;font-weight:500;padding:4px 0;">${signInTime}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:4px 0;">IP address</td>
              <td style="color:#111827;font-size:13px;font-weight:500;padding:4px 0;">${ip || "Unknown"}</td>
            </tr>
          </table>
        </div>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
          If you <strong>don't recognise this sign-in</strong>, you can review and end active sessions immediately.
        </p>
        <div style="text-align:center;margin:0 0 32px;">
          <a href="${reviewUrl}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:6px;text-decoration:none;">
            Review my sessions
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          © 2026 Salon Magik. All rights reserved.
        </p>
      </div>
    </td></tr>
  </table>
</body>
</html>`;

        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `Salon Magik Security <${fromEmail}>`,
            to: [user.email],
            subject: "New sign-in to your Salon Magik account",
            html,
          }),
        }).catch((err) => console.warn("New device email failed:", err));
      }
    }

    return new Response(JSON.stringify({ ok: true, isNewDevice }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("touch-staff-session error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
