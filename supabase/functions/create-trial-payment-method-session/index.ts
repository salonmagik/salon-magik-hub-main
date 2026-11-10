import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { tenantId, successUrl, cancelUrl } = await req.json();
    if (!tenantId || !successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "Missing tenantId, successUrl, or cancelUrl" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (role?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only owners can add a payment method" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, currency, subscription_status, trial_ends_at, paystack_authorization_code")
      .eq("id", tenantId)
      .single();
    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tenant.paystack_authorization_code) {
      return new Response(JSON.stringify({ error: "A payment method is already saved" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tenant.subscription_status !== "trialing" || !tenant.trial_ends_at) {
      return new Response(JSON.stringify({ error: "Payment methods can be added during the free trial or from billing recovery" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currency = String(tenant.currency || "").toUpperCase();
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(JSON.stringify({ error: keyError || `Paystack is not configured for ${currency}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Paystack only returns a reusable authorization after a successful
    // transaction. This is a visible ₦1/GH₵1 verification transaction; the
    // checkout copy explains it before the owner confirms payment.
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: 100,
        currency,
        callback_url: successUrl,
        metadata: {
          tenant_id: tenantId,
          tenant_name: tenant.name,
          cancel_action: cancelUrl,
          intent: "trial_payment_method_capture",
          verification_amount: 1,
        },
      }),
    });
    const payload = await paystackRes.json();
    if (!paystackRes.ok || !payload.status) {
      return new Response(JSON.stringify({ error: payload.message || "Failed to start payment method verification" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ url: payload.data.authorization_url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("create-trial-payment-method-session error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to start payment method verification" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
