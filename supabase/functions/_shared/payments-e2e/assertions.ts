// Reusable observations (design section 5/12). Every fetch here filters by
// the key it already knows — id, or tenant_id + the fixture tag — never a
// table scan filtered client-side, since parallel-run fixtures are present
// on a shared local stack.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any>;

export interface AppointmentSnapshot {
  id: string;
  amount_paid: number;
  payment_status: string;
  total_amount: number;
}

export async function snapshotAppointment(admin: AnyClient, appointmentId: string): Promise<AppointmentSnapshot> {
  const { data, error } = await admin
    .from("appointments")
    .select("id, amount_paid, payment_status, total_amount")
    .eq("id", appointmentId)
    .single();
  if (error) throw new Error(`snapshotAppointment: ${error.message}`);
  return data;
}

export interface TransactionsCountAndSum {
  count: number;
  totalAmount: number;
}

/** Counts transactions by appointment/tenant + type, filtered server-side — never fetch-then-count client-side (design section 12). */
export async function countTransactions(
  admin: AnyClient,
  filters: { tenantId: string; appointmentId?: string; customerId?: string; type?: string; currency?: string },
): Promise<TransactionsCountAndSum> {
  let query = admin.from("transactions").select("amount, currency", { count: "exact" }).eq("tenant_id", filters.tenantId);
  if (filters.appointmentId) query = query.eq("appointment_id", filters.appointmentId);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.currency) query = query.eq("currency", filters.currency);

  const { data, count, error } = await query;
  if (error) throw new Error(`countTransactions: ${error.message}`);
  const totalAmount = (data ?? []).reduce((sum: number, row: { amount: number }) => sum + Number(row.amount), 0);
  return { count: count ?? 0, totalAmount };
}

export async function countInvoices(admin: AnyClient, tenantId: string, appointmentId?: string): Promise<number> {
  let query = admin.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (appointmentId) query = query.eq("appointment_id", appointmentId);
  const { count, error } = await query;
  if (error) throw new Error(`countInvoices: ${error.message}`);
  return count ?? 0;
}

export interface WalletSnapshot {
  balance: number;
  currency: string;
}

export async function snapshotWallet(admin: AnyClient, tenantId: string): Promise<WalletSnapshot> {
  const { data, error } = await admin.from("salon_wallets").select("balance, currency").eq("tenant_id", tenantId).single();
  if (error) throw new Error(`snapshotWallet: ${error.message}`);
  return data;
}

export async function countLedgerEntries(
  admin: AnyClient,
  filters: { tenantId: string; entryType?: string; idempotencyKey?: string },
): Promise<number> {
  let query = admin
    .from("wallet_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", filters.tenantId);
  if (filters.entryType) query = query.eq("entry_type", filters.entryType);
  if (filters.idempotencyKey) query = query.eq("idempotency_key", filters.idempotencyKey);
  const { count, error } = await query;
  if (error) throw new Error(`countLedgerEntries: ${error.message}`);
  return count ?? 0;
}

export async function getWithdrawal(admin: AnyClient, withdrawalId: string) {
  const { data, error } = await admin
    .from("salon_withdrawals")
    .select("id, status, amount, currency, failure_reason")
    .eq("id", withdrawalId)
    .single();
  if (error) throw new Error(`getWithdrawal: ${error.message}`);
  return data;
}

export async function getPaymentIntent(admin: AnyClient, paymentIntentId: string) {
  const { data, error } = await admin
    .from("payment_intents")
    .select("id, status, gateway_reference, currency, amount")
    .eq("id", paymentIntentId)
    .single();
  if (error) throw new Error(`getPaymentIntent: ${error.message}`);
  return data;
}

export async function getRefundRequests(admin: AnyClient, transactionId: string) {
  const { data, error } = await admin
    .from("refund_requests")
    .select("id, status, amount, refund_type")
    .eq("transaction_id", transactionId);
  if (error) throw new Error(`getRefundRequests: ${error.message}`);
  return data ?? [];
}

/**
 * Asserts every currency-tagged row a cell touched actually carries the
 * expected currency (design section 9 — "currency validation"). Throws with
 * the offending row's actual currency rather than returning a boolean, since
 * a currency mismatch is always a hard cell failure, never a soft one.
 */
export function assertCurrency(label: string, expected: string, actual: string | null | undefined): void {
  if (actual !== expected) {
    throw new Error(`currency mismatch on ${label}: expected ${expected}, got ${actual}`);
  }
}
