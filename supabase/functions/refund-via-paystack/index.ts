import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RefundViaPaystackRequest {
  transactionId: string;
  amount: number;
  reason: string;
  requestId?: string | null;
}

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    // A user-scoped client so auth.uid() resolves naturally inside
    // complete_transaction_refund below — that RPC does its own
    // owner/manager check and row-locked amount validation, so we don't
    // duplicate that logic here.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const body: RefundViaPaystackRequest = await req.json();
    const { transactionId, amount, reason, requestId } = body;

    if (!transactionId || !amount || amount <= 0 || !reason?.trim()) {
      return json({ error: "Missing or invalid transactionId/amount/reason" }, 400);
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: transaction, error: transactionError } = await serviceSupabase
      .from("transactions")
      .select("id, tenant_id, amount, currency, type, status, provider, provider_reference, paystack_reference")
      .eq("id", transactionId)
      .maybeSingle();

    if (transactionError || !transaction) {
      return json({ error: "Transaction not found" }, 404);
    }

    if (transaction.provider !== "paystack") {
      return json({ error: "This transaction wasn't paid through Paystack" }, 400);
    }

    const reference = transaction.provider_reference || transaction.paystack_reference;
    if (!reference) {
      return json({ error: "No Paystack reference recorded for this transaction" }, 400);
    }

    if (transaction.type !== "payment" && transaction.type !== "deposit") {
      return json({ error: "This transaction is not refundable" }, 400);
    }

    const { key, error: keyError } = getPaystackKeyForCurrency(transaction.currency);
    if (keyError || !key) {
      return json({ error: keyError || "Paystack not configured for this currency" }, 500);
    }

    const amountInMinorUnits = Math.round(amount * 100);

    const paystackRes = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: reference,
        amount: amountInMinorUnits,
        merchant_note: reason.trim(),
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      // Surface Paystack's real answer rather than guessing at a settlement
      // cutoff ourselves — e.g. if the funds already settled to the salon,
      // Paystack's own error message says so.
      console.error("Paystack refund failed:", paystackData);
      return json({ error: paystackData.message || "Paystack declined this refund" }, 502);
    }

    const { data: refundId, error: rpcError } = await userClient.rpc("complete_transaction_refund" as never, {
      p_transaction_id: transactionId,
      p_amount: amount,
      p_refund_type: "paystack",
      p_reason: reason.trim(),
      p_request_id: requestId || null,
    } as never);

    if (rpcError) {
      // Paystack has already refunded the customer at this point — this is
      // now a bookkeeping-only failure, not a failed refund. Surface it
      // loudly so it gets reconciled manually rather than silently lost.
      console.error("CRITICAL: Paystack refund succeeded but complete_transaction_refund failed:", {
        transactionId,
        paystackReference: reference,
        error: rpcError,
      });
      return json({
        error: `Refund was processed by Paystack, but recording it failed: ${rpcError.message}. This needs manual reconciliation.`,
      }, 500);
    }

    return json({ success: true, refundId, paystackReference: paystackData.data?.reference || reference });
  } catch (error) {
    console.error("refund-via-paystack error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
