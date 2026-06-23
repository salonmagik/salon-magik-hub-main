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
      .eq("action", "plan_configuration_charged")
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
    if (meta.intent !== "plan_configuration") {
      return new Response(JSON.stringify({ error: "Payment was not a plan configuration update" }), {
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

    const branches = Number(meta.branches);
    const seats = Number(meta.seats);
    if (!Number.isFinite(branches) || !Number.isFinite(seats)) {
      return new Response(JSON.stringify({ error: "Payment metadata missing branches/seats" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capture the reusable card token now that we have one, for future changes.
    const authorization = txData?.authorization;
    if (authorization?.reusable && authorization?.authorization_code) {
      await supabase
        .from("tenants")
        .update({
          paystack_authorization_code: authorization.authorization_code,
          paystack_customer_code: txData?.customer?.customer_code || null,
          paystack_authorization_email: txData?.customer?.email || null,
        })
        .eq("id", tenantId);
    }

    // Must run as the calling user, not the service role — apply_plan_configuration
    // checks auth.uid() internally, which is null for service-role calls.
    const { data: applyResult, error: applyError } = await userClient.rpc("apply_plan_configuration", {
      p_tenant_id: tenantId,
      p_branches: branches,
      p_seats: seats,
      p_source: "owner_self_serve",
      p_reason: "Plan configuration change (checkout redirect)",
    });

    if (applyError) {
      console.error("apply_plan_configuration error:", applyError);
      return new Response(JSON.stringify({ error: "Payment succeeded but applying the change failed. Contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = (txData?.amount || 0) / 100;

    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "plan_configuration_charged",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: { reference, branches, seats, price_delta: amount, currency },
    });

    const receiptEmail = txData?.customer?.email || user.email;
    if (receiptEmail) {
      await sendReceiptEmail({
        recipientEmail: receiptEmail,
        salonName: tenant.name,
        salonLogoUrl: tenant.logo_url,
        title: "Your Salon Magik billing was updated",
        lineItems: [{ label: `Plan configuration update (${branches} branches, ${seats} seats)`, amount }],
        total: amount,
        currency,
        reference,
      });
    }

    return new Response(JSON.stringify({ applied: true, applyResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("verify-plan-configuration-payment error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
