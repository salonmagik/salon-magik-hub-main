// Seeds namespaced, per-cell fixtures (design AD-6): every row this module
// creates is tagged `e2e-<cell-id>-<timestamp>`, and cells must assert only
// against rows carrying that tag. Nothing here is shared across cells —
// duplicate-webhook cells in particular would be actively misled by a shared
// fixture, since a second cell's writes would look like the duplicate under
// test.

import "./env.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Currency, PaymentsE2EEnv } from "./env.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any>;

export function tag(cellId: string): string {
  return `e2e-${cellId}-${Date.now()}`;
}

export interface SeedTenantOptions {
  currency: Currency;
  platformPercentageCharge?: number;
  minWithdrawal?: number;
}

export interface SeededTenant {
  id: string;
  currency: Currency;
  locationId: string;
}

export async function seedTenant(admin: AnyClient, cellTag: string, opts: SeedTenantOptions): Promise<SeededTenant> {
  const country = opts.currency === "GHS" ? "GH" : "NG";
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      name: `${cellTag} salon`,
      country,
      currency: opts.currency,
      platform_percentage_charge: opts.platformPercentageCharge ?? 0.5,
      ...(opts.currency === "NGN"
        ? { min_withdrawal_ngn: opts.minWithdrawal ?? 100 }
        : { min_withdrawal_ghs: opts.minWithdrawal ?? 10 }),
    })
    .select("id, currency")
    .single();
  if (tenantError) throw new Error(`seedTenant: ${tenantError.message}`);

  const { data: location, error: locationError } = await admin
    .from("locations")
    .insert({
      tenant_id: tenant.id,
      name: `${cellTag} location`,
      country,
      city: country === "GH" ? "Accra" : "Lagos",
      is_default: true,
    })
    .select("id")
    .single();
  if (locationError) throw new Error(`seedTenant location: ${locationError.message}`);

  return { id: tenant.id, currency: tenant.currency as Currency, locationId: location.id };
}

export interface SeededOwner {
  userId: string;
  email: string;
  client: AnyClient;
}

/** Creates a real auth user with a password and an active `owner` role on the tenant — never generateLink (project convention). */
export async function seedOwner(
  admin: AnyClient,
  env: PaymentsE2EEnv,
  cellTag: string,
  tenantId: string,
): Promise<SeededOwner> {
  const email = `${cellTag}-owner@e2e.test`;
  const password = "E2eOwner!Pass123";

  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw new Error(`seedOwner: ${userError.message}`);

  const { error: roleError } = await admin.from("user_roles").insert({
    user_id: user.user.id,
    tenant_id: tenantId,
    role: "owner",
    is_active: true,
  });
  if (roleError) throw new Error(`seedOwner role: ${roleError.message}`);

  await admin.from("profiles").upsert({ user_id: user.user.id, full_name: `${cellTag} Owner` }, { onConflict: "user_id" });

  const loginClient = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await loginClient.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`seedOwner sign-in: ${signInError.message}`);

  const authedClient = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
    auth: { persistSession: false },
  }) as AnyClient;

  return { userId: user.user.id, email, client: authedClient };
}

export interface SeededCustomer {
  id: string;
  fullName: string;
  email: string;
  userId: string | null;
}

export async function seedCustomer(
  admin: AnyClient,
  cellTag: string,
  tenantId: string,
  opts: { withAuthUser?: boolean; env?: PaymentsE2EEnv } = {},
): Promise<SeededCustomer & { client?: AnyClient }> {
  let userId: string | null = null;
  let client: AnyClient | undefined;
  const email = `${cellTag}-customer@e2e.test`;

  if (opts.withAuthUser && opts.env) {
    const password = "E2eCustomer!Pass123";
    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError) throw new Error(`seedCustomer auth user: ${userError.message}`);
    userId = user.user.id;

    const loginClient = createClient(opts.env.supabaseUrl, opts.env.anonKey, { auth: { persistSession: false } });
    const { data: session, error: signInError } = await loginClient.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`seedCustomer sign-in: ${signInError.message}`);
    client = createClient(opts.env.supabaseUrl, opts.env.anonKey, {
      global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
      auth: { persistSession: false },
    }) as AnyClient;
  }

  const { data: customer, error } = await admin
    .from("customers")
    .insert({
      tenant_id: tenantId,
      full_name: `${cellTag} Customer`,
      email,
      user_id: userId,
    })
    .select("id, full_name, email, user_id")
    .single();
  if (error) throw new Error(`seedCustomer: ${error.message}`);

  return { id: customer.id, fullName: customer.full_name, email: customer.email, userId: customer.user_id, client };
}

export interface SeedAppointmentOptions {
  totalAmount: number;
  amountPaid?: number;
  paymentStatus?: "unpaid" | "deposit_paid" | "fully_paid" | "refunded_partial" | "refunded_full";
  status?: "scheduled" | "cancelled" | "completed" | "confirmed";
}

