import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-paystack-signature",
};

// Schema validation for webhook data
const WebhookMetadataSchema = z.object({
  appointment_id: z.string().uuid().optional(),
  payment_intent_id: z.string().uuid().optional(),
}).passthrough();

const StripeObjectSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  amount_received: z.number().nonnegative().optional(),
  metadata: WebhookMetadataSchema.optional(),
}).passthrough();

const StripeEventSchema = z.object({
  type: z.string().min(1),
  data: z.object({
    object: StripeObjectSchema,
  }),
}).passthrough();

const PaystackDataSchema = z.object({
  reference: z.string().min(1).optional(),
  status: z.string().optional(),
  amount: z.number().nonnegative().optional(),
  metadata: WebhookMetadataSchema.optional(),
}).passthrough();

const PaystackEventSchema = z.object({
  event: z.string().min(1),
  data: PaystackDataSchema,
}).passthrough();

interface WebhookEvent {
  type: string;
  gateway: "stripe" | "paystack";
  data: {
    paymentIntentId?: string;
    appointmentId?: string;
    amount?: number;
    status?: string;
    reference?: string;
  };
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateAmount(amount: number | undefined): number | undefined {
  if (amount === undefined) return undefined;
  if (amount < 0 || amount > 10000000) {
    console.error("Invalid amount value:", amount);
    return undefined;
  }
  return amount;
}

// Verify Stripe webhook signature using HMAC SHA256
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(",").reduce((acc, part) => {
      const [key, value] = part.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts["t"];
    const expectedSig = parts["v1"];

    if (!timestamp || !expectedSig) {
      console.error("Invalid Stripe signature format");
      return false;
    }

    // Check timestamp is within 5 minutes
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > 300) {
      console.error("Stripe webhook timestamp too old");
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === expectedSig;
  } catch (error) {
    console.error("Stripe signature verification error:", error);
    return false;
  }
}

// Verify Paystack webhook signature using HMAC SHA512
async function verifyPaystackSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === signature;
  } catch (error) {
    console.error("Paystack signature verification error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine gateway from headers
    const stripeSignature = req.headers.get("stripe-signature");
    const paystackSignature = req.headers.get("x-paystack-signature");

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
    
    let event: WebhookEvent;

    if (stripeSignature) {
      // Verify Stripe webhook signature
      if (!stripeWebhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET not configured");
        return new Response(
          JSON.stringify({ error: "Webhook secret not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyStripeSignature(rawBody, stripeSignature, stripeWebhookSecret);
      if (!isValid) {
        console.error("Invalid Stripe webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate Stripe payload structure
      const stripeResult = StripeEventSchema.safeParse(body);
      if (!stripeResult.success) {
        console.error("Invalid Stripe payload structure:", stripeResult.error.message);
        return new Response(
          JSON.stringify({ error: "Invalid payload structure" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const stripeEvent = stripeResult.data;
      const object = stripeEvent.data.object;
      const metadata = object.metadata;
      const appointmentId = metadata?.appointment_id;
      const paymentIntentId = metadata?.payment_intent_id;

      // Validate UUID format if provided
      if (appointmentId && !isValidUUID(appointmentId)) {
        console.error("Invalid appointment_id format:", appointmentId);
        return new Response(
          JSON.stringify({ error: "Invalid appointment_id format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      event = {
        type: stripeEvent.type,
        gateway: "stripe",
        data: {
          paymentIntentId,
          appointmentId,
          amount: validateAmount(object.amount_received ? object.amount_received / 100 : undefined),
          status: object.status,
          reference: object.id,
        },
      };
    } else if (paystackSignature) {
      // Verify Paystack webhook signature
      if (!paystackSecretKey) {
        console.error("PAYSTACK_SECRET_KEY not configured");
        return new Response(
          JSON.stringify({ error: "Webhook secret not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyPaystackSignature(rawBody, paystackSignature, paystackSecretKey);
      if (!isValid) {
        console.error("Invalid Paystack webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate Paystack payload structure
      const paystackResult = PaystackEventSchema.safeParse(body);
      if (!paystackResult.success) {
        console.error("Invalid Paystack payload structure:", paystackResult.error.message);
        return new Response(
          JSON.stringify({ error: "Invalid payload structure" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const paystackEvent = paystackResult.data;
      const data = paystackEvent.data;
      const metadata = data.metadata;
      const appointmentId = metadata?.appointment_id;
      const paymentIntentId = metadata?.payment_intent_id;

      // Validate UUID format if provided
      if (appointmentId && !isValidUUID(appointmentId)) {
        console.error("Invalid appointment_id format:", appointmentId);
        return new Response(
          JSON.stringify({ error: "Invalid appointment_id format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      event = {
        type: paystackEvent.event,
        gateway: "paystack",
        data: {
          paymentIntentId,
          appointmentId,
          amount: validateAmount(data.amount ? data.amount / 100 : undefined),
          status: data.status,
          reference: data.reference,
        },
      };
    } else {
      // Reject requests without valid signatures (no testing backdoor in production)
      console.error("No webhook signature provided");
      return new Response(
        JSON.stringify({ error: "Missing webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing webhook event:", event.type, event.gateway);

    // Handle payment success
    if (
      event.type === "checkout.session.completed" ||
      event.type === "payment_intent.succeeded" ||
      event.type === "charge.success"
    ) {
      const { appointmentId, amount, reference } = event.data;

      if (appointmentId && amount) {
        // Update appointment payment status
        const { error: appointmentError } = await supabase
          .from("appointments")
          .update({
            payment_status: "paid",
            amount_paid: amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", appointmentId);

        if (appointmentError) {
          console.error("Error updating appointment:", appointmentError);
        }

        // Get appointment details for transaction
        const { data: appointment } = await supabase
          .from("appointments")
          .select("tenant_id, customer_id, total_amount")
          .eq("id", appointmentId)
          .single();

        if (appointment) {
          // Record transaction
          await supabase.from("transactions").insert({
            tenant_id: appointment.tenant_id,
            customer_id: appointment.customer_id,
            appointment_id: appointmentId,
            type: "payment",
            amount: amount,
            payment_method: "card",
            gateway: event.gateway,
            gateway_reference: reference,
            status: "completed",
          });

          // Create notification for salon
          await supabase.from("notifications").insert({
            tenant_id: appointment.tenant_id,
            type: "payment_received",
            title: "Payment Received",
            description: `Payment of ${amount} received for booking`,
            entity_type: "appointment",
            entity_id: appointmentId,
            urgent: false,
          });
        }

        // Update payment intent status
        if (event.data.paymentIntentId) {
          await supabase
            .from("payment_intents")
            .update({
              status: "completed",
              gateway_reference: reference,
              updated_at: new Date().toISOString(),
            })
            .eq("id", event.data.paymentIntentId);
        }
      }
    }

    // Handle payment failure
    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "charge.failed"
    ) {
      const { paymentIntentId } = event.data;

      if (paymentIntentId) {
        await supabase
          .from("payment_intents")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentIntentId);
      }
    }

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
