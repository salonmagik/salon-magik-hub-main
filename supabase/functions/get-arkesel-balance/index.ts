import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ghana uses one key (all SMS types share the same gateway).
// Nigeria uses two separate gateway keys — one per message type.
const ARKESEL_API_KEY_GH = Deno.env.get("ARKESEL_API_KEY_GH");
const ARKESEL_API_KEY_NG_TRANSACTIONAL = Deno.env.get("ARKESEL_API_KEY_NG_TRANSACTIONAL");
const ARKESEL_API_KEY_NG_PROMOTIONAL = Deno.env.get("ARKESEL_API_KEY_NG_PROMOTIONAL");

interface BalanceResult {
  balance: unknown;
  error?: string;
}

async function fetchBalance(apiKey: string, label: string): Promise<BalanceResult> {
  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/clients/balance-details", {
      method: "GET",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    console.log(`[get-arkesel-balance] ${label} HTTP ${res.status}:`, JSON.stringify(body));

    if (!res.ok) {
      return { balance: null, error: (body?.message as string) || `HTTP ${res.status}` };
    }
    if ((body?.status as string) === "error") {
      return { balance: null, error: (body?.message as string) || "API returned error" };
    }
    // v2 response: { status: "success", data: { balance: "123.45", ... } }
    const data = body?.data as Record<string, unknown> | null | undefined;
    const balance = data?.balance ?? body?.balance ?? null;
    return { balance };
  } catch (err) {
    return { balance: null, error: err instanceof Error ? err.message : "Request failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: bo } = await adminClient
      .from("backoffice_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bo) return json({ error: "Forbidden" }, 403);

    const [gh, ng_transactional, ng_promotional] = await Promise.all([
      ARKESEL_API_KEY_GH
        ? fetchBalance(ARKESEL_API_KEY_GH, "GH")
        : Promise.resolve({ balance: null, error: "Not configured" }),
      ARKESEL_API_KEY_NG_TRANSACTIONAL
        ? fetchBalance(ARKESEL_API_KEY_NG_TRANSACTIONAL, "NG-transactional")
        : Promise.resolve({ balance: null, error: "Not configured" }),
      ARKESEL_API_KEY_NG_PROMOTIONAL
        ? fetchBalance(ARKESEL_API_KEY_NG_PROMOTIONAL, "NG-promotional")
        : Promise.resolve({ balance: null, error: "Not configured" }),
    ]);

    return json({ gh, ng_transactional, ng_promotional });
  } catch (err) {
    console.error("get-arkesel-balance error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
