// refund.integration.test.ts — REF-a/REF-b/REF-c (design implementation
// order step 9, FR-13, corrections C-1/C-2/C-3).
//
// REF-a (refund-via-paystack returns success + records correctly) and the
// Paystack side of REF-b both require a real Paystack test-mode refund —
// refund-via-paystack calls POST https://api.paystack.co/refund
// unconditionally before it ever calls complete_transaction_refund, so
// neither can run without a live sk_test_ key (see implementer report).
// They are recorded `fail` with that reason, not skipped.
//
// REF-b's defining question — does completing a refund debit the salon
// wallet (C-3)? — is answered entirely inside complete_transaction_refund,
// a Postgres RPC that never touches Paystack. This suite calls that RPC
// directly (as an authenticated owner, since it gates on auth.uid()) to get
// real evidence for C-3 without needing a Paystack key. This is narrower
// than the full REF-b cell (it doesn't prove refund-via-paystack's own
// plumbing), and is recorded as such.
//
// REF-c (out-of-band refund) is Tier-A-only by design (a refund issued
// directly against Paystack, no in-product action) — it cannot be attempted
// at Tier B at all, with or without credentials, and is recorded `n/a`.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/refund.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv, requirePaystackKey } from "./env.ts";
import { cleanup, seedAppointment, seedCustomer, seedOwner, seedTenant, tag } from "./fixtures.ts";
import { snapshotWallet } from "./assertions.ts";
import { recordCell } from "./evidence.ts";
import { deliverToProcessor } from "./webhook-replay.ts";
import type { Currency } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`refund: REF-a via refund-via-paystack (${currency}) — blocked without a live Paystack test key`, async () => {
    const cellTag = tag(`ref-a-${currency}`);
    const result: "pass" | "fail" = "fail";
    let note = "";
    try {
      requirePaystackKey(env, currency);
      note = "a live key is present but this harness does not call refund-via-paystack in this pass — see implementer report";
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    } finally {
      await recordCell({
        cell_id: `PAY-BOOK-REF-a-${currency}`,
        requirement_ids: ["FR-13"],
        currency,
        intent: "BOOK",
        scenario: "REF-a",
        tier: "B",
        result,
        note,
      });
    }
  });

  Deno.test(`refund: REF-b — complete_transaction_refund does not debit the salon wallet (${currency})`, async () => {
    const cellTag = tag(`ref-b-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const customer = await seedCustomer(admin, cellTag, tenant.id);
      const owner = await seedOwner(admin, env, cellTag, tenant.id);
      const appointment = await seedAppointment(admin, cellTag, tenant, customer.id, { totalAmount: 100 });
      const reference = `${cellTag}-ref`;
      const { data: paymentIntent } = await admin
        .from("payment_intents")
        .insert({
          tenant_id: tenant.id,
          appointment_id: appointment.id,
          amount: 100,
          currency,
          customer_email: customer.email,
          customer_name: customer.fullName,
          gateway: "paystack",
          status: "processing",
          paystack_reference: reference,
          intent_type: "appointment_payment",
        })
        .select("id")
        .single();

      // Record the original payment first, exactly as processWebhook would,
      // so there is a real 'payment' transaction row to refund.
      await deliverToProcessor({
        event: {
          event: "charge.success",
          data: {
            reference,
            amount: 10000,
            channel: "card",
            metadata: {
              payment_intent_id: paymentIntent!.id,
              tenant_id: tenant.id,
              appointment_ids: JSON.stringify([appointment.id]),
              service_amount: 100,
            },
          },
        },
        supabaseUrl: env.supabaseUrl,
        supabaseServiceKey: env.serviceRoleKey,
      });

      const walletBefore = await snapshotWallet(admin, tenant.id);
      assertEquals(walletBefore.balance, 99.5, `sanity check: wallet should hold the original credit before refunding`);

      const { data: originalTransaction } = await admin
        .from("transactions")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("appointment_id", appointment.id)
        .eq("type", "payment")
        .single();

      // complete_transaction_refund gates on auth.uid() being an
      // owner/manager of the transaction's tenant — call it as the real
      // seeded owner, not the service-role admin client.
      const { data: refundId, error: refundError } = await owner.client.rpc("complete_transaction_refund" as never, {
        p_transaction_id: originalTransaction!.id,
        p_amount: 100,
        p_refund_type: "paystack",
        p_reason: "e2e refund reconciliation check",
        p_request_id: null,
      } as never);

      assertEquals(refundError, null, `complete_transaction_refund should succeed: ${JSON.stringify(refundError)}`);

      const walletAfter = await snapshotWallet(admin, tenant.id);
      const debited = walletAfter.balance < walletBefore.balance;

      await recordCell({
        cell_id: `PAY-BOOK-REF-b-${currency}`,
        requirement_ids: ["FR-13"],
        currency,
        intent: "BOOK",
        scenario: "REF-b",
        tier: "B",
        result: debited ? "pass" : "fail",
        note: debited
          ? `wallet correctly reduced from ${walletBefore.balance} to ${walletAfter.balance}`
          : `C-3 confirmed: complete_transaction_refund (refund id ${refundId}) recorded the refund but wallet balance is unchanged (${walletBefore.balance} -> ${walletAfter.balance}). This is narrower than the full refund-via-paystack cell — see file header.`,
      });

      // This assertion is expected to fail today (C-3) — the test itself is
      // allowed to fail, per design 14.3 ("This cell is expected to fail").
      assertEquals(debited, true, `expected wallet debited on refund (C-3 predicts it will not be)`);
    } finally {
      await cleanup(admin, cellTag, []);
    }
  });

  Deno.test(`refund: REF-c — out-of-band refund is Tier-A-only, not attempted at Tier B (${currency})`, async () => {
    await recordCell({
      cell_id: `PAY-BOOK-REF-c-${currency}`,
      requirement_ids: ["FR-13"],
      currency,
      intent: "BOOK",
      scenario: "REF-c",
      tier: "n/a",
      result: "n/a",
      note: "REF-c requires a refund issued directly against Paystack (dashboard/API) with no in-product action — Tier A only by design, and Tier A is unavailable in this environment (see implementer report).",
    });
  });
}
