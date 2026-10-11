import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, fetchPaystackTransferStatus } from "../_shared/paystack-helpers.ts";
import { reconcileWithdrawalOutcome } from "../_shared/payment-webhook-processor.ts";
import { notifyWithdrawalOutcome } from "../_shared/withdrawal-notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-withdrawals-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// A withdrawal stuck in 'pending'/'awaiting_otp' only ever got reconciled
// reactively -- when the same owner happened to attempt another withdrawal
// to the same destination, process-salon-withdrawal's duplicate-check would
// live-check it against Paystack. If a transfer.* webhook was dropped (or
// never sent) and the owner never tried again, the withdrawal -- and the
// money it reserved against the available balance -- stayed stuck
// indefinitely with no way for the owner to retry. This runs the same
// live-check proactively on a schedule instead of waiting for that.
const TRANSFER_FAILURE_STATUSES = new Set(["failed", "reversed", "abandoned", "blocked", "rejected"]);

// Give a transfer a little room to actually complete before treating it as
// stuck -- Paystack's own webhook usually lands within seconds, but we don't
// want to flag something that's still genuinely in flight.
const MIN_AGE_MS = 15 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("RECONCILE_WITHDRAWALS_SECRET");
    const providedSecret = req.headers.get("x-reconcile-withdrawals-secret");
    if (cronSecret && providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
    const { data: stuck, error: fetchError } = await supabase
      .from("salon_withdrawals")
      .select("id, status, paystack_transfer_code, currency, requested_at")
      .in("status", ["pending", "awaiting_otp"])
      .lt("requested_at", cutoff)
      .order("requested_at", { ascending: true })
      .limit(200);

    if (fetchError) throw fetchError;

    const results: Array<{ id: string; outcome: string }> = [];

    for (const withdrawal of stuck || []) {
      try {
        if (!withdrawal.paystack_transfer_code) {
          results.push({ id: withdrawal.id, outcome: "skipped: no transfer code on record" });
          continue;
        }

        const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(withdrawal.currency);
        if (!paystackKey) {
          results.push({ id: withdrawal.id, outcome: `skipped: ${keyError}` });
          continue;
        }

        const transferStatus = await fetchPaystackTransferStatus(paystackKey, withdrawal.paystack_transfer_code);

        const outcome = transferStatus.status === "success"
          ? "success"
          : transferStatus.status === "reversed"
          ? "reversed"
          : transferStatus.status && TRANSFER_FAILURE_STATUSES.has(transferStatus.status)
          ? "failed"
          : null;

        if (!outcome) {
          results.push({ id: withdrawal.id, outcome: `still ${transferStatus.status ?? "unknown"}` });
          continue;
        }

        const reconciled = await reconcileWithdrawalOutcome(supabase, withdrawal.id, outcome, {
          failureReason: `Paystack reports this transfer ${transferStatus.status}.`,
        });

        if (!reconciled.ok) {
          results.push({ id: withdrawal.id, outcome: `reconcile failed: ${reconciled.error}` });
          continue;
        }

        await notifyWithdrawalOutcome(supabase, withdrawal.id, outcome, { resendApiKey, resendFromEmail })
          .catch((err) => console.error(`Failed to send withdrawal-outcome notification for ${withdrawal.id}:`, err));

        results.push({ id: withdrawal.id, outcome });
      } catch (err) {
        console.error(`Error reconciling withdrawal ${withdrawal.id}:`, err);
        results.push({ id: withdrawal.id, outcome: `error: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    return new Response(
      JSON.stringify({ checked: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("reconcile-pending-withdrawals error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
