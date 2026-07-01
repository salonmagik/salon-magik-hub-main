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

    return new Response(JSON.stringify({ ok: true }), {
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
