import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getPaystackKeyForCurrency,
  validateCurrencyMatch,
  determineEffectiveCurrency,
} from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvoicePaymentRequest {
  invoiceId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: InvoicePaymentRequest = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: "Missing invoiceId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice with tenant data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        tenant_id,
        customer_id,
        total,
        currency,
        status,
        tenants!inner(id, name, currency, country, payment_setup_status)
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice not found:", invoiceError);
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if invoice is already paid
    if (invoice.status === "paid") {
      return new Response(
        JSON.stringify({ error: "Invoice already paid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine effective currency and validate
    const effectiveCurrency = determineEffectiveCurrency(invoice.currency, (invoice.tenants as any).currency);

    if (!effectiveCurrency) {
      return new Response(
        JSON.stringify({ error: "Currency is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate currency consistency
    const currencyValidation = validateCurrencyMatch((invoice.tenants as any).currency, effectiveCurrency);
    if (!currencyValidation.isValid) {
      return new Response(
        JSON.stringify({ error: currencyValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get currency-specific Paystack key
    const paystackKeyResult = getPaystackKeyForCurrency(effectiveCurrency);
    if (paystackKeyResult.error || !paystackKeyResult.key) {
      return new Response(
        JSON.stringify({ error: paystackKeyResult.error || "Paystack not configured for this currency" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const paystackSecretKey = paystackKeyResult.key;

    // Fetch customer email
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("email, full_name")
      .eq("id", invoice.customer_id)
      .single();

    if (customerError || !customer) {
      console.error("Customer not found:", customerError);
      return new Response(
        JSON.stringify({ error: "Customer not found for invoice" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerEmail = customer.email;
    const customerName = customer.full_name || "";

    // Create payment intent with intent_type='invoice_payment'
    const reference = `invoice_${invoiceId.substring(0, 8)}_${Date.now()}`;
    const { data: paymentIntent, error: intentError } = await supabase
      .from("payment_intents")
      .insert({
        tenant_id: invoice.tenant_id,
        amount: invoice.total,
        currency: effectiveCurrency.toUpperCase(),
        customer_email: customerEmail,
        customer_name: customerName,
        gateway: "paystack",
        is_deposit: false,
        status: "pending",
        paystack_reference: reference,
        intent_type: "invoice_payment",
      })
      .select("id")
      .single();

    if (intentError) {
      console.error("Error creating payment intent:", intentError);
      return new Response(
        JSON.stringify({ error: "Failed to create payment intent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let storeSubaccountCode: string | null = null;
    // let customerChargedAmount = invoice.total;
    // let processingFeeAmount = 0;
    // const processingFeeRate = 0.01;

    const { data: payoutDest } = await supabase
      .from("salon_payout_destinations")
      .select("paystack_subaccount_code")
      .eq("tenant_id", invoice.tenant_id)
      .eq("is_default", true)
      .single();

    if (payoutDest?.paystack_subaccount_code) {
      storeSubaccountCode = payoutDest.paystack_subaccount_code;
      // processingFeeAmount = parseFloat((invoice.total * processingFeeRate).toFixed(2));
      // customerChargedAmount = invoice.total + processingFeeAmount;
    }

    // Convert amount to minor units (e.g. kobo for NGN)
    const amountInMinorUnits = Math.round(invoice.total * 100);

    const paystackPayload: any = {
      email: customerEmail,
      amount: amountInMinorUnits,
      currency: effectiveCurrency.toUpperCase(),
      reference: reference,
      metadata: {
        tenant_id: invoice.tenant_id,
        invoice_id: invoiceId,
        payment_intent_id: paymentIntent.id,
        intent_type: "invoice_payment",
        customer_name: customerName,
        service_amount: invoice.total,
        // processing_fee_rate: processingFeeRate,
        // processing_fee_amount: processingFeeAmount,
        // customer_charged_amount: customerChargedAmount,
        store_subaccount_code: storeSubaccountCode || "",
      },
    };

    if (storeSubaccountCode) {
      paystackPayload.subaccount = storeSubaccountCode;
    }

    // Initialize Paystack transaction
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack error:", paystackData);
      return new Response(
        JSON.stringify({ error: paystackData.message || "Failed to initialize Paystack transaction" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentUrl = paystackData.data.authorization_url;
    const accessCode = paystackData.data.access_code;

    // Update invoice with payment_link and payment_intent_id
    const { error: updateInvoiceError } = await supabase
      .from("invoices")
      .update({
        payment_link: paymentUrl,
        payment_intent_id: paymentIntent.id,
      })
      .eq("id", invoiceId);

    if (updateInvoiceError) {
      console.error("Error updating invoice:", updateInvoiceError);
    }

    // Update payment_intent with paystack_access_code
    const { error: updateIntentError } = await supabase
      .from("payment_intents")
      .update({
        paystack_access_code: accessCode,
        paystack_reference: reference,
        status: "processing",
      })
      .eq("id", paymentIntent.id);

    if (updateIntentError) {
      console.error("Error updating payment intent:", updateIntentError);
    }

    return new Response(
      JSON.stringify({
        paymentUrl,
        reference,
        paymentIntentId: paymentIntent.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating invoice payment session:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
