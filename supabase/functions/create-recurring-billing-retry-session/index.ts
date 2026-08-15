import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RetrySessionRequest {
  tenantId: string;
  successUrl: string;
  cancelUrl: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { tenantId, successUrl, cancelUrl }: RetrySessionRequest = await req.json();
    if (!tenantId || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenantId, successUrl, cancelUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (userRole?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only owners can manage billing" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, currency")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Same total the recurring-billing cron would have charged — updating
    // your card here also pays whatever's currently due, in one step.
    const { data: totalRows, error: totalError } = await userClient.rpc("compute_tenant_recurring_total", {
      p_tenant_id: tenantId,
    });

    if (totalError) {
      console.error("compute_tenant_recurring_total error:", totalError);
      return new Response(JSON.stringify({ error: totalError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalRow = totalRows?.[0];
    const amount = Number(totalRow?.total_amount || 0);
    const currency = totalRow?.currency || (tenant.currency || "NGN").toUpperCase();

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Nothing is currently due — there's no charge to attach a new card to yet." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(JSON.stringify({ error: keyError || `Paystack not configured for currency ${currency}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always redirect through checkout here, even if a (broken) card is
    // already on file — the whole point is capturing a fresh one, so we
    // never take the direct chargeAuthorization-with-existing-token path
    // other checkout functions use.
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(amount * 100),
        currency,
        callback_url: successUrl,
        metadata: {
          tenant_id: tenantId,
          cancel_action: cancelUrl,
          intent: "recurring_billing_retry",
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      console.error("Paystack initialization error:", paystackData);
      return new Response(JSON.stringify({ error: paystackData.message || "Failed to initialize payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ url: paystackData.data.authorization_url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("create-recurring-billing-retry-session error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
