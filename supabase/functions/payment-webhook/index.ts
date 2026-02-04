import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine gateway from headers
    const stripeSignature = req.headers.get("stripe-signature");
    const paystackSignature = req.headers.get("x-paystack-signature");

    const body = await req.json();
    
    let event: WebhookEvent;

    if (stripeSignature) {
      // Handle Stripe webhook
      // TODO: Verify signature with Stripe webhook secret
      event = {
        type: body.type,
        gateway: "stripe",
        data: {
          paymentIntentId: body.data?.object?.metadata?.payment_intent_id,
          appointmentId: body.data?.object?.metadata?.appointment_id,
          amount: body.data?.object?.amount_received ? body.data.object.amount_received / 100 : undefined,
          status: body.data?.object?.status,
          reference: body.data?.object?.id,
        },
      };
    } else if (paystackSignature) {
      // Handle Paystack webhook
      // TODO: Verify signature with Paystack secret
      event = {
        type: body.event,
        gateway: "paystack",
        data: {
          paymentIntentId: body.data?.metadata?.payment_intent_id,
          appointmentId: body.data?.metadata?.appointment_id,
          amount: body.data?.amount ? body.data.amount / 100 : undefined,
          status: body.data?.status,
          reference: body.data?.reference,
        },
      };
    } else {
      // Direct webhook call (for testing)
      event = body as WebhookEvent;
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
            payment_method: event.gateway === "stripe" ? "card" : "card",
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
