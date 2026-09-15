// refund.integration.test.ts — REF-a/REF-b/REF-c generalised over
// BOOK/CPT/INV (design AD-R3, implementation order step 8, FR-13,
// corrections C-1/C-2/C-3).
//
// REF-a (refund-via-paystack returns success + records correctly) requires a
// real charge.success delivered by Paystack to a deployed webhook — the
// underlying transaction must actually exist on Paystack's side for a real
// refund call to succeed — so it is gated on assertTierAWebhookReachable()
// (design AD-R4) and recorded not-run with the specific unmet reason when
// that precondition doesn't hold, never silently skipped.
//
// REF-b's defining question — does completing a refund debit the salon
// wallet (C-3)? — is answered entirely inside complete_transaction_refund,
// a Postgres RPC that never touches Paystack. This suite calls that RPC
// directly (as an authenticated owner, since it gates on auth.uid()) to get
// real evidence for C-3 without needing a Paystack key. This is narrower
// than the full REF-b cell (it doesn't prove refund-via-paystack's own
// plumbing), and is recorded as such. It runs at Tier B.
//
// REF-c (out-of-band refund) is Tier-A-only by design (a refund issued
// directly against Paystack, no in-product action) — it cannot be attempted
// at Tier B at all, with or without credentials, and is recorded `n/a`.
//
// design Data Flow / Edge Case 4: for CPT and INV, complete_transaction_refund
// requires a transactions row with type in ('payment', 'deposit') and a
// non-null customer_id (supabase/migrations/20260725000002_customer_value_and_refunds.sql).
// Reading the processor's branches (supabase/functions/_shared/payment-webhook-processor.ts):
// customer_purse_topup inserts a 'purse_topup' transaction, and
// invoice_payment inserts no transactions row at all (both credit via
// credit_salon_purse, a wallet-ledger-only RPC). Neither branch can ever
// produce a refundable transaction — this is a static finding from the
// current processor code, not something a seeded fixture could route around
// ("do not seed around it" — design Data Flow), so CPT/INV record REF-a/b/c
// as n/a without seeding anything.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/refund.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv } from "./env.ts";
import { cleanup, seedAppointment, seedCustomer, seedOwner, seedTenant, tag } from "./fixtures.ts";
import { snapshotWallet } from "./assertions.ts";
import { recordCell } from "./evidence.ts";
import { deliverToProcessor } from "./webhook-replay.ts";
import { assertTierAWebhookReachable } from "./tier-a.ts";
import { REF_APPLICABLE_INTENTS, type Currency, type Intent } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

/** Intents where the webhook path never produces a refundable type:'payment'/'deposit' transaction (see file header). */
const NO_REFUNDABLE_TRANSACTION_INTENTS: Intent[] = ["CPT", "INV"];

for (const intent of REF_APPLICABLE_INTENTS) {
  for (const currency of ["GHS", "NGN"] as Currency[]) {
    if (NO_REFUNDABLE_TRANSACTION_INTENTS.includes(intent)) {
      Deno.test(`refund: REF (${intent}, ${currency}) — no refundable transaction exists`, async () => {
        const note =
          `no refundable type:'payment'/'deposit' transaction can ever exist for ${intent} — the webhook path ` +
          `credits a different destination instead (see file header for the exact processor branch read)`;
        for (const sub of ["REF-a", "REF-b", "REF-c"] as const) {
          await recordCell({
            cell_id: `PAY-${intent}-${sub}-${currency}`,
            requirement_ids: ["FR-13"],
            currency,
            intent,
            scenario: sub,
            tier: "n/a",
            result: "n/a",
            note,
          });
        }
      });
      continue;
    }

    Deno.test(`refund: REF-a via refund-via-paystack (${intent}, ${currency})`, async () => {
      // This harness does not call refund-via-paystack in this pass at all
      // (see implementer report) — the cell is not-run regardless of
      // whether the Tier A precondition happens to be met, since "not
      // attempted" is a distinct, honest fact from "attempted and failed"
      // (design AD-7/AD-R2: a fail record must carry the before/after state
      // that justified it, which does not exist here because nothing ran).
      const gate = assertTierAWebhookReachable(env, currency);
      await recordCell({
        cell_id: `PAY-${intent}-REF-a-${currency}`,
        requirement_ids: ["FR-13"],
        currency,
        intent,
        scenario: "REF-a",
        tier: "A",
        result: "not-run",
        note: gate.met
          ? "Tier A precondition met, but this harness does not call refund-via-paystack in this pass — see implementer report"
          : gate.reason!,
      });
    });

    Deno.test(`refund: REF-b — complete_transaction_refund does not debit the salon wallet (${intent}, ${currency})`, async () => {
      const cellTag = tag(`ref-b-${intent.toLowerCase()}-${currency}`);
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
          cell_id: `PAY-${intent}-REF-b-${currency}`,
          requirement_ids: ["FR-13"],
          currency,
          intent,
          scenario: "REF-b",
          tier: "B",
          result: debited ? "pass" : "fail",
          before: walletBefore,
          after: walletAfter,
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

    Deno.test(`refund: REF-c — out-of-band refund is Tier-A-only, not attempted at Tier B (${intent}, ${currency})`, async () => {
      await recordCell({
        cell_id: `PAY-${intent}-REF-c-${currency}`,
        requirement_ids: ["FR-13"],
        currency,
        intent,
        scenario: "REF-c",
        tier: "n/a",
        result: "n/a",
        note: "REF-c requires a refund issued directly against Paystack (dashboard/API) with no in-product action — Tier A only by design, and out of scope for an in-product harness to drive.",
      });
    });
  }
}
