// webhook-recording.integration.test.ts — OK / FAIL / ABD-C / ABD-N across
// every applicable intent and both currencies (design implementation order
// step 6, FR-6…11).
//
// Unlike checkout.integration.test.ts, none of this suite touches Paystack:
// deliverToProcessor awaits the real processWebhook directly (AD-2) against
// a payment_intent this harness seeds itself. This is a deliberate,
// documented deviation from the design's Data Flow (section 6, step 3),
// which specifies obtaining the payment_intent by calling the real
// create-payment-session — that call is blocked on a live Paystack
// sk_test_ key (see the implementer report). The deviation does not weaken
// what these cells actually prove: processWebhook's recording behaviour is
// identical regardless of how the payment_intent row it reads came to
// exist, and every expected amount here is still derived the same way the
// real create-payment-session would derive it (computeBookingCharge for
// BOOK), never hardcoded.
//
// ABD-C's distinguishing feature — the customer's browser never returns to
// call verify-booking-payment — is trivially true for every cell in this
// suite, since nothing here ever calls verify-booking-payment at all. Its
// cell is recorded with that caveat rather than claimed as independently
// evidenced from OK.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/webhook-recording.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv } from "./env.ts";
import {
  cleanup,
  seedAppointment,
  seedCustomer,
  seedInvoice,
  seedPaymentIntent,
  seedTenant,
  tag,
  type SeededTenant,
} from "./fixtures.ts";
import { countInvoices, countLedgerEntries, countTransactions, getPaymentIntent, snapshotAppointment, snapshotWallet } from "./assertions.ts";
import { recordCell } from "./evidence.ts";
import { buildChargeFailedEvent, buildChargeSuccessEvent, deliverToProcessor, type PaystackEvent } from "./webhook-replay.ts";
import type { Currency } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

async function deliver(event: PaystackEvent) {
  await deliverToProcessor({ event, supabaseUrl: env.supabaseUrl, supabaseServiceKey: env.serviceRoleKey });
}

interface CellOutcome {
  ok: boolean;
  note: string;
  before: unknown;
  after: unknown;
}

async function record(cellId: string, requirementIds: string[], currency: Currency, intent: string, scenario: string, outcome: CellOutcome) {
  await recordCell({
    cell_id: cellId,
    requirement_ids: requirementIds,
    currency,
    intent,
    scenario,
    tier: "B",
    result: outcome.ok ? "pass" : "fail",
    before: outcome.before,
    after: outcome.after,
    note: outcome.note,
  });
  assertEquals(outcome.ok, true, outcome.note);
}

// --- BOOK ---------------------------------------------------------------

