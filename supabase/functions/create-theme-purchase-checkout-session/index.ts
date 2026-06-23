import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, chargeAuthorization } from "../_shared/paystack-helpers.ts";
import { sendReceiptEmail } from "../_shared/receipts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ThemePurchaseCheckoutRequest {
  tenantId: string;
  themeKey?: string;
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

    const { tenantId, themeKey = "ecommerce", successUrl, cancelUrl }: ThemePurchaseCheckoutRequest = await req.json();
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
      .select("id, name, logo_url, country, currency, paystack_authorization_code, paystack_authorization_email")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = (tenant.currency || "NGN").toUpperCase();

    const { data: pricingRow, error: pricingError } = await supabase
      .from("theme_addon_pricing")
      .select("unit_price")
      .eq("theme_key", themeKey)
      .eq("country_code", tenant.country || "")
      .eq("currency", currency)
      .eq("status", "active")
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pricingError || !pricingRow) {
      return new Response(JSON.stringify({ error: "Theme pricing isn't set up for your country/currency yet." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Number(pricingRow.unit_price || 0);
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid theme price" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      return new Response(JSON.stringify({ error: keyError || `Paystack not configured for currency ${currency}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Card already on file: charge now, no redirect needed.
    if (tenant.paystack_authorization_code) {
      const chargeResult = await chargeAuthorization(paystackKey, {
        authorizationCode: tenant.paystack_authorization_code,
        email: tenant.paystack_authorization_email || user.email!,
        amountInMajorUnits: amount,
        currency,
        metadata: { intent: "theme_purchase", tenant_id: tenantId, theme_key: themeKey },
      });

      if (!chargeResult.success) {
        return new Response(JSON.stringify({ error: chargeResult.error || "Charge failed" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: activateError } = await userClient.rpc("purchase_tenant_theme_addon_and_log_billing", {
        p_tenant_id: tenantId,
        p_theme_key: themeKey,
        p_source: "owner_self_serve",
        p_reason: "Tenant activated the annual e-commerce storefront theme (charged via stored card).",
      });

      if (activateError) {
        console.error("purchase_tenant_theme_addon_and_log_billing error after successful charge:", activateError);
        return new Response(
          JSON.stringify({ error: "Payment succeeded but activating the theme failed. Contact support.", reference: chargeResult.reference }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        action: "theme_purchase_charged",
        entity_type: "tenant",
        entity_id: tenantId,
        metadata: { reference: chargeResult.reference, theme_key: themeKey, amount, currency },
      });

      const receiptEmail = tenant.paystack_authorization_email || user.email;
      if (receiptEmail) {
        await sendReceiptEmail({
          recipientEmail: receiptEmail,
          salonName: tenant.name,
          salonLogoUrl: tenant.logo_url,
          title: "Your Salon Magik storefront theme is active",
          lineItems: [{ label: "E-commerce storefront theme (annual)", amount }],
          total: amount,
          currency,
          reference: chargeResult.reference,
        });
      }

      return new Response(
        JSON.stringify({ charged: true, immediate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // No card on file yet — redirect through checkout; verify-theme-purchase-payment
    // activates the theme once the payment is confirmed.
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
          theme_key: themeKey,
          cancel_action: cancelUrl,
          intent: "theme_purchase",
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
    console.error("create-theme-purchase-checkout-session error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
