import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";
import { sendReceiptEmail } from "../_shared/receipts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

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

    const { reference, tenantId } = await req.json();
    if (!reference || !tenantId) {
      return new Response(JSON.stringify({ error: "Missing reference or tenantId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller has owner role for this tenant
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (userRole?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only owners can verify subscription payments" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load tenant to get currency
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, logo_url, currency, subscription_status")
      .eq("id", tenantId)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already active — idempotent success
    if (tenant.subscription_status === "active") {
      return new Response(JSON.stringify({ activated: true, alreadyActive: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = (tenant.currency || "NGN").toUpperCase();
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(JSON.stringify({ error: keyError || "Paystack not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the transaction with Paystack
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackKey}` },
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.status) {
      console.error("Paystack verify error:", verifyData);
      return new Response(JSON.stringify({ error: "Could not verify payment with Paystack" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txData = verifyData.data;

    // Guard: payment must be successful
    if (txData?.status !== "success") {
      return new Response(JSON.stringify({ error: `Payment status is '${txData?.status}', not 'success'` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: metadata must confirm this was a subscription activation
    const meta = txData?.metadata || {};
    if (meta.intent !== "subscription_activation") {
      return new Response(JSON.stringify({ error: "Payment was not a subscription activation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: metadata tenant must match the caller's tenant
    if (meta.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: "Payment tenant mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capture the reusable card token (if Paystack returned one) so future
    // plan/add-on changes can be charged server-to-server with no redirect.
    const authorization = txData?.authorization;
    const tenantUpdate: Record<string, unknown> = { subscription_status: "active" };
    if (authorization?.reusable && authorization?.authorization_code) {
      tenantUpdate.paystack_authorization_code = authorization.authorization_code;
      tenantUpdate.paystack_customer_code = txData?.customer?.customer_code || null;
      tenantUpdate.paystack_authorization_email = txData?.customer?.email || null;
    }

    // Self-managed (monthly) signups have no Paystack Subscription — schedule
    // the first self-managed cycle so process-recurring-addon-billing picks
    // them up. Annual signups keep relying on Paystack's own Subscription
    // engine and must NOT get a next_billing_at, or they'd be double-billed.
    if (meta.billing_mode === "self_managed") {
      tenantUpdate.next_billing_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      tenantUpdate.billing_retry_count = 0;
    }

    // Activate the subscription
    const { error: updateError } = await supabase
      .from("tenants")
      .update(tenantUpdate)
      .eq("id", tenantId);

    if (updateError) {
      console.error("Failed to activate subscription:", updateError);
      return new Response(JSON.stringify({ error: "Failed to activate subscription" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const discountApplied = Number(meta.discount_applied || 0);
    if (discountApplied > 0) {
      await supabase.rpc("consume_tenant_sales_promo_use", {
        p_tenant_id: tenantId,
        p_surface: "subscription",
        p_usage_reference: `checkout:${reference}`,
        p_amount: discountApplied,
      });
    }

    await supabase.from("audit_logs").insert({
      action: "subscription.activated",
      entity_type: "tenants",
      entity_id: tenantId,
      actor_user_id: user.id,
      metadata: { reference, currency, intent: "subscription_activation", discount_applied: discountApplied },
    });

    const receiptEmail = txData?.customer?.email || user.email;
    if (receiptEmail) {
      await sendReceiptEmail({
        recipientEmail: receiptEmail,
        salonName: tenant.name,
        salonLogoUrl: tenant.logo_url,
        title: "Your Salon Magik subscription is active",
        lineItems: [{ label: "Subscription plan", amount: (txData?.amount || 0) / 100 }],
        total: (txData?.amount || 0) / 100,
        currency,
        reference,
      });
    }

    console.log(`Subscription activated for tenant ${tenantId} via reference ${reference}`);

    return new Response(JSON.stringify({ activated: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("verify-subscription-payment error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
