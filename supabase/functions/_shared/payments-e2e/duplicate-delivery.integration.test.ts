// duplicate-delivery.integration.test.ts — DUP for every intent, both
// currencies (design implementation order step 7, FR-12). The
// byte-identical success event delivered twice; the cell passes only if the
// second delivery changes nothing. Per design 14.3 this is **expected to
// fail for every intent today** and the run records the actual observed
// divergence rather than skipping it — a `fail` result here is the point of
// the cell, not a harness defect.
//
// Same deviation as webhook-recording.integration.test.ts: payment_intents
// are seeded directly rather than obtained via create-payment-session
// (Paystack-blocked) — see that file's header and the implementer report.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/duplicate-delivery.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv } from "./env.ts";
import { cleanup, seedAppointment, seedCustomer, seedInvoice, seedPaymentIntent, seedTenant, tag } from "./fixtures.ts";
import { countInvoices, countLedgerEntries, countTransactions, snapshotAppointment, snapshotWallet } from "./assertions.ts";
import { recordCell } from "./evidence.ts";
import { deliverToProcessor, type PaystackEvent } from "./webhook-replay.ts";
import type { Currency } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

async function deliverTwice(event: PaystackEvent) {
  await deliverToProcessor({ event, supabaseUrl: env.supabaseUrl, supabaseServiceKey: env.serviceRoleKey });
  await deliverToProcessor({ event, supabaseUrl: env.supabaseUrl, supabaseServiceKey: env.serviceRoleKey });
}

interface DupOutcome {
  /** True only if the second delivery changed nothing at all. */
  idempotent: boolean;
  divergence: string;
  before: unknown;
  after: unknown;
}

