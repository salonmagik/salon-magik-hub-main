import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "./paystack-helpers.ts";

// Webhook payloads are hints. Fetch the current provider state so an old pending
// notification cannot undo a processed refund, and IDs cannot cross markets.
export async function reconcilePaystackRefund(supabase: SupabaseClient, id: string | number, currency: string, fetchImpl: typeof fetch = fetch) {
  const { key, error } = getPaystackKeyForCurrency(currency);
  if (error || !key) throw new Error(error || "Paystack key unavailable");
  const get = async (path: string) => {
    const response = await fetchImpl(`https://api.paystack.co/${path}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${key}` } });
    const result = await response.json();
    if (!response.ok || !result.status) throw new Error("Unable to verify Paystack refund");
    return result.data;
  };
  const refund = await get(`refund/${encodeURIComponent(String(id))}`);
  const transaction = refund.transaction?.reference ? refund.transaction : await get(`transaction/${encodeURIComponent(String(refund.transaction?.id ?? refund.transaction))}`);
  if (refund.currency !== currency || !transaction.reference || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) throw new Error("Invalid refund currency, reference or amount");
  const localId = String(refund.merchant_note || "").match(/^salonmagik:([a-f0-9-]{36})\b/)?.[1];
  const { data, error: reconcileError } = await supabase.rpc("reconcile_paystack_refund", {
    p_provider_id: String(refund.id), p_reference: transaction.reference, p_currency: currency,
    p_amount: refund.amount / 100, p_status: refund.status, p_local_id: localId || null,
  });
  if (reconcileError) throw reconcileError;
  return data;
}
