import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GeoResult {
  city?: string;
  region?: string;
  country?: string;
}

async function lookupGeo(ip: string): Promise<GeoResult> {
  // Skip private/loopback addresses — geo lookup would be meaningless.
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

    // Resolve the tenant for this user (pick their first active role's tenant).
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
    const geo = await lookupGeo(ip);
    const now = new Date().toISOString();

    // The session_token is the Supabase access_token — unique per auth session.
    const sessionToken = authHeader.replace("Bearer ", "");

    // Upsert this session, mark old ones for the same user+tenant as replaced.
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
        city: geo.city || null,
        country: geo.country || null,
        region: geo.region || null,
      },
      { onConflict: "session_token" },
    );

    // Mark other active sessions for this user+tenant as replaced.
    // Uses or() to also catch old rows where session_token IS NULL
    // (neq alone skips NULLs in SQL comparison semantics).
    await supabase
      .from("staff_sessions")
      .update({ ended_at: now, end_reason: "replaced" })
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .or(`session_token.neq.${sessionToken},session_token.is.null`)
      .is("ended_at", null);

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
