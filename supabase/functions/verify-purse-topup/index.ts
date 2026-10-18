import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";
import { processWebhook, WebhookEvent } from "../_shared/payment-webhook-processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = (Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    // Purse top-up is never a guest flow (unlike public booking checkout),
    // so unlike verify-booking-payment an authenticated caller is required
    // here before anything else runs.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const reference: string | undefined = body.reference;
    if (!reference) {
      return json({ error: "Missing reference" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: intent } = await supabase
      .from("payment_intents")
      .select("id, status, currency, tenant_id, intent_type")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (intent?.intent_type && intent.intent_type !== "customer_purse_topup") {
      return json({ error: "Reference is not a purse top-up" }, 400);
    }

    // Already credited, either by the webhook or a previous call here.
    if (intent?.status === "completed") {
      return json({ verified: true, alreadyProcessed: true });
    }

    let currency = intent?.currency || "NGN";
    if (!intent?.currency && intent?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("currency")
        .eq("id", intent.tenant_id)
        .maybeSingle();
      if (tenant?.currency) currency = tenant.currency;
    }

    const { key, error: keyError } = getPaystackKeyForCurrency(currency);
    if (keyError || !key) {
      return json({ error: keyError || "Paystack not configured for this currency" }, 500);
    }

    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!paystackRes.ok) {
      return json({ error: "Paystack verify API error", status: paystackRes.status }, 502);
    }

    const paystackData = await paystackRes.json();
    if (!paystackData.status || paystackData.data?.status !== "success") {
      const paystackStatus = paystackData.data?.status || "unknown";
      if (intent?.id && ["abandoned", "failed"].includes(paystackStatus)) {
        await supabase
          .from("payment_intents")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", intent.id);
      }
      return json({ verified: false, paystackStatus });
    }

    const txData = paystackData.data;
    const txMetadata: Record<string, unknown> = txData.metadata || {};
    const customerId = (txMetadata.customer_id as string | undefined) || null;
    const tenantId = (txMetadata.tenant_id as string | undefined) || intent?.tenant_id || null;

    if (!customerId || !tenantId) {
      return json({ error: "Missing customer or salon on this transaction" }, 400);
    }

    // Scope to the caller's own customer record, the same way
    // create-payment-session scoped the request that created this
    // reference, so one authenticated customer can't verify and trigger a
    // credit for a reference that belongs to someone else.
    const { data: customerRecord } = await supabase
      .from("customers")
      .select("id, user_id")
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!customerRecord || customerRecord.user_id !== user.id) {
      return json({ error: "Access denied" }, 403);
    }

    const event: WebhookEvent = {
      type: "charge.success",
      gateway: "paystack",
      data: {
        paymentIntentId: (txMetadata.payment_intent_id as string | undefined) || intent?.id,
        tenantId,
        customerId,
        amount: Number(txData.amount) / 100,
        currency: txData.currency || currency,
        channel: txData.channel,
        status: txData.status,
        reference,
      },
    };

    // Runs the exact same crediting + salon-notification path the Paystack
    // webhook itself runs for "charge.success" (credit_customer_purse plus
    // sendTransactionAlerts/createTenantNotification), so a slow or missing
    // webhook doesn't leave the purse uncredited or the salon unnotified.
    // credit_customer_purse's own idempotency key (topup_<reference>) makes
    // this safe to run even if the webhook also fires for the same
    // reference.
    await processWebhook(event, supabaseUrl, supabaseServiceKey, resendApiKey, resendFromEmail);

    return json({ verified: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("verify-purse-topup error:", error);
    return json({ error: message }, 500);
  }
});
