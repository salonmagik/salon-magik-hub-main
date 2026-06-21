import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckoutRequest {
  tenantId: string;
  successUrl: string;
  cancelUrl: string;
  billingCycle?: "monthly" | "annual";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { tenantId, successUrl, cancelUrl, billingCycle = "monthly" }: CheckoutRequest = await req.json();
    if (!tenantId || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenantId, successUrl, cancelUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Only owners may initiate subscription checkout
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (userRole?.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can manage billing" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load tenant — need currency and plan slug
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, currency, plan")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const currency = (tenant.currency || "NGN").toUpperCase();

    // Resolve Paystack secret key for this currency
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(
        JSON.stringify({ error: keyError || `Paystack not configured for currency ${currency}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up the Paystack plan code for this plan + currency combination
    let paystackPlanCode: string | null = null;
    let localPlanAmount: number = 0; // the amount to be paid stored in our records
    if (tenant.plan) {
      const { data: planRow } = await supabase
        .from("plans")
        .select("id")
        .eq("slug", tenant.plan)
        .maybeSingle();

      if (planRow?.id) {
        const { data: pricingRow } = await supabase
          .from("plan_pricing")
          .select("paystack_plan_code_monthly, paystack_plan_code_annual, annual_price, monthly_price")
          .eq("plan_id", planRow.id)
          .eq("currency", currency)
          .is("valid_until", null)
          .maybeSingle();
        paystackPlanCode = billingCycle === "annual"
          ? (pricingRow?.paystack_plan_code_annual ?? null)
          : (pricingRow?.paystack_plan_code_monthly ?? null);
        localPlanAmount = billingCycle === "annual"
          ? (pricingRow?.annual_price ?? 0)
          : (pricingRow?.monthly_price ?? 0);
      }
    }

    // Build Paystack transaction initialization payload.
    // Providing a `plan` code causes Paystack to automatically create a recurring
    // subscription after the first successful payment — no separate API call needed.
    const paystackBody: Record<string, unknown> = {
      email: user.email,
      callback_url: successUrl,
      metadata: {
        tenant_id: tenantId,
        tenant_name: tenant.name,
        cancel_action: cancelUrl,
        intent: "subscription_activation",
      },
    };

    if (paystackPlanCode && localPlanAmount > 0) {
      // Subscription: amount comes from the plan definition, not the request
      paystackBody.plan = paystackPlanCode;
      paystackBody.amount = localPlanAmount * 100; // paystack expects amount in the initialization request even if the plan code is provided, but it will be ignored and the plan's amount will be used instead. Amount is in kobo/pesewas.
      paystackBody.currency = currency;
    } else {
      // No plan code configured yet — fall back to a small authorization charge.
      // Amount in lowest unit (kobo / pesewas): 100 = ₦1 / GH₵1.
      paystackBody.amount = 100;
      paystackBody.currency = currency;
      console.warn(
        `No Paystack plan code for tenant ${tenantId} (plan: ${tenant.plan}, currency: ${currency}). Falling back to ₦1/GH₵1 authorization.`,
      );
    }

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackBody),
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      console.error("Paystack initialization error:", paystackData);
      return new Response(
        JSON.stringify({ error: paystackData.message || "Failed to initialize payment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ url: paystackData.data.authorization_url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("create-checkout-session error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
