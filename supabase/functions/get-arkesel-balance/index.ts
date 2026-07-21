import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARKESEL_API_KEY_GH = Deno.env.get("ARKESEL_API_KEY_GH");
const ARKESEL_API_KEY_NG = Deno.env.get("ARKESEL_API_KEY_NG");

async function fetchBalance(apiKey: string): Promise<{ balance: string | number | null; error?: string }> {
  try {
    const url = new URL("https://sms.arkesel.com/sms/api");
    url.searchParams.set("action", "check-balance");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("response", "json");

    const res = await fetch(url.toString());
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      return { balance: null, error: (body?.message as string) || `HTTP ${res.status}` };
    }

    // v1 API returns { balance: "...", status: "success" } at the top level
    const balance = body?.balance ?? null;
    if (body?.status && body.status !== "success" && balance == null) {
      return { balance: null, error: (body?.message as string) || String(body?.status) };
    }
    return { balance: balance as string | number | null };
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
    // Verify caller is an authenticated backoffice user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Verify backoffice role
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: bo } = await adminClient
      .from("backoffice_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bo) return json({ error: "Forbidden" }, 403);

    const [gh, ng] = await Promise.all([
      ARKESEL_API_KEY_GH ? fetchBalance(ARKESEL_API_KEY_GH) : Promise.resolve({ balance: null, error: "Not configured" }),
      ARKESEL_API_KEY_NG ? fetchBalance(ARKESEL_API_KEY_NG) : Promise.resolve({ balance: null, error: "Not configured" }),
    ]);

    return json({ gh, ng });
  } catch (err) {
    console.error("get-arkesel-balance error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
