import {
  processWebhook,
  verifyPaystackSignature,
  WebhookEvent,
} from "../_shared/payment-webhook-processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function parseAppointmentIds(raw: string | string[] | undefined, fallback?: string): string[] {
  let values: string[] = [];

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [raw];
    } catch {
      values = [raw];
    }
  } else if (Array.isArray(raw)) {
    values = raw;
  } else if (fallback) {
    values = [fallback];
  }

  return values.filter((value): value is string => typeof value === "string" && isValidUUID(value));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY_NG");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    // Check Paystack signature header
    const paystackSignature = req.headers.get("x-paystack-signature");

    if (!paystackSignature) {
      console.error("No Paystack signature provided");
      return new Response(
        JSON.stringify({ error: "Missing webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!paystackSecretKey) {
      console.error("PAYSTACK_SECRET_KEY_NG not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get raw body for signature verification
    const rawBody = await req.text();

    let body: Record<string, unknown>;

    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("Invalid JSON payload");
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify Paystack webhook signature
    const isValid = await verifyPaystackSignature(rawBody, paystackSignature, paystackSecretKey);

    if (!isValid) {
      console.error("Invalid Paystack webhook signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paystackEvent = body as {
      event: string;
      data: {
        reference?: string;
        status?: string;
        amount?: number;
        metadata?: {
          appointment_id?: string;
          appointment_ids?: string;
          payment_intent_id?: string;
          tenant_id?: string;
          customer_id?: string;
          invoice_id?: string;
          credits?: string;
          is_deposit?: boolean | string;
          split_purse_amount?: string | number;
          split_customer_id?: string;
        };
      };
    };

    const data = paystackEvent.data;
    const metadata = data.metadata;

    const event: WebhookEvent = {
      type: paystackEvent.event,
      gateway: "paystack",
      data: {
        paymentIntentId: metadata?.payment_intent_id,
        appointmentId: metadata?.appointment_id,
        appointmentIds: parseAppointmentIds(metadata?.appointment_ids, metadata?.appointment_id),
        tenantId: metadata?.tenant_id,
        customerId: metadata?.customer_id,
        invoiceId: metadata?.invoice_id,
        credits: metadata?.credits ? parseInt(metadata.credits) : undefined,
        amount: data.amount ? data.amount / 100 : undefined,
        status: data.status,
        reference: data.reference,
        isDeposit: metadata?.is_deposit === true || metadata?.is_deposit === "true",
        splitPurseAmount: metadata?.split_purse_amount ? parseFloat(String(metadata.split_purse_amount)) : undefined,
        splitCustomerId: metadata?.split_customer_id,
      },
    };

    // Process webhook asynchronously - don't await
    processWebhook(event, supabaseUrl, supabaseServiceKey, resendApiKey, resendFromEmail);

    // Return 200 immediately to prevent Paystack timeout/retries
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
