import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PaymentRequest {
  tenantId: string;
  appointmentId?: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  description: string;
  isDeposit?: boolean;
  successUrl: string;
  cancelUrl: string;
  preferredGateway?: "stripe" | "paystack"; // Allow user to select gateway
  intentType?: "appointment_payment" | "customer_purse_topup" | "salon_purse_topup" | "invoice_payment" | "messaging_credit_purchase";
  customerId?: string;
  invoiceId?: string;
  credits?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: PaymentRequest = await req.json();
    const {
      tenantId,
      appointmentId,
      amount,
      currency,
      customerEmail,
      customerName,
      description,
      isDeposit,
      successUrl,
      cancelUrl,
      preferredGateway,
      intentType = "appointment_payment",
      customerId,
      invoiceId,
      credits,
    } = body;

    // Validate required fields
    if (!tenantId || !amount || !customerEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch tenant to determine payment gateway
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, country, currency")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine gateway based on user preference or region
    // User preference takes precedence, otherwise auto-detect
    const isPaystackRegion = ["NG", "GH", "Nigeria", "Ghana"].includes(tenant.country) ||
                        ["NGN", "GHS"].includes(currency.toUpperCase());
    const usePaystack = preferredGateway 
      ? preferredGateway === "paystack" 
      : isPaystackRegion;

    // Generate unique reference
    const reference = `sm_${appointmentId?.substring(0, 8) || Date.now().toString().substring(0, 8)}_${Date.now()}`;

    // Store payment intent in database
    const { data: paymentIntent, error: intentError } = await supabase
      .from("payment_intents")
      .insert({
        tenant_id: tenantId,
        appointment_id: appointmentId || null,
        amount: amount,
        currency: currency.toUpperCase(),
        customer_email: customerEmail,
        customer_name: customerName,
        gateway: usePaystack ? "paystack" : "stripe",
        is_deposit: isDeposit || false,
        status: "pending",
        paystack_reference: usePaystack ? reference : null,
        intent_type: intentType,
      })
      .select("id")
      .single();

    if (intentError) {
      console.error("Error creating payment intent:", intentError);
    }

    let checkoutUrl: string;

    if (usePaystack) {
      // Paystack Integration
      if (!paystackSecretKey) {
        return new Response(
          JSON.stringify({ error: "Paystack not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Convert amount to minor units (kobo for NGN, pesewas for GHS)
      const amountInMinorUnits = Math.round(amount * 100);

      const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: customerEmail,
          amount: amountInMinorUnits,
          currency: currency.toUpperCase(),
          reference: reference,
          callback_url: successUrl,
          metadata: {
            appointment_id: appointmentId || null,
            payment_intent_id: paymentIntent?.id,
            tenant_id: tenantId,
            is_deposit: isDeposit || false,
            customer_name: customerName,
            intent_type: intentType,
            customer_id: customerId || null,
            invoice_id: invoiceId || null,
            credits: credits || null,
          },
        }),
      });

      const paystackData = await paystackResponse.json();

      if (!paystackResponse.ok || !paystackData.status) {
        console.error("Paystack error:", paystackData);
        return new Response(
          JSON.stringify({ error: paystackData.message || "Failed to initialize Paystack transaction" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update payment intent with Paystack access code
      if (paymentIntent?.id) {
        await supabase
          .from("payment_intents")
          .update({
            paystack_access_code: paystackData.data.access_code,
            status: "processing",
          })
          .eq("id", paymentIntent.id);
      }

      checkoutUrl = paystackData.data.authorization_url;
    } else {
      // Stripe Integration
      if (!stripeSecretKey) {
        return new Response(
          JSON.stringify({ error: "Stripe not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Convert amount to cents
      const amountInCents = Math.round(amount * 100);

      // Create Stripe Checkout Session
      const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "mode": "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price_data][currency]": currency.toLowerCase(),
          "line_items[0][price_data][product_data][name]": description || "Appointment Payment",
          "line_items[0][price_data][unit_amount]": amountInCents.toString(),
          "line_items[0][quantity]": "1",
          "customer_email": customerEmail,
          "success_url": `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          "cancel_url": cancelUrl,
          "metadata[appointment_id]": appointmentId || "",
          "metadata[payment_intent_id]": paymentIntent?.id || "",
          "metadata[tenant_id]": tenantId,
          "metadata[intent_type]": intentType,
          "metadata[customer_id]": customerId || "",
          "metadata[invoice_id]": invoiceId || "",
          "metadata[credits]": credits?.toString() || "",
        }),
      });

      const stripeData = await stripeResponse.json();

      if (!stripeResponse.ok) {
        console.error("Stripe error:", stripeData);
        return new Response(
          JSON.stringify({ error: stripeData.error?.message || "Failed to create Stripe session" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update payment intent with Stripe session ID
      if (paymentIntent?.id) {
        await supabase
          .from("payment_intents")
          .update({
            stripe_session_id: stripeData.id,
            status: "processing",
          })
          .eq("id", paymentIntent.id);
      }

      checkoutUrl = stripeData.url;
    }

    return new Response(
      JSON.stringify({
        checkoutUrl,
        gateway: usePaystack ? "paystack" : "stripe",
        paymentIntentId: paymentIntent?.id,
        reference: usePaystack ? reference : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating payment session:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
