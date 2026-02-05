import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_BILLING_WEBHOOK_SECRET");

    if (!stripeKey || !webhookSecret) {
      console.error("Stripe keys not configured");
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

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "No signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("Webhook signature verification failed:", errMsg);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing billing webhook:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const billingCycle = session.metadata?.billing_cycle || "monthly";

        if (tenantId && session.subscription) {
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0]?.price.id;

          // Find plan from Stripe price
          const { data: planPricing } = await supabase
            .from("plan_pricing")
            .select("plan_id")
            .eq("stripe_price_id", priceId)
            .single();

          // Create subscription record
          await supabase.from("subscriptions").upsert({
            tenant_id: tenantId,
            plan_id: planPricing?.plan_id || tenantId, // fallback
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            status: "active",
            billing_cycle: billingCycle,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }, { onConflict: "stripe_subscription_id" });

          // Update tenant status
          await supabase
            .from("tenants")
            .update({
              subscription_status: "active",
              stripe_subscription_id: subscription.id,
            })
            .eq("id", tenantId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          const status = subscription.status === "active" ? "active" : 
                        subscription.status === "trialing" ? "trialing" :
                        subscription.status === "past_due" ? "past_due" :
                        subscription.status === "canceled" ? "canceled" : "inactive";

          await supabase
            .from("subscriptions")
            .update({
              status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq("stripe_subscription_id", subscription.id);

          await supabase
            .from("tenants")
            .update({ subscription_status: status })
            .eq("id", tenantId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          await supabase
            .from("subscriptions")
            .update({
              status: "canceled",
              canceled_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscription.id);

          await supabase
            .from("tenants")
            .update({ subscription_status: "canceled" })
            .eq("id", tenantId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const tenantId = subscription.metadata?.tenant_id;

          if (tenantId) {
            await supabase
              .from("tenants")
              .update({ subscription_status: "past_due" })
              .eq("id", tenantId);

            // Create notification for salon owner
            const { data: ownerRole } = await supabase
              .from("user_roles")
              .select("user_id")
              .eq("tenant_id", tenantId)
              .eq("role", "owner")
              .single();

            if (ownerRole) {
              await supabase.from("notifications").insert({
                tenant_id: tenantId,
                user_id: ownerRole.user_id,
                type: "billing_failed",
                title: "Payment Failed",
                description: "Your subscription payment failed. Please update your payment method.",
                urgent: true,
              });
            }
          }
        }
        break;
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Billing webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
