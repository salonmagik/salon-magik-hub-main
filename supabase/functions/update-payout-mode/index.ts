import { createClient } from "npm:@supabase/supabase-js@2";
import { updatePaystackSubaccount } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface UpdatePayoutModeRequest {
  tenantId: string;
  payoutMode: "automatic" | "on_demand";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const body: UpdatePayoutModeRequest = await req.json();
    const { tenantId, payoutMode } = body;

    if (!tenantId || (payoutMode !== "automatic" && payoutMode !== "on_demand")) {
      return json({ error: "Missing or invalid tenantId/payoutMode" }, 400);
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Only an owner or manager of THIS tenant may change how it gets paid.
    const { data: roleRow } = await serviceSupabase
      .from("user_roles")
      .select("id, role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("role", ["owner", "manager"])
      .maybeSingle();

    if (!roleRow) {
      return json({ error: "Not authorized to change payout settings for this salon" }, 403);
    }

    const { data: destinations, error: destinationsError } = await serviceSupabase
      .from("salon_payout_destinations")
      .select("id, currency, paystack_subaccount_code")
      .eq("tenant_id", tenantId)
      .not("paystack_subaccount_code", "is", null);

    if (destinationsError) {
      console.error("Error loading payout destinations:", destinationsError);
      return json({ error: "Failed to load payout destinations" }, 500);
    }

    const settlementSchedule = payoutMode === "automatic" ? "auto" : "manual";
    const errors: string[] = [];

    for (const dest of destinations || []) {
      try {
        await updatePaystackSubaccount(dest.currency, dest.paystack_subaccount_code!, {
          settlement_schedule: settlementSchedule,
        });
        await serviceSupabase
          .from("salon_payout_destinations")
          .update({ settlement_schedule: settlementSchedule })
          .eq("id", dest.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to update settlement_schedule for destination ${dest.id}:`, message);
        errors.push(`${dest.id}: ${message}`);
      }
    }

    if (errors.length > 0 && errors.length === (destinations || []).length && (destinations || []).length > 0) {
      // Every destination failed to update on Paystack's side — don't
      // silently flip the tenant's own mode to something Paystack itself
      // never actually applied.
      return json({ error: "Failed to update settlement schedule with Paystack", details: errors }, 502);
    }

    const { error: tenantUpdateError } = await serviceSupabase
      .from("tenants")
      .update({ payout_mode: payoutMode })
      .eq("id", tenantId);

    if (tenantUpdateError) {
      console.error("Error updating tenant payout_mode:", tenantUpdateError);
      return json({ error: "Failed to save payout mode" }, 500);
    }

    return json({ success: true, payoutMode, warnings: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error("update-payout-mode error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