export async function seedAppointment(
  admin: AnyClient,
  cellTag: string,
  tenant: SeededTenant,
  customerId: string,
  opts: SeedAppointmentOptions,
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      tenant_id: tenant.id,
      location_id: tenant.locationId,
      customer_id: customerId,
      status: opts.status ?? "scheduled",
      payment_status: opts.paymentStatus ?? "unpaid",
      total_amount: opts.totalAmount,
      amount_paid: opts.amountPaid ?? 0,
      scheduled_start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      scheduled_end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      booking_reference: cellTag,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedAppointment: ${error.message}`);
  return { id: data.id };
}

export interface SeedInvoiceOptions {
  total: number;
  status?: "draft" | "sent" | "paid" | "void";
}

export async function seedInvoice(
  admin: AnyClient,
  cellTag: string,
  tenantId: string,
  customerId: string,
  opts: SeedInvoiceOptions,
): Promise<{ id: string; invoiceNumber: string }> {
  const invoiceNumber = `E2E-${cellTag}`;
  const { data, error } = await admin
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      subtotal: opts.total,
      total: opts.total,
      status: opts.status ?? "sent",
    })
    .select("id, invoice_number")
    .single();
  if (error) throw new Error(`seedInvoice: ${error.message}`);
  return { id: data.id, invoiceNumber: data.invoice_number };
}

/** The trigger on `tenants` auto-creates a wallet at balance 0 — this only overrides that balance for cells that need a known starting point (e.g. payout cells). */
export async function seedWalletBalance(admin: AnyClient, tenantId: string, balance: number): Promise<{ walletId: string }> {
  const { data, error } = await admin
    .from("salon_wallets")
    .update({ balance })
    .eq("tenant_id", tenantId)
    .select("id")
    .single();
  if (error) throw new Error(`seedWalletBalance: ${error.message}`);
  return { walletId: data.id };
}

export interface SeedPayoutDestinationOptions {
  currency: Currency;
  recipientCode?: string;
}

export async function seedPayoutDestination(
  admin: AnyClient,
  cellTag: string,
  tenant: SeededTenant,
  opts: SeedPayoutDestinationOptions,
): Promise<{ id: string }> {
  const country = opts.currency === "GHS" ? "GH" : "NG";
  const { data, error } = await admin
    .from("salon_payout_destinations")
    .insert({
      tenant_id: tenant.id,
      destination_type: "bank",
      country,
      currency: opts.currency,
      account_number: "0000000000",
      account_name: `${cellTag} destination`,
      // A real Paystack transfer recipient code is required for Tier A
      // (process-salon-withdrawal passes it straight through to
      // /transfer). Tier B cells that never reach the real Paystack call
      // (W-OVER, W-DUP-REQ pre-check) can use a placeholder.
      paystack_recipient_code: opts.recipientCode ?? `RCP_${cellTag}`,
      is_default: true,
      location_id: tenant.locationId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedPayoutDestination: ${error.message}`);
  return { id: data.id };
}

export async function seedPaymentIntent(
  admin: AnyClient,
  tenant: SeededTenant,
  opts: {
    amount: number;
    intentType: string;
    reference: string;
    appointmentId?: string;
    customerEmail: string;
    customerName: string;
    status?: string;
  },
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("payment_intents")
    .insert({
      tenant_id: tenant.id,
      appointment_id: opts.appointmentId ?? null,
      amount: opts.amount,
      currency: tenant.currency,
      customer_email: opts.customerEmail,
      customer_name: opts.customerName,
      gateway: "paystack",
      status: opts.status ?? "processing",
      paystack_reference: opts.reference,
      intent_type: opts.intentType,
      metadata: opts.appointmentId ? { appointment_ids: [opts.appointmentId] } : {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedPaymentIntent: ${error.message}`);
  return { id: data.id };
}

/**
 * Deletes every row this fixture tag created, tenant-cascade first (FK
 * ON DELETE CASCADE on tenant_id covers appointments, customers, invoices,
 * payment_intents, transactions, wallet rows, withdrawals, payout
 * destinations). Auth users are cleaned up separately since they have no
 * tenant FK.
 */
// Tables with a NO ACTION (not CASCADE) foreign key to tenants.id that this
// harness can actually cause rows in — processWebhook writes `notifications`
// via createTenantNotification, `audit_logs` via log_audit_event (e.g.
// complete_transaction_refund), and `message_logs` via the notification
// email path, any of which otherwise blocks the tenant delete below with a
// foreign key violation. Deleted explicitly, before the tenant, rather than
// relying on cascade.
const NON_CASCADING_TENANT_CHILD_TABLES = ["notifications", "audit_logs", "message_logs"] as const;

export async function cleanup(admin: AnyClient, cellTag: string, authUserIds: string[] = []): Promise<void> {
  const { data: tenants, error: selectError } = await admin.from("tenants").select("id").ilike("name", `${cellTag}%`);
  if (selectError) {
    console.error(`cleanup(${cellTag}): failed to find fixture tenants: ${selectError.message}`);
  }
  for (const t of tenants ?? []) {
    for (const table of NON_CASCADING_TENANT_CHILD_TABLES) {
      await admin.from(table).delete().eq("tenant_id", t.id);
    }
    const { error: deleteError } = await admin.from("tenants").delete().eq("id", t.id);
    if (deleteError) {
      // A failed teardown must not mask the cell's own result (design
      // section 10) — logged, not thrown.
      console.error(`cleanup(${cellTag}): failed to delete tenant ${t.id}: ${deleteError.message}`);
    }
  }
  for (const userId of authUserIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => {
      // Best-effort — a failed teardown must not mask the cell's own result (design section 10).
    });
  }
}
