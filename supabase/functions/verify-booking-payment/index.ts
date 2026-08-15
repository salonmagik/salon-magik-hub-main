import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, mapPaystackChannelToPaymentMethod } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function parseAppointmentIds(raw: unknown, fallback?: string | null): string[] {
  let values: string[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [raw];
    } catch {
      values = [raw];
    }
  } else if (Array.isArray(raw)) {
    values = raw as string[];
  } else if (typeof fallback === "string") {
    values = [fallback];
  }
  return values.filter((v): v is string => typeof v === "string" && isValidUUID(v));
}

serve(async (req) => {
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

    // Require an authenticated client portal user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const body = await req.json();
    const reference: string | undefined = body.reference;
    if (!reference) {
      return json({ error: "Missing reference" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the payment intent by Paystack reference
    const { data: intent } = await supabase
      .from("payment_intents")
      .select("id, status, currency, tenant_id, appointment_id, is_deposit, metadata")
      .eq("paystack_reference", reference)
      .maybeSingle();

    // If already completed, return early (idempotent)
    if (intent?.status === "completed") {
      return json({ verified: true, alreadyProcessed: true });
    }

    // Determine currency: prefer from intent, fall back to tenant record
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

    // Verify with Paystack
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
      return json({ verified: false, paystackStatus: paystackData.data?.status || "unknown" });
    }

    const txData = paystackData.data;
    const txMetadata: Record<string, unknown> = txData.metadata || {};
    // txData.amount is what Paystack actually charged the customer's card —
    // it includes Paystack's own processing fee and Salon Magik's fees on
    // top of the true service price. metadata.service_amount is the true
    // price the same way the webhook path already reads it; fall back to
    // the charged amount only for transactions predating that metadata.
    const amountInMajor = txMetadata.service_amount
      ? Number(txMetadata.service_amount)
      : Number(txData.amount) / 100;
    const paymentMethod = mapPaystackChannelToPaymentMethod(txData.channel);

    // Resolve appointment IDs from the transaction metadata
    const appointmentIds = parseAppointmentIds(
      txMetadata.appointment_ids ?? intent?.metadata?.["appointment_ids"],
      (txMetadata.appointment_id ?? intent?.appointment_id) as string | null,
    );

    const isDeposit =
      txMetadata.is_deposit === "true" ||
      intent?.is_deposit === true;

    if (appointmentIds.length === 0) {
      return json({ error: "No appointment IDs found in transaction metadata" }, 400);
    }

    // Verify the caller owns at least one of the appointments via their customer records
    const { data: customerRows } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id);

    const customerIds = (customerRows || []).map((c) => c.id);
    if (customerIds.length === 0) {
      return json({ error: "No customer records found for this user" }, 403);
    }

    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, total_amount, amount_paid, payment_status, customer_id, tenant_id")
      .in("id", appointmentIds)
      .in("customer_id", customerIds);

    if (!appointments || appointments.length === 0) {
      return json({ error: "Appointments not found or access denied" }, 403);
    }

    // Skip update if all appointments are already paid
    const anyNeedsUpdate = appointments.some(
      (a) => !["fully_paid", "deposit_paid"].includes(a.payment_status),
    );
    if (!anyNeedsUpdate) {
      return json({ verified: true, alreadyProcessed: true });
    }

    const totalAppointmentAmount = appointments.reduce(
      (sum, a) => sum + Number(a.total_amount || 0),
      0,
    );
    const now = new Date().toISOString();
    let primaryPaymentStatus = appointments[0]?.payment_status;

    for (let i = 0; i < appointments.length; i++) {
      const apt = appointments[i];
      let allocated: number;
      if (appointments.length === 1 || totalAppointmentAmount === 0) {
        allocated = amountInMajor;
      } else if (i === appointments.length - 1) {
        // Last item: assign the remainder so rounding doesn't lose a cent
        const previousSum = appointments.slice(0, -1).reduce((sum, a) => {
          const proportion = Number(a.total_amount || 0) / totalAppointmentAmount;
          return sum + Number((amountInMajor * proportion).toFixed(2));
        }, 0);
        allocated = Number((amountInMajor - previousSum).toFixed(2));
      } else {
        const proportion = Number(apt.total_amount || 0) / totalAppointmentAmount;
        allocated = Number((amountInMajor * proportion).toFixed(2));
      }

      // This transaction's amount is added to whatever was already paid (e.g. an
      // earlier deposit) — never overwritten — so a follow-up "pay the balance"
      // charge can't silently erase a prior payment on the same appointment.
      const cumulativePaid = Number((Number(apt.amount_paid || 0) + allocated).toFixed(2));
      const isNowFullyPaid = cumulativePaid >= Number(apt.total_amount || 0);
      const nextPaymentStatus = isNowFullyPaid ? "fully_paid" : isDeposit ? "deposit_paid" : apt.payment_status;

      if (i === 0) {
        primaryPaymentStatus = nextPaymentStatus;
      }

      await supabase
        .from("appointments")
        .update({ payment_status: nextPaymentStatus, amount_paid: cumulativePaid, updated_at: now })
        .eq("id", apt.id);
    }

    // Mark the payment intent as completed
    if (intent?.id) {
      await supabase
        .from("payment_intents")
        .update({ status: "completed", updated_at: now })
        .eq("id", intent.id);
    }

    // Create a transaction record so History page populates.
    // Use the primary appointment's tenant + customer for the record.
    const primaryApt = appointments[0];
    const txTenantId = intent?.tenant_id || primaryApt.tenant_id;
    const txCustomerId = primaryApt.customer_id;
    if (txTenantId && txCustomerId) {
      const { error: txError } = await supabase.from("transactions").insert({
        tenant_id: txTenantId,
        customer_id: txCustomerId,
        appointment_id: primaryApt.id,
        type: isDeposit ? "deposit" : "payment",
        amount: amountInMajor,
        currency,
        method: paymentMethod,
        provider: "paystack",
        provider_reference: reference,
        paystack_reference: reference,
        status: "completed",
      });
      if (txError) {
        console.error("Failed to insert transaction record:", txError);
      }
    }

    return json({
      verified: true,
      paymentStatus: primaryPaymentStatus,
      appointmentIds: appointments.map((a) => a.id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("verify-booking-payment error:", error);
    return json({ error: message }, 500);
  }
});
