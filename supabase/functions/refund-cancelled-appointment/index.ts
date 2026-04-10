import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authed = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await authed.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { appointmentId, transactionId } = await req.json();
    if (!appointmentId && !transactionId) {
      return new Response(JSON.stringify({ error: "Appointment or transaction is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let appointmentQuery = admin
      .from("appointments")
      .select("id, tenant_id, customer_id, status, payment_status, amount_paid, total_amount, booking_reference")
      .limit(1);

    if (appointmentId) {
      appointmentQuery = appointmentQuery.eq("id", appointmentId);
    } else {
      const { data: transactionLookup, error: transactionLookupError } = await admin
        .from("transactions")
        .select("appointment_id")
        .eq("id", transactionId)
        .maybeSingle();

      if (transactionLookupError || !transactionLookup?.appointment_id) {
        return new Response(JSON.stringify({ error: "Linked appointment not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      appointmentQuery = appointmentQuery.eq("id", transactionLookup.appointment_id);
    }

    const { data: appointment, error: appointmentError } = await appointmentQuery.single();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("tenant_id", appointment.tenant_id)
      .eq("user_id", user.id);

    if (rolesError || !roles?.some((entry) => entry.role === "owner" || entry.role === "manager")) {
      return new Response(JSON.stringify({ error: "You do not have permission to process refunds" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (appointment.status !== "cancelled") {
      return new Response(JSON.stringify({ error: "Only cancelled appointments can be refunded from here" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refundAmount = Number(appointment.amount_paid || 0);
    if (refundAmount <= 0) {
      return new Response(JSON.stringify({ error: "This appointment has no paid amount to refund" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (appointment.payment_status === "refunded_full") {
      return new Response(JSON.stringify({ error: "This appointment has already been fully refunded" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing completed/approved refund requests for this appointment
    const { data: existingRefundRequests } = await admin
      .from("refund_requests")
      .select("amount, status")
      .eq("tenant_id", appointment.tenant_id)
      .or(`transaction_id.in.(${[appointmentId, transactionId].filter(Boolean).join(",")})`)
      .in("status", ["completed", "approved", "pending"]);

    if (existingRefundRequests && existingRefundRequests.length > 0) {
      const totalRequestedRefund = existingRefundRequests.reduce(
        (sum, req) => sum + Number(req.amount),
        0
      );
      
      if (totalRequestedRefund >= refundAmount) {
        return new Response(
          JSON.stringify({ 
            error: "Refund already requested or processed for this appointment",
            details: {
              totalRefunded: totalRequestedRefund,
              appointmentAmount: refundAmount
            }
          }), 
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Check for existing completed refund transactions for this appointment
    const { data: existingRefund } = await admin
      .from("transactions")
      .select("amount")
      .eq("appointment_id", appointment.id)
      .eq("type", "refund")
      .eq("status", "completed");

    if (existingRefund && existingRefund.length > 0) {
      const totalRefunded = existingRefund.reduce(
        (sum, txn) => sum + Number(txn.amount),
        0
      );
      
      if (totalRefunded >= refundAmount) {
        return new Response(
          JSON.stringify({ 
            error: "Refund already processed for this appointment",
            details: {
              totalRefunded,
              appointmentAmount: refundAmount
            }
          }), 
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("currency")
      .eq("id", appointment.tenant_id)
      .single();

    if (tenantError || !tenant?.currency) {
      return new Response(
        JSON.stringify({ error: "Tenant or tenant currency not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Debit the salon wallet first
    const salonDebitIdempotencyKey = `refund_salon_debit_${appointment.id}`;
    const { data: salonDebitEntryId, error: salonDebitError } = await admin.rpc("debit_salon_purse" as never, {
      p_tenant_id: appointment.tenant_id,
      p_entry_type: "salon_purse_debit_refund",
      p_reference_type: "appointment",
      p_reference_id: appointment.id,
      p_amount: refundAmount,
      p_currency: tenant.currency,
      p_idempotency_key: salonDebitIdempotencyKey,
    } as never);

    if (salonDebitError) {
      console.error("Error debiting salon purse for refund:", salonDebitError);
      return new Response(
        JSON.stringify({ error: salonDebitError.message || "Failed to debit salon purse" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Credit the customer purse
    const customerCreditIdempotencyKey = `cancelled_appointment_refund_${appointment.id}`;
    const { data: creditEntryId, error: creditError } = await admin.rpc("credit_customer_purse" as never, {
      p_tenant_id: appointment.tenant_id,
      p_customer_id: appointment.customer_id,
      p_amount: refundAmount,
      p_currency: tenant.currency,
      p_idempotency_key: customerCreditIdempotencyKey,
      p_gateway_reference: appointment.booking_reference || appointment.id,
    } as never);

    if (creditError) {
      console.error("Error crediting customer purse for refund:", creditError);
      return new Response(JSON.stringify({ error: creditError.message || "Failed to credit customer purse" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: originalTransaction } = await admin
      .from("transactions")
      .select("id")
      .eq("appointment_id", appointment.id)
      .eq("type", "payment")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: refundTransaction, error: refundTransactionError } = await admin
      .from("transactions")
      .insert({
        tenant_id: appointment.tenant_id,
        customer_id: appointment.customer_id,
        appointment_id: appointment.id,
        amount: refundAmount,
        type: "refund",
        method: "purse",
        currency: tenant.currency,
        status: "completed",
        provider: "customer_purse",
        provider_reference: typeof salonDebitEntryId === "string" ? salonDebitEntryId : null,
        created_by_id: user.id,
      })
      .select("id")
      .single();

    if (refundTransactionError || !refundTransaction) {
      return new Response(JSON.stringify({ error: refundTransactionError?.message || "Failed to create refund transaction" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin
      .from("refund_requests")
      .insert({
        tenant_id: appointment.tenant_id,
        transaction_id: originalTransaction?.id || refundTransaction.id,
        customer_id: appointment.customer_id,
        amount: refundAmount,
        reason: "Cancelled appointment refunded to customer purse",
        refund_type: "store_credit",
        requested_by_id: user.id,
        approved_by_id: user.id,
        approved_at: new Date().toISOString(),
        status: "completed",
      });

    const { error: appointmentUpdateError } = await admin
      .from("appointments")
      .update({
        payment_status: "refunded_full",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    if (appointmentUpdateError) {
      return new Response(JSON.stringify({ error: appointmentUpdateError.message || "Refund recorded but failed to update appointment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, refundAmount, refundTransactionId: refundTransaction.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("refund-cancelled-appointment error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
