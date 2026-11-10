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
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { reference, tenantId } = await req.json();
    if (!reference || !tenantId) return new Response(JSON.stringify({ error: "Missing reference or tenantId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: role } = await supabase.from("user_roles").select("role").eq("tenant_id", tenantId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (role?.role !== "owner") return new Response(JSON.stringify({ error: "Only owners can verify payment methods" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: tenant } = await supabase.from("tenants").select("id, currency, subscription_status, trial_ends_at, paystack_authorization_code").eq("id", tenantId).single();
    if (!tenant) return new Response(JSON.stringify({ error: "Tenant not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (tenant.paystack_authorization_code) return new Response(JSON.stringify({ captured: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (tenant.subscription_status !== "trialing" || !tenant.trial_ends_at || new Date(tenant.trial_ends_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "Payment method capture is only available during the live trial" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(String(tenant.currency || "").toUpperCase());
    if (!paystackKey) return new Response(JSON.stringify({ error: keyError || "Paystack is not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackKey}` } });
    const payload = await verifyRes.json();
    if (!verifyRes.ok || !payload.status || payload.data?.status !== "success") {
      return new Response(JSON.stringify({ error: `Payment status is '${payload.data?.status || "unknown"}'` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const metadata = payload.data?.metadata || {};
    if (metadata.intent !== "trial_payment_method_capture" || metadata.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: "Payment was not a payment-method verification for this salon" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (Number(payload.data?.amount) !== 100 || String(payload.data?.currency || "").toUpperCase() !== String(tenant.currency || "").toUpperCase()) {
      return new Response(JSON.stringify({ error: "Payment verification amount or currency did not match" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authorization = payload.data?.authorization;
    if (!authorization?.reusable || !authorization.authorization_code) {
      return new Response(JSON.stringify({ error: "This payment method cannot be used for recurring billing. Please try another card." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: updateError } = await supabase.from("tenants").update({
      paystack_authorization_code: authorization.authorization_code,
      paystack_customer_code: payload.data?.customer?.customer_code || null,
      paystack_authorization_email: payload.data?.customer?.email || user.email || null,
      payment_method_captured_at: new Date().toISOString(),
      payment_method_capture_reference: reference,
    }).eq("id", tenantId);
    if (updateError) throw updateError;

    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "payment_method_captured",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: { reference, verification_amount: payload.data?.amount, currency: payload.data?.currency },
    });

    return new Response(JSON.stringify({ captured: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("verify-trial-payment-method error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to verify payment method" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
