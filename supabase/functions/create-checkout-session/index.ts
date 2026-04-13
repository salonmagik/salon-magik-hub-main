import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { priceId, tenantId, billingCycle, successUrl, cancelUrl } = await req.json();

    if (!priceId || !tenantId || !successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is owner of tenant
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (userRole?.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can manage billing" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId: string;

    const { data: existingCustomer } = await supabase
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .single();

    if (existingCustomer?.stripe_customer_id) {
      stripeCustomerId = existingCustomer.stripe_customer_id;
    } else {
      // Get tenant info
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, currency")
        .eq("id", tenantId)
        .single();

      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.full_name || tenant?.name || "Salon",
        metadata: {
          tenant_id: tenantId,
          user_id: user.id,
        },
      });

      stripeCustomerId = customer.id;

      // Save to database
      await supabase.from("stripe_customers").insert({
        tenant_id: tenantId,
        stripe_customer_id: customer.id,
      });
    }

    let appliedPromo: Record<string, unknown> | null = null;
    let couponId: string | undefined;
    const normalizedBillingCycle = billingCycle === "annual" ? "annual" : "monthly";

    const { data: promoData, error: promoError } = await (supabase.rpc as any)("get_tenant_sales_promo_summary", {
      p_tenant_id: tenantId,
      p_surface: "subscription",
    });

    if (promoError) {
      console.error("Failed to load tenant subscription promo summary:", promoError);
    } else if (promoData) {
      const remainingUses = Math.max(1, Number(promoData.remaining_uses || 1));
      const durationMonths = normalizedBillingCycle === "annual" ? remainingUses * 12 : remainingUses;
      const couponPayload: Record<string, unknown> = {
        duration: remainingUses > 1 ? "repeating" : "once",
        metadata: {
          tenant_id: tenantId,
          promo_code_id: String(promoData.promo_code_id || ""),
          redemption_id: String(promoData.redemption_id || ""),
          billing_surface: "subscription",
        },
      };

      if (remainingUses > 1) {
        couponPayload.duration_in_months = durationMonths;
      }

      if (promoData.discount_type === "fixed") {
        couponPayload.currency = "usd";
        couponPayload.amount_off = 0;

        try {
          const priceData = await stripe.prices.retrieve(priceId);
          if (priceData.currency) {
            couponPayload.currency = priceData.currency;
          }
        } catch (priceError) {
          console.error("Failed to resolve Stripe price currency for promo coupon:", priceError);
        }

        couponPayload.amount_off = Math.max(0, Math.round(Number(promoData.discount_value || 0) * 100));
      } else {
        couponPayload.percent_off = Number(promoData.discount_value || 0);
      }

      const coupon = await stripe.coupons.create(couponPayload as Stripe.CouponCreateParams);
      couponId = coupon.id;
      appliedPromo = {
        promo_code_id: promoData.promo_code_id,
        redemption_id: promoData.redemption_id,
        discount_type: promoData.discount_type,
        discount_value: promoData.discount_value,
        remaining_uses: promoData.remaining_uses,
        coupon_id: coupon.id,
      };
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tenant_id: tenantId,
        billing_cycle: normalizedBillingCycle,
        promo_redemption_id: String(appliedPromo?.redemption_id || ""),
        promo_code_id: String(appliedPromo?.promo_code_id || ""),
      },
      subscription_data: {
        metadata: {
          tenant_id: tenantId,
          billing_cycle: normalizedBillingCycle,
          promo_redemption_id: String(appliedPromo?.redemption_id || ""),
          promo_code_id: String(appliedPromo?.promo_code_id || ""),
        },
      },
    });

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url, appliedPromo }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Checkout session error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
