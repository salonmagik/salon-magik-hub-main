import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, chargeAuthorization } from "../_shared/paystack-helpers.ts";
import { sendReceiptEmail } from "../_shared/receipts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PlanConfigCheckoutRequest {
  tenantId: string;
  branches: number;
  seats: number;
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

    const { tenantId, branches, seats, successUrl, cancelUrl }: PlanConfigCheckoutRequest = await req.json();
    if (!tenantId || branches == null || seats == null || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenantId, branches, seats, successUrl, cancelUrl" }),
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
      .select("id, name, logo_url, currency, paystack_authorization_code, paystack_authorization_email")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the quote — server-computed, never trust a client-supplied price.
    // Must run as the calling user (not the service role): compute_plan_configuration
    // checks auth.uid() internally, which is null for service-role calls.
    const { data: quoteRows, error: quoteError } = await userClient.rpc("compute_plan_configuration", {
      p_tenant_id: tenantId,
      p_branches: branches,
      p_seats: seats,
    });

    if (quoteError) {
      console.error("compute_plan_configuration error:", quoteError);
      return new Response(JSON.stringify({ error: quoteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quote = quoteRows?.[0];
    if (!quote) {
      return new Response(JSON.stringify({ error: "Could not compute a quote" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quote.requires_custom_locations) {
      return new Response(
        JSON.stringify({ error: "That many branches requires a custom plan — contact support." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (quote.price_delta == null || quote.price_delta <= 0) {
      return new Response(
        JSON.stringify({ error: "This change has no net cost increase — use apply_plan_configuration directly instead." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const discountAmount = Number(quote.discount_amount || 0);
    const chargeAmount = Math.max(quote.price_delta - discountAmount, 0);
    const currency = quote.currency || "NGN";
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(JSON.stringify({ error: keyError || `Paystack not configured for currency ${currency}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Card already on file: charge the delta now, no redirect needed.
    if (tenant.paystack_authorization_code) {
      let reference = `promo-covered:${crypto.randomUUID()}`;

      // A promo can fully cover the delta — nothing to charge, but the
      // change still applies and the promo use still gets consumed below.
      if (chargeAmount > 0) {
        const chargeResult = await chargeAuthorization(paystackKey, {
          authorizationCode: tenant.paystack_authorization_code,
          email: tenant.paystack_authorization_email || user.email!,
          amountInMajorUnits: chargeAmount,
          currency,
          metadata: { intent: "plan_configuration", tenant_id: tenantId, branches, seats },
        });

        if (!chargeResult.success) {
          return new Response(JSON.stringify({ error: chargeResult.error || "Charge failed" }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        reference = chargeResult.reference;
      }

      const { data: applyResult, error: applyError } = await userClient.rpc("apply_plan_configuration", {
        p_tenant_id: tenantId,
        p_branches: branches,
        p_seats: seats,
        p_source: "owner_self_serve",
        p_reason: "Plan configuration change (charged via stored card)",
      });

      if (applyError) {
        console.error("apply_plan_configuration error after successful charge:", applyError);
        return new Response(
          JSON.stringify({ error: "Payment succeeded but applying the change failed. Contact support.", reference }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // A real charge just succeeded, so this tenant is no longer just
      // trialing — without this, paying customers kept seeing trial-ending
      // banners forever.
      await supabase.from("tenants").update({ subscription_status: "active" }).eq("id", tenantId);

      if (discountAmount > 0) {
        await supabase.rpc("consume_tenant_sales_promo_use", {
          p_tenant_id: tenantId,
          p_surface: "subscription",
          p_usage_reference: `plan-config:${reference}`,
          p_amount: discountAmount,
        });
      }

      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        action: "plan_configuration_charged",
        entity_type: "tenant",
        entity_id: tenantId,
        metadata: { reference, branches, seats, price_delta: quote.price_delta, discount_amount: discountAmount, charged: chargeAmount, currency },
      });

      const receiptEmail = tenant.paystack_authorization_email || user.email;
      if (receiptEmail && chargeAmount > 0) {
        await sendReceiptEmail({
          recipientEmail: receiptEmail,
          salonName: tenant.name,
          salonLogoUrl: tenant.logo_url,
          title: "Your Salon Magik billing was updated",
          lineItems: [{ label: `Plan configuration update (${branches} branches, ${seats} seats)`, amount: chargeAmount }],
          total: chargeAmount,
          currency,
          reference,
        });
      }

      return new Response(
        JSON.stringify({ charged: true, immediate: true, applyResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // No card on file, but a promo fully covers the delta — nothing to
    // collect, apply directly rather than sending the owner through checkout
    // for a ₦0/GH₵0 charge.
    if (chargeAmount <= 0) {
      const { data: applyResult, error: applyError } = await userClient.rpc("apply_plan_configuration", {
        p_tenant_id: tenantId,
        p_branches: branches,
        p_seats: seats,
        p_source: "owner_self_serve",
        p_reason: "Plan configuration change (fully covered by promo)",
      });

      if (applyError) {
        console.error("apply_plan_configuration error (promo-covered):", applyError);
        return new Response(JSON.stringify({ error: applyError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("tenants").update({ subscription_status: "active" }).eq("id", tenantId);

      const promoReference = `plan-config:promo-covered:${crypto.randomUUID()}`;
      if (discountAmount > 0) {
        await supabase.rpc("consume_tenant_sales_promo_use", {
          p_tenant_id: tenantId,
          p_surface: "subscription",
          p_usage_reference: promoReference,
          p_amount: discountAmount,
        });
      }

      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        action: "plan_configuration_charged",
        entity_type: "tenant",
        entity_id: tenantId,
        metadata: { reference: promoReference, branches, seats, price_delta: quote.price_delta, discount_amount: discountAmount, charged: 0, currency },
      });

      return new Response(
        JSON.stringify({ charged: true, immediate: true, applyResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // No card on file yet — redirect through checkout; verify-plan-configuration-payment
    // applies the change once the payment is confirmed.
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(chargeAmount * 100),
        currency,
        callback_url: successUrl,
        metadata: {
          tenant_id: tenantId,
          branches,
          seats,
          cancel_action: cancelUrl,
          intent: "plan_configuration",
          discount_amount: discountAmount,
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
      JSON.stringify({ charged: false, immediate: false, url: paystackData.data.authorization_url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("create-plan-configuration-checkout-session error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
