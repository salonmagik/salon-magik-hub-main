import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SyncRequestBody {
  planPricingId: string;
}

interface CodeSyncResult {
  cycle: "monthly" | "annual";
  code: string;
  status: "synced" | "skipped" | "error";
  detail?: string;
}

async function updatePaystackPlanAmount(
  code: string,
  amountInSubunit: number,
  secretKey: string,
): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch(`https://api.paystack.co/plan/${encodeURIComponent(code)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: amountInSubunit }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status === false) {
    return { ok: false, detail: data?.message || `Paystack returned ${res.status}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const rawAuthHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const accessToken = rawAuthHeader.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization bearer token. Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: actor }, error: actorErr } = await userClient.auth.getUser(accessToken);
    if (actorErr || !actor) {
      return new Response(
        JSON.stringify({ error: "Unauthorized session. Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: actorBackofficeUser } = await adminClient
      .from("backoffice_users")
      .select("user_id, role, is_active")
      .eq("user_id", actor.id)
      .maybeSingle();

    if (!actorBackofficeUser || actorBackofficeUser.role !== "super_admin" || actorBackofficeUser.is_active === false) {
      return new Response(
        JSON.stringify({ error: "Only active super admins can sync Paystack plan pricing" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { planPricingId }: SyncRequestBody = await req.json();
    if (!planPricingId) {
      return new Response(
        JSON.stringify({ error: "planPricingId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: pricingRow, error: pricingError } = await adminClient
      .from("plan_pricing")
      .select("id, currency, monthly_price, annual_price, paystack_plan_code_monthly, paystack_plan_code_annual, valid_until")
      .eq("id", planPricingId)
      .maybeSingle();

    if (pricingError || !pricingRow) {
      return new Response(
        JSON.stringify({ error: "Pricing row not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const currency = (pricingRow.currency || "").toUpperCase();
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(
        JSON.stringify({ error: keyError || `Paystack not configured for currency ${currency}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: CodeSyncResult[] = [];

    const cycles: Array<{ cycle: "monthly" | "annual"; code: string | null; amount: number }> = [
      { cycle: "monthly", code: pricingRow.paystack_plan_code_monthly, amount: Number(pricingRow.monthly_price) },
      { cycle: "annual", code: pricingRow.paystack_plan_code_annual, amount: Number(pricingRow.annual_price) },
    ];

    for (const { cycle, code, amount } of cycles) {
      if (!code) {
        results.push({ cycle, code: "", status: "skipped", detail: "No plan code set" });
        continue;
      }
      const amountInSubunit = Math.round(amount * 100);
      const result = await updatePaystackPlanAmount(code, amountInSubunit, paystackKey);
      results.push(
        result.ok
          ? { cycle, code, status: "synced" }
          : { cycle, code, status: "error", detail: result.detail },
      );
    }

    const hasError = results.some((r) => r.status === "error");

    await adminClient.from("audit_logs").insert({
      action: "paystack_plan_pricing_synced",
      entity_type: "plan_pricing",
      actor_user_id: actor.id,
      metadata: { planPricingId, currency, results },
    });

    return new Response(
      JSON.stringify({ success: !hasError, results }),
      { status: hasError ? 207 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("sync-paystack-plan-pricing error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
