import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  tenantId: string;
  appointmentId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  description: string;
  isDeposit: boolean;
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
    } = body;

    // Validate required fields
    if (!tenantId || !appointmentId || !amount || !customerEmail) {
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

    // Determine gateway based on region (Paystack for NG/GH, Stripe otherwise)
    const usePaystack = ["NG", "GH", "Nigeria", "Ghana"].includes(tenant.country);
    
    // Store payment intent in database
    const { data: paymentIntent, error: intentError } = await supabase
      .from("payment_intents")
      .insert({
        tenant_id: tenantId,
        appointment_id: appointmentId,
        amount: amount,
        currency: currency.toUpperCase(),
        customer_email: customerEmail,
        customer_name: customerName,
        gateway: usePaystack ? "paystack" : "stripe",
        is_deposit: isDeposit,
        status: "pending",
      })
      .select("id")
      .single();

    if (intentError) {
      console.error("Error creating payment intent:", intentError);
      // Continue without storing - payment can still work
    }

    // For now, return a mock checkout URL
    // In production, integrate with actual Stripe/Paystack APIs
    const mockCheckoutId = crypto.randomUUID();
    
    // TODO: Replace with actual gateway integration
    // For Stripe: Create Checkout Session via Stripe API
    // For Paystack: Create Transaction via Paystack API
    
    const checkoutUrl = `${successUrl}?session_id=${mockCheckoutId}&payment_intent=${paymentIntent?.id || "mock"}`;

    return new Response(
      JSON.stringify({
        checkoutUrl,
        gateway: usePaystack ? "paystack" : "stripe",
        paymentIntentId: paymentIntent?.id,
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
