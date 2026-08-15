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

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (userRole?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only owners can verify billing payments" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if this reference was already applied, return success without re-applying.
    const { data: existingLog } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("action", "recurring_billing_retry_charged")
      .contains("metadata", { reference })
      .maybeSingle();

    if (existingLog) {
      return new Response(JSON.stringify({ applied: true, alreadyApplied: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, logo_url, currency")
      .eq("id", tenantId)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
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

    if (txData?.status !== "success") {
      return new Response(JSON.stringify({ error: `Payment status is '${txData?.status}', not 'success'` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = txData?.metadata || {};
    if (meta.intent !== "recurring_billing_retry") {
      return new Response(JSON.stringify({ error: "Payment was not a billing retry" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (meta.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: "Payment tenant mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authorization = txData?.authorization;
    if (!authorization?.reusable || !authorization?.authorization_code) {
      return new Response(
        JSON.stringify({ error: "Payment succeeded but this card can't be saved for future billing. Try a different card." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Card captured, billing unblocked: fresh token, reset retry state, and
    // schedule the next cycle from today rather than leaving the old
    // next_billing_at (frozen null since billing stopped retrying) in place.
    await supabase
      .from("tenants")
      .update({
        paystack_authorization_code: authorization.authorization_code,
        paystack_customer_code: txData?.customer?.customer_code || null,
        paystack_authorization_email: txData?.customer?.email || null,
        subscription_status: "active",
        billing_retry_count: 0,
        next_billing_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", tenantId);

    const amount = (txData?.amount || 0) / 100;

    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "recurring_billing_retry_charged",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: { reference, amount, currency },
    });

    const receiptEmail = txData?.customer?.email || user.email;
    if (receiptEmail) {
      await sendReceiptEmail({
        recipientEmail: receiptEmail,
        salonName: tenant.name,
        salonLogoUrl: tenant.logo_url,
        title: "Your Salon Magik payment method was updated",
        lineItems: [{ label: "Salon Magik subscription (this billing cycle)", amount }],
        total: amount,
        currency,
        reference,
      });
    }

    return new Response(JSON.stringify({ applied: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("verify-recurring-billing-retry-session error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
