// Throwaway substrate smoke test (implementation order step 2): proves
// seed -> assert -> record -> cleanup works end to end against the local
// stack, independent of Paystack. Not part of the scenario matrix in
// section 14 and carries no requirement ids — it is a harness self-test.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=none-for-local-smoke
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/smoke.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv } from "./env.ts";
import {
  cleanup,
  seedAppointment,
  seedCustomer,
  seedOwner,
  seedPaymentIntent,
  seedPayoutDestination,
  seedTenant,
  seedWalletBalance,
  tag,
} from "./fixtures.ts";
import { countTransactions, snapshotAppointment, snapshotWallet } from "./assertions.ts";
import { recordCell, evidencePath } from "./evidence.ts";
import { buildChargeSuccessEvent, deliverToProcessor } from "./webhook-replay.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

Deno.test("substrate smoke: seed -> assert -> record -> cleanup", async () => {
  const cellTag = tag("smoke");
  const scratchEvidencePath = await Deno.makeTempFile({ suffix: ".jsonl" });
  Deno.env.set("PAYMENTS_E2E_EVIDENCE_PATH", scratchEvidencePath);
  try {
    const tenant = await seedTenant(admin, cellTag, { currency: "GHS" });
    const customer = await seedCustomer(admin, cellTag, tenant.id);
    const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 100 });

    const before = await snapshotAppointment(admin, appointment.id);
    assertEquals(before.amount_paid, 0);
    assertEquals(before.total_amount, 100);

    await admin.from("appointments").update({ amount_paid: 40, payment_status: "deposit_paid" }).eq("id", appointment.id);
    const after = await snapshotAppointment(admin, appointment.id);
    assertEquals(after.amount_paid, 40);
    assertEquals(after.payment_status, "deposit_paid");

    const wallet = await seedWalletBalance(admin, tenant.id, 250);
    assertEquals(typeof wallet.walletId, "string");
    const walletSnapshot = await snapshotWallet(admin, tenant.id);
    assertEquals(walletSnapshot.balance, 250);
    assertEquals(walletSnapshot.currency, "GHS");

    await recordCell({
      cell_id: "SMOKE-SUBSTRATE",
      requirement_ids: [],
      currency: "GHS",
      intent: "SMOKE",
      scenario: "SMOKE",
      tier: "B",
      result: "pass",
      before,
      after,
      note: "harness substrate self-test — not part of the scenario matrix",
    });

    const written = await Deno.readTextFile(evidencePath());
    assertEquals(written.includes("SMOKE-SUBSTRATE"), true);
  } finally {
    await cleanup(admin, cellTag);
    Deno.env.delete("PAYMENTS_E2E_EVIDENCE_PATH");
    await Deno.remove(scratchEvidencePath).catch(() => {});
  }
});

Deno.test("substrate smoke: seedOwner produces an authenticated client that can read its own tenant's data", async () => {
  const cellTag = tag("smoke-owner");
  try {
    const tenant = await seedTenant(admin, cellTag, { currency: "NGN" });
    const owner = await seedOwner(admin, env, cellTag, tenant.id);
    const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency: "NGN" });
    assertEquals(typeof destination.id, "string");

    // RLS-gated read as the real owner JWT — proves seedOwner's client is
    // actually authenticated and actually a member of this tenant, which is
    // what payout.integration.test.ts's cells depend on when they drive
    // handleProcessSalonWithdrawal with this same client.
    const { data, error } = await owner.client
      .from("salon_payout_destinations")
      .select("id")
      .eq("id", destination.id)
      .maybeSingle();
    assertEquals(error, null);
    assertEquals(data?.id, destination.id);

    await cleanup(admin, cellTag, [owner.userId]);
  } catch (e) {
    await cleanup(admin, cellTag);
    throw e;
  }
});

Deno.test("substrate smoke: deliverToProcessor drives the real processWebhook against a seeded appointment", async () => {
  // Validates the mechanism BOOK-OK-* depends on (AD-2: awaiting processWebhook
  // directly). This does NOT substitute for BOOK-OK itself, which per the
  // design's Data Flow (section 6, step 3) must obtain its payment_intent by
  // calling the real create-payment-session handler — that call reaches
  // Paystack's live test-mode API and cannot run without a real
  // PAYSTACK_SECRET_KEY_GH/NG (see implementer report). Here the
  // payment_intent is seeded directly so the processor path itself — the
  // part that has no Paystack dependency — can be proven end to end.
  const cellTag = tag("smoke-webhook");
  try {
    const tenant = await seedTenant(admin, cellTag, { currency: "GHS" });
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

    const event = buildChargeSuccessEvent({
      reference,
      amount: 100,
      currency: "GHS",
      intentType: "appointment_payment",
      paymentIntentId: paymentIntent.id,
      tenantId: tenant.id,
      appointmentIds: [appointment.id],
      serviceAmount: 100,
    });

    await deliverToProcessor({
      event,
      supabaseUrl: env.supabaseUrl,
      supabaseServiceKey: env.serviceRoleKey,
    });

    const after = await snapshotAppointment(admin, appointment.id);
    assertEquals(after.amount_paid, 100);
    assertEquals(after.payment_status, "fully_paid");

    const transactions = await countTransactions(admin, {
      tenantId: tenant.id,
      appointmentId: appointment.id,
      type: "payment",
      currency: "GHS",
    });
    assertEquals(transactions.count, 1);
    assertEquals(transactions.totalAmount, 100);

    const walletAfter = await snapshotWallet(admin, tenant.id);
    // credit_salon_purse credits net of platform_percentage_charge (0.5% default from seedTenant).
    assertEquals(walletAfter.balance, 99.5);

    await cleanup(admin, cellTag);
  } catch (e) {
    await cleanup(admin, cellTag);
    throw e;
  }
});

Deno.test("substrate smoke: cleanup actually removes the tenant", async () => {
  const cellTag = tag("smoke-cleanup");
  const tenant = await seedTenant(admin, cellTag, { currency: "NGN" });
  await cleanup(admin, cellTag);

  const { data } = await admin.from("tenants").select("id").eq("id", tenant.id).maybeSingle();
  assertEquals(data, null);
});
