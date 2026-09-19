// Historical name and URL retained for deployed clients. Paystack refunds
// are disabled; this endpoint only records salon-credit or direct-transfer
// refunds through the atomic local refund RPC.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RefundType = "paystack" | "store_credit" | "offline";

interface RefundViaPaystackRequest {
  transactionId: string;
  amount: number;
  reason: string;
  requestId?: string | null;
  refundType?: RefundType;
  idempotencyKey?: string | null;
}

const REFUND_TYPES: RefundType[] = ["paystack", "store_credit", "offline"];

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The actual refund-orchestration logic, factored out from the serve()
 * handler below so it can be driven directly by a test with injected
 * Supabase clients and a fake authenticated user — the handler's own job
 * is just CORS and resolving the
 * user-scoped/service clients before calling this.
 */
export async function handleRefundViaPaystack(
  req: Request,
  // deno-lint-ignore no-explicit-any
  userClient: SupabaseClient<any, any, any>,
  // deno-lint-ignore no-explicit-any
  serviceSupabase: SupabaseClient<any, any, any>,
  user: Pick<User, "id">,
): Promise<Response> {
  try {
    let body: RefundViaPaystackRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body", code: "INVALID_REQUEST" }, 400);
    }
    const { transactionId, amount, reason, requestId, idempotencyKey } = body;
    const refundType: RefundType = body.refundType || "paystack";

    if (refundType === "paystack") {
      return json({ error: "Paystack refunds are temporarily unavailable. Refund the customer by direct transfer and record it here, or issue salon credit.", code: "PAYSTACK_REFUNDS_DISABLED" }, 410);
    }

    if (
      !transactionId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !reason?.trim() ||
      !REFUND_TYPES.includes(refundType)
    ) {
      return json({ error: "Missing or invalid transactionId/amount/reason/refundType", code: "INVALID_REQUEST" }, 400);
    }

    const { data: transaction, error: transactionError } = await serviceSupabase
      .from("transactions")
      .select("id, tenant_id, appointment_id, amount, currency, type, status, method, provider, provider_reference, paystack_reference")
      .eq("id", transactionId)
      .maybeSingle();

    if (transactionError || !transaction) {
      return json({ error: "Transaction not found", code: "TRANSACTION_NOT_FOUND" }, 404);
    }

    // The debit below runs on the service key, ahead of complete_transaction_refund's
    // own owner/manager check — so an unauthorised caller must be rejected here,
    // before it can churn the wallet, not only after.
    const { data: roles, error: rolesError } = await serviceSupabase
      .from("user_roles")
      .select("role")
      .eq("tenant_id", transaction.tenant_id)
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (rolesError || !roles?.some((entry) => entry.role === "owner" || entry.role === "manager")) {
      return json({ error: "You do not have permission to process refunds", code: "FORBIDDEN" }, 403);
    }

    if (transaction.type !== "payment" && transaction.type !== "deposit") {
      return json({ error: "This transaction is not refundable", code: "INVALID_REQUEST" }, 400);
    }
    if (transaction.status !== "completed") {
      return json({ error: "This transaction is not refundable", code: "INVALID_REQUEST" }, 400);
    }

    const debitIdempotencyKey = idempotencyKey || crypto.randomUUID();
    const { data: result, error: refundError } = await serviceSupabase.rpc("complete_local_refund", {
      p_transaction_id: transactionId, p_amount: amount, p_refund_type: refundType,
      p_reason: reason.trim(), p_actor_id: user.id, p_key: debitIdempotencyKey, p_request_id: requestId || null,
    });
    if (refundError) throw refundError;
    return json(result, result?.success ? 200 : 409);
  } catch (error) {
    console.error("refund-via-paystack error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token", code: "UNAUTHENTICATED" }, 401);
    }

    // A user-scoped client so auth.uid() resolves naturally inside
    // complete_transaction_refund below — that RPC does its own
    // owner/manager check and row-locked amount validation, so we don't
    // duplicate that logic here. The service client is used only for the
    // pre-check below and for the two wallet-moving RPCs.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid or expired session", code: "UNAUTHENTICATED" }, 401);
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    return await handleRefundViaPaystack(req, userClient, serviceSupabase, user);
  } catch (error) {
    console.error("refund-via-paystack error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