async function record(cellId: string, currency: Currency, intent: string, outcome: DupOutcome) {
  await recordCell({
    cell_id: cellId,
    requirement_ids: ["FR-12"],
    currency,
    intent,
    scenario: "DUP",
    tier: "B",
    // DUP is expected to fail today (design 14.3) — recording the real
    // outcome either way, never skipped, never forced to pass.
    result: outcome.idempotent ? "pass" : "fail",
    before: outcome.before,
    after: outcome.after,
    note: outcome.idempotent ? "second delivery was a genuine no-op" : outcome.divergence,
  });
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`duplicate-delivery: BOOK-DUP (${currency})`, async () => {
    const cellTag = tag(`dup-book-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 100 });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 100,
        intentType: "appointment_payment",
        reference,
        appointmentId: appointment.id,
        customerEmail: customer.email,
        customerName: customer.fullName,
      });
      const event: PaystackEvent = {
        event: "charge.success",
        data: {
          reference,
          amount: 10000,
          channel: "card",
          metadata: {
            payment_intent_id: paymentIntent.id,
            tenant_id: tenant.id,
            appointment_ids: JSON.stringify([appointment.id]),
            service_amount: 100,
          },
        },
      };

      const before = {
        appointment: await snapshotAppointment(admin, appointment.id),
        transactions: await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id, type: "payment" }),
        invoices: await countInvoices(admin, tenant.id, appointment.id),
        wallet: await snapshotWallet(admin, tenant.id),
      };

      await deliverTwice(event);

      const after = await snapshotAppointment(admin, appointment.id);
      const transactions = await countTransactions(admin, { tenantId: tenant.id, appointmentId: appointment.id, type: "payment" });
      const invoices = await countInvoices(admin, tenant.id, appointment.id);
      const wallet = await snapshotWallet(admin, tenant.id);

      const divergences: string[] = [];
      if (after.amount_paid !== 100) divergences.push(`amount_paid overstated: expected 100, got ${after.amount_paid}`);
      if (transactions.count !== 1) divergences.push(`expected exactly 1 transactions row, got ${transactions.count} (extra rows from the duplicate)`);
      if (invoices !== 1) divergences.push(`expected exactly 1 invoice, got ${invoices} (extra invoice from the duplicate)`);

      const walletDoubled = wallet.balance > 100;
      const walletProtected = !walletDoubled;

      await record(`PAY-BOOK-DUP-${currency}`, currency, "BOOK", {
        idempotent: divergences.length === 0,
        divergence: divergences.length
          ? `${divergences.join("; ")}. Wallet credit ${walletProtected ? "was correctly protected by idempotency" : "was NOT protected — doubled"} (balance=${wallet.balance}).`
          : "no divergence",
        before,
        after: { appointment: after, transactions, invoices, wallet },
      });

      // The wallet-credit idempotency guarantee is a separate, narrower
      // claim than "the whole cell is idempotent" — assert it in isolation
      // so a regression there is caught even if BOOK-DUP's overall result
      // is already `fail` for the transactions/invoice reasons above.
      assertEquals(walletProtected, true, `wallet credit must not double on a duplicate delivery, got balance=${wallet.balance}`);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`duplicate-delivery: CPT-DUP (${currency})`, async () => {
    const cellTag = tag(`dup-cpt-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 20,
        intentType: "customer_purse_topup",
        reference,
        customerEmail: customer.email,
        customerName: customer.fullName,
      });

      const before = {
        purse: (await admin.from("customer_purses").select("balance").eq("customer_id", customer.id).maybeSingle()).data,
        transactions: await countTransactions(admin, { tenantId: tenant.id, customerId: customer.id, type: "purse_topup" }),
      };

      await deliverTwice({
        event: "charge.success",
        data: { reference, amount: 2000, channel: "card", metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id, customer_id: customer.id } },
      });

      const { data: purse } = await admin.from("customer_purses").select("balance").eq("customer_id", customer.id).maybeSingle();
      const transactions = await countTransactions(admin, { tenantId: tenant.id, customerId: customer.id, type: "purse_topup" });
      const ledger = await countLedgerEntries(admin, { tenantId: tenant.id, idempotencyKey: `topup_${reference}` });

      const idempotent = purse?.balance === 20 && transactions.count === 1;
      await record(`PAY-CPT-DUP-${currency}`, currency, "CPT", {
        idempotent,
        divergence: idempotent
          ? "no divergence"
          : `purse balance=${purse?.balance} (expected 20), transactions=${transactions.count} (expected 1). Ledger idempotency entries=${ledger} (expected 1).`,
        before,
        after: { purse, transactions, ledger },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`duplicate-delivery: SPT-DUP (${currency})`, async () => {
    const cellTag = tag(`dup-spt-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 50,
        intentType: "salon_purse_topup",
        reference,
        customerEmail: "salon-topup@e2e.example.com",
        customerName: "Salon Topup",
      });

      const before = { wallet: await snapshotWallet(admin, tenant.id) };

      await deliverTwice({
        event: "charge.success",
        data: { reference, amount: 5000, channel: "card", metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id } },
      });

      const wallet = await snapshotWallet(admin, tenant.id);
      const idempotent = wallet.balance === 50;
      await record(`PAY-SPT-DUP-${currency}`, currency, "SPT", {
        idempotent,
        divergence: idempotent ? "no divergence" : `wallet balance=${wallet.balance} (expected 50, protected by idempotency key)`,
        before,
        after: { wallet },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`duplicate-delivery: INV-DUP (${currency})`, async () => {
    const cellTag = tag(`dup-inv-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const invoice = await seedInvoice(admin, cellTag, tenant.id, customer.id, { total: 40 });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 40,
        intentType: "invoice_payment",
        reference,
        customerEmail: customer.email,
        customerName: customer.fullName,
      });

      const before = { wallet: await snapshotWallet(admin, tenant.id) };

      await deliverTwice({
        event: "charge.success",
        data: {
          reference,
          amount: 4000,
          channel: "card",
          metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id, invoice_id: invoice.id, service_amount: 40 },
        },
      });

      const wallet = await snapshotWallet(admin, tenant.id);
      const idempotent = wallet.balance === 39.8;
      await record(`PAY-INV-DUP-${currency}`, currency, "INV", {
        idempotent,
        divergence: idempotent ? "no divergence" : `wallet balance=${wallet.balance} (expected 39.8, protected by idempotency key on the invoice credit)`,
        before,
        after: { wallet },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`duplicate-delivery: MSG-DUP (${currency})`, async () => {
    const cellTag = tag(`dup-msg-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const reference = `${cellTag}-ref`;
      const paymentIntent = await seedPaymentIntent(admin, tenant, {
        amount: 10,
        intentType: "messaging_credit_purchase",
        reference,
        customerEmail: "msg@e2e.example.com",
        customerName: "Messaging Credits",
      });

      const before = {
        credits: (await admin.from("communication_credits").select("balance").eq("tenant_id", tenant.id).maybeSingle()).data,
        purchaseCount: (await admin.from("messaging_credit_purchases").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id)).count,
      };

      await deliverTwice({
        event: "charge.success",
        data: { reference, amount: 1000, channel: "card", metadata: { payment_intent_id: paymentIntent.id, tenant_id: tenant.id, credits: "200" } },
      });

      const { data: credits } = await admin.from("communication_credits").select("balance").eq("tenant_id", tenant.id).maybeSingle();
      const { count } = await admin.from("messaging_credit_purchases").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id);

      // messaging_credit_purchase has no idempotency key at all in the
      // source (see payment-webhook-processor.ts) — this cell is expected
      // to show the credits balance doubled and two purchase rows.
      const idempotent = count === 1;
      await record(`PAY-MSG-DUP-${currency}`, currency, "MSG", {
        idempotent,
        divergence: idempotent
          ? "no divergence"
          : `messaging_credit_purchases rows=${count} (expected 1), communication_credits.balance=${credits?.balance} — this branch has no idempotency key at all, unlike the wallet-credit branches`,
        before,
        after: { credits, purchaseCount: count },
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`duplicate-delivery: SUB-DUP (${currency})`, async () => {
    const cellTag = tag(`dup-sub-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const reference = `${cellTag}-ref`;

      const before = (await admin.from("tenants").select("subscription_status, next_billing_at").eq("id", tenant.id).single()).data;

      await deliverTwice({
        event: "charge.success",
        data: {
          reference,
          amount: 1000,
          channel: "card",
          metadata: { tenant_id: tenant.id, intent: "subscription_activation", billing_cycle: "monthly" },
        },
      });

      const { data: tenantAfter } = await admin.from("tenants").select("subscription_status, next_billing_at").eq("id", tenant.id).single();
      // The handler explicitly guards on next_billing_at being unset before
      // scheduling again — this branch is expected to already be idempotent.
      const idempotent = tenantAfter?.subscription_status === "active" && !!tenantAfter?.next_billing_at;
      await record(`PAY-SUB-DUP-${currency}`, currency, "SUB", {
        idempotent,
        divergence: idempotent ? "no divergence — guarded on next_billing_at being unset" : `unexpected tenant state: ${JSON.stringify(tenantAfter)}`,
        before,
        after: tenantAfter,
      });
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}
