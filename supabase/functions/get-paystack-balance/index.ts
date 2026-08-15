import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, getPaystackBalance } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const [ng, gh] = await Promise.all([
      (() => {
        const { key, error } = getPaystackKeyForCurrency("NGN");
        return key ? getPaystackBalance(key) : Promise.resolve({ balance: null, currency: null, error: error || "Not configured" });
      })(),
      (() => {
        const { key, error } = getPaystackKeyForCurrency("GHS");
        return key ? getPaystackBalance(key) : Promise.resolve({ balance: null, currency: null, error: error || "Not configured" });
      })(),
    ]);

    return json({ ng, gh });
  } catch (err) {
    console.error("get-paystack-balance error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
