// Historical name: this function originally only completed Paystack card
// refunds. It now completes every refund type (paystack, store_credit,
// offline) so the refund-clawback safeguard is enforced in exactly one
// server-side place. Renaming would leave the old, unguarded function
// deployed and callable until manually deleted — a live bypass — so the
// name and URL are kept as-is.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

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
 * Supabase clients, a fake authenticated user, and a fake `fetch` for
 * Paystack — the handler's own job is just CORS and resolving the
 * user-scoped/service clients before calling this.
 */
export async function handleRefundViaPaystack(
  req: Request,
  // deno-lint-ignore no-explicit-any
  userClient: SupabaseClient<any, any, any>,
  // deno-lint-ignore no-explicit-any
  serviceSupabase: SupabaseClient<any, any, any>,
  user: Pick<User, "id">,
  fetchImpl: typeof fetch = fetch,
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

    let key: string | null = null;
    let reference: string | null = null;
    if (refundType === "paystack") {
      if (transaction.provider !== "paystack") {
        return json({ error: "This transaction wasn't paid through Paystack", code: "INVALID_REQUEST" }, 400);
      }
      reference = transaction.provider_reference || transaction.paystack_reference;
      if (!reference) {
        return json({ error: "No Paystack reference recorded for this transaction", code: "INVALID_REQUEST" }, 400);
      }
      const keyResult = getPaystackKeyForCurrency(transaction.currency);
      if (keyResult.error || !keyResult.key) {
        return json({ error: keyResult.error || "Paystack not configured for this currency", code: "PAYSTACK_NOT_CONFIGURED" }, 500);
      }
      key = keyResult.key;
    }

    const debitIdempotencyKey = idempotencyKey || crypto.randomUUID();

    const { data: debitResult, error: debitError } = await serviceSupabase.rpc("debit_salon_wallet_for_refund" as never, {
      p_transaction_id: transactionId,
      p_amount: amount,
      p_refund_type: refundType,
      p_reason: reason.trim(),
      p_actor_id: user.id,
      p_idempotency_key: debitIdempotencyKey,
      p_refund_request_id: requestId || null,
      p_appointment_id: transaction.appointment_id || null,
    } as never);

    if (debitError) {
      console.error("debit_salon_wallet_for_refund faulted:", debitError);
      return json({ error: debitError.message || "Failed to evaluate the salon wallet", code: "WALLET_FAULT" }, 500);
    }

    const debit = debitResult as { ok: boolean; ledger_entry_id: string | null; code?: string; wallet_balance?: number; shortfall?: number; currency?: string };

    if (!debit.ok) {
      console.error("Refund blocked — insufficient recoverable funds:", {
        tenantId: transaction.tenant_id,
        transactionId,
        attemptedAmount: amount,
        walletBalance: debit.wallet_balance,
      });
      return json({
        error: "This salon has already withdrawn the funds for this payment, so it can't be recovered to refund the customer.",
        code: debit.code || "INSUFFICIENT_RECOVERABLE_FUNDS",
        walletBalance: debit.wallet_balance,
        shortfall: debit.shortfall,
        currency: debit.currency,
      }, 409);
    }

    const walletDebitEntryId = debit.ledger_entry_id;

    let paystackReference: string | undefined;

    if (refundType === "paystack") {
      const amountInMinorUnits = Math.round(amount * 100);

      let paystackRes: Response;
      try {
        paystackRes = await fetchImpl("https://api.paystack.co/refund", {
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
      } catch (fetchError) {
        console.error("Paystack refund network error:", fetchError);
        if (walletDebitEntryId) {
          await serviceSupabase.rpc("reverse_refund_wallet_debit" as never, {
            p_tenant_id: transaction.tenant_id,
            p_transaction_id: transactionId,
            p_amount: amount,
            p_currency: transaction.currency,
            p_debit_idempotency_key: debitIdempotencyKey,
          } as never);
        }
        console.error("CRITICAL: Paystack refund may still have been accepted despite the network error", {
          transactionId,
          debitIdempotencyKey,
        });
        return json({ error: "Could not reach Paystack to process the refund", code: "PAYSTACK_UNREACHABLE" }, 502);
      }

      const paystackData = await paystackRes.json();

      if (!paystackRes.ok || !paystackData.status) {
        console.error("Paystack refund declined:", paystackData);
        if (walletDebitEntryId) {
          const { error: reverseError } = await serviceSupabase.rpc("reverse_refund_wallet_debit" as never, {
            p_tenant_id: transaction.tenant_id,
            p_transaction_id: transactionId,
            p_amount: amount,
            p_currency: transaction.currency,
            p_debit_idempotency_key: debitIdempotencyKey,
          } as never);
          if (reverseError) {
            console.error("CRITICAL: failed to reverse the wallet debit after a declined Paystack refund:", {
              transactionId,
              debitIdempotencyKey,
              error: reverseError,
            });
          }
        }
        return json({ error: paystackData.message || "Paystack declined this refund", code: "PAYSTACK_DECLINED" }, 502);
      }

      paystackReference = paystackData.data?.reference || reference || undefined;
    }

    const { data: refundId, error: rpcError } = await userClient.rpc("complete_transaction_refund" as never, {
      p_transaction_id: transactionId,
      p_amount: amount,
      p_refund_type: refundType,
      p_reason: reason.trim(),
      p_request_id: requestId || null,
      p_wallet_debit_entry_id: walletDebitEntryId,
    } as never);

    if (rpcError) {
      if (refundType === "paystack") {
        // Paystack has already refunded the customer at this point — this is
        // now a bookkeeping-only failure, not a failed refund, and the salon
        // really does owe the amount it was debited. Keep the debit and
        // surface it loudly so it gets reconciled manually.
        console.error("CRITICAL: Paystack refund succeeded but complete_transaction_refund failed:", {
          transactionId,
          paystackReference,
          walletDebitEntryId,
          error: rpcError,
        });
        return json({
          error: `Refund was processed by Paystack, but recording it failed: ${rpcError.message}. This needs manual reconciliation.`,
          code: "REFUND_RECORDING_FAILED",
          walletDebitEntryId,
        }, 500);
      }

      // Nothing external happened yet for store_credit/offline, so the debit
      // (if any was taken) can safely be reversed.
      if (walletDebitEntryId) {
        const { error: reverseError } = await serviceSupabase.rpc("reverse_refund_wallet_debit" as never, {
          p_tenant_id: transaction.tenant_id,
          p_transaction_id: transactionId,
          p_amount: amount,
          p_currency: transaction.currency,
          p_debit_idempotency_key: debitIdempotencyKey,
        } as never);
        if (reverseError) {
          console.error("CRITICAL: failed to reverse the wallet debit after complete_transaction_refund failed:", {
            transactionId,
            debitIdempotencyKey,
            error: reverseError,
          });
        }
      }
      console.error("complete_transaction_refund failed before any external effect:", { transactionId, error: rpcError });
      return json({
        error: rpcError.message || "Failed to record the refund",
        code: "REFUND_RECORDING_FAILED",
      }, 500);
    }

    return json({ success: true, refundId, paystackReference, walletDebitEntryId });
  } catch (error) {
    console.error("refund-via-paystack error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
}

Deno.serve(async (req) => {
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