async function bookOkOutcome(tenant: SeededTenant, currency: Currency, cellTag: string): Promise<CellOutcome> {
  const customer = await seedCustomer(admin, cellTag, tenant.id);
  const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 120 });
  const reference = `${cellTag}-ref`;
  const paymentIntent = await seedPaymentIntent(admin, tenant, {
    amount: 120,
    intentType: "appointment_payment",
    reference,
    appointmentId: appointment.id,
    customerEmail: customer.email,
    customerName: customer.fullName,
  });

  const before = {
    appointment: await snapshotAppointment(admin, appointment.id),
    transactions: await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id, type: "payment", currency }),
    invoices: await countInvoices(admin, tenant.id, appointment.id),
    wallet: await snapshotWallet(admin, tenant.id),
    intent: await getPaymentIntent(admin, paymentIntent.id),
  };

  await deliver(buildChargeSuccessEvent({
    reference,
    amount: 120,
    currency,
    intentType: "appointment_payment",
    paymentIntentId: paymentIntent.id,
    tenantId: tenant.id,
    appointmentIds: [appointment.id],
    serviceAmount: 120,
  }));

  const after = await snapshotAppointment(admin, appointment.id);
  const transactions = await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id, type: "payment", currency });
  const invoices = await countInvoices(admin, tenant.id, appointment.id);
  const wallet = await snapshotWallet(admin, tenant.id);
  const intentAfter = await getPaymentIntent(admin, paymentIntent.id);

  const checks = [
    [after.amount_paid === 120, `amount_paid expected 120, got ${after.amount_paid}`],
    [after.payment_status === "fully_paid", `payment_status expected fully_paid, got ${after.payment_status}`],
    [transactions.count === 1, `expected exactly 1 transactions row, got ${transactions.count}`],
    [transactions.totalAmount === 120, `expected transactions total 120, got ${transactions.totalAmount}`],
    [invoices === 1, `expected exactly 1 invoice, got ${invoices}`],
    [wallet.balance === 119.4, `expected wallet credited to 119.4 (0.5% platform charge), got ${wallet.balance}`],
    [wallet.currency === currency, `wallet currency mismatch: ${wallet.currency}`],
    [intentAfter.status === "completed", `payment_intent status expected completed, got ${intentAfter.status}`],
  ] as const;

  const failed = checks.filter(([pass]) => !pass);
  return {
    ok: failed.length === 0,
    note: failed.length ? failed.map(([, m]) => m).join("; ") : "all OK invariants held",
    before,
    after: { appointment: after, transactions, invoices, wallet, intent: intentAfter },
  };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`webhook-recording: BOOK-OK (${currency})`, async () => {
    const cellTag = tag(`wh-book-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await bookOkOutcome(tenant, currency, cellTag);
      await record(`PAY-BOOK-OK-DIRECT-${currency}`, ["FR-6", "FR-7", "FR-8"], currency, "BOOK", "OK", outcome);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: BOOK-ABD-C (${currency})`, async () => {
    const cellTag = tag(`wh-book-abdc-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await bookOkOutcome(tenant, currency, cellTag);
      await record(`PAY-BOOK-ABD-C-${currency}`, ["FR-10"], currency, "BOOK", "ABD-C", {
        ok: outcome.ok,
        note: `${outcome.note} (verify-booking-payment never invoked in this harness for any cell, OK included — see file header)`,
        before: outcome.before,
        after: outcome.after,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: BOOK-FAIL (${currency})`, async () => {
    const cellTag = tag(`wh-book-fail-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 60 });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 60,
        intentType: "appointment_payment",
        reference,
        appointmentId: appointment.id,
        customerEmail: customer.email,
        customerName: customer.fullName,
      });

      const before = {
        appointment: await snapshotAppointment(admin, appointment.id),
        transactions: await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id }),
        invoices: await countInvoices(admin, tenant.id, appointment.id),
        wallet: await snapshotWallet(admin, tenant.id),
        intent: await getPaymentIntent(admin, paymentIntent.id),
      };

      await deliver(buildChargeFailedEvent({ reference, amount: 60, currency, paymentIntentId: paymentIntent.id, tenantId: tenant.id }));

      const after = await snapshotAppointment(admin, appointment.id);
      const transactions = await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id });
      const invoices = await countInvoices(admin, tenant.id, appointment.id);
      const wallet = await snapshotWallet(admin, tenant.id);
      const intentAfter = await getPaymentIntent(admin, paymentIntent.id);

      const checks = [
        [after.amount_paid === 0, `amount_paid expected unchanged (0), got ${after.amount_paid}`],
        [transactions.count === 0, `expected 0 transactions rows, got ${transactions.count}`],
        [invoices === 0, `expected 0 invoices, got ${invoices}`],
        [wallet.balance === 0, `expected wallet unchanged (0), got ${wallet.balance}`],
        [intentAfter.status === "failed", `payment_intent status expected failed, got ${intentAfter.status}`],
      ] as const;
      const failed = checks.filter(([pass]) => !pass);
      await record(`PAY-BOOK-FAIL-${currency}`, ["FR-9"], currency, "BOOK", "FAIL", {
        ok: failed.length === 0,
        note: failed.length ? failed.map(([, m]) => m).join("; ") : "no partial record on failure, as expected",
        before,
        after: { appointment: after, transactions, invoices, wallet, intent: intentAfter },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: BOOK-ABD-N (${currency})`, async () => {
    const cellTag = tag(`wh-book-abdn-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 60 });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 60,
        intentType: "appointment_payment",
        reference,
        appointmentId: appointment.id,
        customerEmail: customer.email,
        customerName: customer.fullName,
      });
      // No webhook ever delivered — this is the point of ABD-N. before/after
      // are taken back-to-back around the (deliberate) no-op, so a pass
      // record still carries the state pair AD-R2 requires.
      const before = {
        appointment: await snapshotAppointment(admin, appointment.id),
        transactions: await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id }),
        wallet: await snapshotWallet(admin, tenant.id),
        intent: await getPaymentIntent(admin, paymentIntent.id),
      };

      const after = await snapshotAppointment(admin, appointment.id);
      const transactions = await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id });
      const wallet = await snapshotWallet(admin, tenant.id);
      const intentAfter = await getPaymentIntent(admin, paymentIntent.id);

      const checks = [
        [after.amount_paid === 0, `amount_paid expected unchanged, got ${after.amount_paid}`],
        [transactions.count === 0, `expected 0 transactions rows, got ${transactions.count}`],
        [wallet.balance === 0, `expected wallet unchanged, got ${wallet.balance}`],
        [intentAfter.status !== "completed", `payment_intent status must not be completed, got ${intentAfter.status}`],
      ] as const;
      const failed = checks.filter(([pass]) => !pass);
      await record(`PAY-BOOK-ABD-N-${currency}`, ["FR-11"], currency, "BOOK", "ABD-N", {
        ok: failed.length === 0,
        note: failed.length ? failed.map(([, m]) => m).join("; ") : `orphaned payment_intent remains '${intentAfter.status}', distinguishable from completed`,
        before,
        after: { appointment: after, transactions, wallet, intent: intentAfter },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}

// --- CPT (customer_purse_topup) -----------------------------------------

async function cptOkOutcome(tenant: SeededTenant, currency: Currency, cellTag: string): Promise<CellOutcome> {
  const customer = await seedCustomer(admin, cellTag, tenant.id);
  const reference = `${cellTag}-ref`;
  const paymentIntent = await seedPaymentIntent(admin, tenant, {
    amount: 30,
    intentType: "customer_purse_topup",
    reference,
    customerEmail: customer.email,
    customerName: customer.fullName,
  });

  const before = {
    purse: (await admin.from("customer_purses").select("balance, currency").eq("customer_id", customer.id).maybeSingle()).data,
    transactions: await countTransactions(admin, { tenantId: tenant.id, customerId: customer.id, type: "purse_topup", currency }),
  };

  await deliver({
    event: "charge.success",
    data: {
      reference,
      amount: 3000,
      channel: "card",
      metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id, customer_id: customer.id },
    },
  });

  const { data: purse } = await admin.from("customer_purses").select("balance, currency").eq("customer_id", customer.id).maybeSingle();
  const transactions = await countTransactions(admin, { tenantId: tenant.id, customerId: customer.id, type: "purse_topup", currency });

  const checks = [
    [purse?.balance === 30, `expected purse balance 30, got ${purse?.balance}`],
    [purse?.currency === currency, `purse currency mismatch: ${purse?.currency}`],
    [transactions.count === 1, `expected exactly 1 purse_topup transaction, got ${transactions.count}`],
  ] as const;
  const failed = checks.filter(([pass]) => !pass);
  return {
    ok: failed.length === 0,
    note: failed.length ? failed.map(([, m]) => m).join("; ") : "all OK invariants held",
    before,
    after: { purse, transactions },
  };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`webhook-recording: CPT-OK (${currency})`, async () => {
    const cellTag = tag(`wh-cpt-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await cptOkOutcome(tenant, currency, cellTag);
      await record(`PAY-CPT-OK-${currency}`, ["FR-6", "FR-7", "FR-8"], currency, "CPT", "OK", outcome);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: CPT-ABD-C (${currency})`, async () => {
    const cellTag = tag(`wh-cpt-abdc-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await cptOkOutcome(tenant, currency, cellTag);
      await record(`PAY-CPT-ABD-C-${currency}`, ["FR-10"], currency, "CPT", "ABD-C", {
        ...outcome,
        note: `${outcome.note} (browser-return path is never invoked by this harness — design §14.3: ABD-C's expected outcome is identical to OK)`,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: CPT-FAIL (${currency})`, async () => {
    const cellTag = tag(`wh-cpt-fail-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 30,
        intentType: "customer_purse_topup",
        reference,
        customerEmail: customer.email,
        customerName: customer.fullName,
      });

      const before = {
        purse: (await admin.from("customer_purses").select("balance, currency").eq("customer_id", customer.id).maybeSingle()).data,
        transactions: await countTransactions(admin, { tenantId: tenant.id, customerId: customer.id, type: "purse_topup", currency }),
        intent: await getPaymentIntent(admin, paymentIntent.id),
      };

      await deliver(buildChargeFailedEvent({ reference, amount: 30, currency, paymentIntentId: paymentIntent.id, tenantId: tenant.id }));

      const { data: purse } = await admin.from("customer_purses").select("balance, currency").eq("customer_id", customer.id).maybeSingle();
      const transactions = await countTransactions(admin, { tenantId: tenant.id, customerId: customer.id, type: "purse_topup", currency });
      const intentAfter = await getPaymentIntent(admin, paymentIntent.id);

      const checks = [
        [(purse?.balance ?? 0) === 0, `expected no purse credit, got balance ${purse?.balance}`],
        [transactions.count === 0, `expected 0 purse_topup transactions, got ${transactions.count}`],
        [intentAfter.status === "failed", `payment_intent status expected failed, got ${intentAfter.status}`],
      ] as const;
      const failed = checks.filter(([pass]) => !pass);
      await record(`PAY-CPT-FAIL-${currency}`, ["FR-9"], currency, "CPT", "FAIL", {
        ok: failed.length === 0,
        note: failed.length ? failed.map(([, m]) => m).join("; ") : "no partial record on failure, as expected",
        before,
        after: { purse, transactions, intent: intentAfter },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}

// --- SPT (salon_purse_topup) ---------------------------------------------

async function sptOkOutcome(tenant: SeededTenant, currency: Currency, cellTag: string): Promise<CellOutcome> {
  const reference = `${cellTag}-ref`;
  const paymentIntent = await seedPaymentIntent(admin, tenant, {
    amount: 75,
    intentType: "salon_purse_topup",
    reference,
    customerEmail: "salon-topup@e2e.test",
    customerName: "Salon Topup",
  });

  const before = {
    wallet: await snapshotWallet(admin, tenant.id),
    ledgerCount: await countLedgerEntries(admin, { tenantId: tenant.id, entryType: "salon_purse_topup" }),
  };

  await deliver({
    event: "charge.success",
    data: { reference, amount: 7500, channel: "card", metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id } },
  });

  const wallet = await snapshotWallet(admin, tenant.id);
  const ledgerCount = await countLedgerEntries(admin, { tenantId: tenant.id, entryType: "salon_purse_topup" });

  const checks = [
    [wallet.balance === 75, `expected wallet balance 75 (salon_purse_topup credits the raw amount, no platform charge deducted), got ${wallet.balance}`],
    [ledgerCount === 1, `expected exactly 1 salon_purse_topup ledger entry, got ${ledgerCount}`],
  ] as const;
  const failed = checks.filter(([pass]) => !pass);
  return {
    ok: failed.length === 0,
    note: failed.length ? failed.map(([, m]) => m).join("; ") : "all OK invariants held. NOTE: this webhook branch inserts no transactions row for salon_purse_topup — see implementer report.",
    before,
    after: { wallet, ledgerCount },
  };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`webhook-recording: SPT-OK (${currency})`, async () => {
    const cellTag = tag(`wh-spt-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await sptOkOutcome(tenant, currency, cellTag);
      await record(`PAY-SPT-OK-${currency}`, ["FR-6", "FR-7", "FR-8"], currency, "SPT", "OK", outcome);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: SPT-ABD-C (${currency})`, async () => {
    const cellTag = tag(`wh-spt-abdc-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await sptOkOutcome(tenant, currency, cellTag);
      await record(`PAY-SPT-ABD-C-${currency}`, ["FR-10"], currency, "SPT", "ABD-C", {
        ...outcome,
        note: `${outcome.note} (browser-return path is never invoked by this harness — design §14.3: ABD-C's expected outcome is identical to OK)`,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}

// --- INV (invoice_payment) ------------------------------------------------

async function invOkOutcome(tenant: SeededTenant, currency: Currency, cellTag: string): Promise<CellOutcome> {
  const customer = await seedCustomer(admin, cellTag, tenant.id);
  const invoice = await seedInvoice(admin, cellTag, tenant.id, customer.id, { total: 45, status: "sent" });
  const reference = `${cellTag}-ref`;
  const paymentIntent = await seedPaymentIntent(admin, tenant, {
    amount: 45,
    intentType: "invoice_payment",
    reference,
    customerEmail: customer.email,
    customerName: customer.fullName,
  });

  const before = {
    invoice: (await admin.from("invoices").select("status, paid_at").eq("id", invoice.id).single()).data,
    wallet: await snapshotWallet(admin, tenant.id),
  };

  await deliver({
    event: "charge.success",
    data: {
      reference,
      amount: 4500,
      channel: "card",
      metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id, invoice_id: invoice.id, service_amount: 45 },
    },
  });

  const { data: invoiceAfter } = await admin.from("invoices").select("status, paid_at").eq("id", invoice.id).single();
  const wallet = await snapshotWallet(admin, tenant.id);

  const checks = [
    [invoiceAfter?.status === "paid", `expected invoice status paid, got ${invoiceAfter?.status}`],
    [!!invoiceAfter?.paid_at, `expected paid_at to be set`],
    [wallet.balance === 44.77, `expected wallet credited net of 0.5% platform charge (44.77), got ${wallet.balance}`],
  ] as const;
  const failed = checks.filter(([pass]) => !pass);
  return {
    ok: failed.length === 0,
    note: failed.length ? failed.map(([, m]) => m).join("; ") : "all OK invariants held",
    before,
    after: { invoice: invoiceAfter, wallet },
  };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`webhook-recording: INV-OK (${currency})`, async () => {
    const cellTag = tag(`wh-inv-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await invOkOutcome(tenant, currency, cellTag);
      await record(`PAY-INV-OK-${currency}`, ["FR-6", "FR-7", "FR-8"], currency, "INV", "OK", outcome);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: INV-ABD-C (${currency})`, async () => {
    const cellTag = tag(`wh-inv-abdc-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await invOkOutcome(tenant, currency, cellTag);
      await record(`PAY-INV-ABD-C-${currency}`, ["FR-10"], currency, "INV", "ABD-C", {
        ...outcome,
        note: `${outcome.note} (browser-return path is never invoked by this harness — design §14.3: ABD-C's expected outcome is identical to OK)`,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}

// --- MSG (messaging_credit_purchase) --------------------------------------

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`webhook-recording: MSG-OK (${currency})`, async () => {
    const cellTag = tag(`wh-msg-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 20,
        intentType: "messaging_credit_purchase",
        reference,
        customerEmail: "msg-credits@e2e.test",
        customerName: "Messaging Credits",
      });

      const before = {
        credits: (await admin.from("communication_credits").select("balance").eq("tenant_id", tenant.id).maybeSingle()).data,
        purchaseCount: (await admin.from("messaging_credit_purchases").select("id", { count: "exact" }).eq("tenant_id", tenant.id)).count,
      };

      await deliver({
        event: "charge.success",
        data: {
          reference,
          amount: 2000,
          channel: "card",
          metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id, credits: "500" },
        },
      });

      const { data: credits } = await admin.from("communication_credits").select("balance").eq("tenant_id", tenant.id).maybeSingle();
      const { data: purchases, count } = await admin
        .from("messaging_credit_purchases")
        .select("id, credits", { count: "exact" })
        .eq("tenant_id", tenant.id);

      const checks = [
        [(credits?.balance ?? 0) >= 500, `expected communication_credits balance to include the purchased 500, got ${credits?.balance}`],
        [count === 1, `expected exactly 1 messaging_credit_purchases row, got ${count}`],
        [purchases?.[0]?.credits === 500, `expected purchase row to record 500 credits, got ${purchases?.[0]?.credits}`],
      ] as const;
      const failed = checks.filter(([pass]) => !pass);
      await record(`PAY-MSG-OK-${currency}`, ["FR-6", "FR-7", "FR-8"], currency, "MSG", "OK", {
        ok: failed.length === 0,
        note: failed.length ? failed.map(([, m]) => m).join("; ") : "all OK invariants held",
        before,
        after: { credits, purchaseCount: count, firstPurchaseCredits: purchases?.[0]?.credits },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}

// --- SUB (subscription_activation) -----------------------------------------
// Reached via event.data.metadata.intent === "subscription_activation",
// special-cased ahead of the intent_type switch — no payment_intents row is
// required for this branch to run.

async function subOkOutcome(tenant: SeededTenant, cellTag: string): Promise<CellOutcome> {
  const reference = `${cellTag}-ref`;

  const before = (await admin
    .from("tenants")
    .select("subscription_status, next_billing_at, billing_cycle, paystack_authorization_code")
    .eq("id", tenant.id)
    .single()).data;

  await deliver({
    event: "charge.success",
    data: {
      reference,
      amount: 1000,
      channel: "card",
      metadata: { tenant_id: tenant.id, intent: "subscription_activation", billing_cycle: "monthly" },
      authorization: { authorization_code: "AUTH_e2e_test", reusable: true },
      customer: { customer_code: "CUS_e2e_test", email: "sub@e2e.test" },
    },
  });

  const { data: tenantAfter } = await admin
    .from("tenants")
    .select("subscription_status, next_billing_at, billing_cycle, paystack_authorization_code")
    .eq("id", tenant.id)
    .single();

  const checks = [
    [tenantAfter?.subscription_status === "active", `expected subscription_status active, got ${tenantAfter?.subscription_status}`],
    [!!tenantAfter?.next_billing_at, `expected next_billing_at to be set`],
    [tenantAfter?.billing_cycle === "monthly", `expected billing_cycle monthly, got ${tenantAfter?.billing_cycle}`],
    [tenantAfter?.paystack_authorization_code === "AUTH_e2e_test", `expected stored authorization code, got ${tenantAfter?.paystack_authorization_code}`],
  ] as const;
  const failed = checks.filter(([pass]) => !pass);
  return {
    ok: failed.length === 0,
    note: failed.length ? failed.map(([, m]) => m).join("; ") : "all OK invariants held",
    before,
    after: tenantAfter,
  };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`webhook-recording: SUB-OK (${currency})`, async () => {
    const cellTag = tag(`wh-sub-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await subOkOutcome(tenant, cellTag);
      await record(`PAY-SUB-OK-${currency}`, ["FR-6", "FR-7", "FR-8"], currency, "SUB", "OK", outcome);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  // Edge case 7 (design): a fresh, dedicated tenant with no subscription —
  // never the OK cell's tenant reused — so ABD-C cannot be confounded by an
  // already-active subscription.
  Deno.test(`webhook-recording: SUB-ABD-C (${currency})`, async () => {
    const cellTag = tag(`wh-sub-abdc-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const outcome = await subOkOutcome(tenant, cellTag);
      await record(`PAY-SUB-ABD-C-${currency}`, ["FR-10"], currency, "SUB", "ABD-C", {
        ...outcome,
        note: `${outcome.note} (browser-return path is never invoked by this harness — design §14.3: ABD-C's expected outcome is identical to OK)`,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`webhook-recording: SUB-FAIL (${currency})`, async () => {
    const cellTag = tag(`wh-sub-fail-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency, platformPercentageCharge: 0.5 });
      const reference = `${cellTag}-ref`;

      const before = (await admin.from("tenants").select("subscription_status").eq("id", tenant.id).single()).data;

      await deliver(buildChargeFailedEvent({ reference, amount: 1000, currency, tenantId: tenant.id, paymentIntentId: "" }));

      const { data: tenantAfter } = await admin.from("tenants").select("subscription_status").eq("id", tenant.id).single();
      const ok = tenantAfter?.subscription_status !== "active";
      await record(`PAY-SUB-FAIL-${currency}`, ["FR-9"], currency, "SUB", "FAIL", {
        ok,
        note: ok ? "subscription not activated on a failed charge, as expected" : `subscription_status unexpectedly ${tenantAfter?.subscription_status}`,
        before,
        after: tenantAfter,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}
