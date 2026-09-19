import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * The actual refund logic, factored out from the serve() handler below so
 * it can be driven directly by a test with an injected service-role client
 * and a fake authenticated user — the handler's own job is just CORS and
 * resolving `user` before calling this.
 */
export async function handleRefundCancelledAppointment(
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  user: Pick<User, "id">,
): Promise<Response> {
  try {
    const { appointmentId, transactionId, idempotencyKey } = await req.json();
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
      .eq("user_id", user.id).eq("is_active", true);

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

    const { data: originalTransaction, error: originalTransactionError } = await admin
      .from("transactions")
      .select("id")
      .eq("appointment_id", appointment.id)
      .eq("type", "payment")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (originalTransactionError || !originalTransaction) {
      return new Response(
        JSON.stringify({ error: "Original payment transaction not found for this appointment" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: result, error: refundError } = await admin.rpc("complete_local_refund", {
      p_transaction_id: originalTransaction.id, p_amount: refundAmount, p_refund_type: "store_credit",
      p_reason: "Cancelled appointment refunded as store credit", p_actor_id: user.id,
      p_key: idempotencyKey || `cancelled-appointment:${appointment.id}:${refundAmount}`, p_request_id: null,
    });
    if (refundError) throw refundError;
    return new Response(JSON.stringify({ ...result, refundAmount, refundTransactionId: result?.refundId }), {
      status: result?.success ? 200 : 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("refund-cancelled-appointment error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) serve(async (req) => {
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

    return await handleRefundCancelledAppointment(req, admin, user);
  } catch (error) {
    console.error("refund-cancelled-appointment error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
