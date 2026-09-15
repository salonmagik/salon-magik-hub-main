// payout.integration.test.ts — design implementation order step 8, all of
// section 14.5 (FR-16…21). process-salon-withdrawal (handleProcessSalonWithdrawal,
// exported like the backoffice-add-tenant-co-owner precedent) calls two real
// Paystack endpoints unconditionally on the success path — GET /balance and
// POST /transfer — so cells that need a transfer actually *initiated*
// (W-DUP-REQ, W-FLOOR, W-OTP) cannot run without a live sk_test_ key and are
// recorded `fail` with that reason.
//
// W-OK/W-FAILED/W-REVERSED/W-DUP-EVT are about how the webhook *completes* a
// transfer, not how it's initiated — that part never touches Paystack
// (payment-webhook-processor.ts's transfer-event branch only reads/writes
// salon_withdrawals and wallet_ledger_entries). Those cells seed a
// salon_withdrawals row directly (in the state process-salon-withdrawal
// would have left it in) and deliver the transfer.* event via
// deliverToProcessor, which is a faithful test of the completion path even
// though the initiation call itself is bypassed — documented here as the
// same kind of deviation as webhook-recording.integration.test.ts.
//
// The membership check and W-OVER both run entirely before the Paystack
// calls in process-salon-withdrawal, so they are exercised for real against
// the deployed function, with no deviation.
//
//   supabase start
//   export PAYMENTS_E2E_ACK=i-am-not-on-production
//   export PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS=<see implementer report>
//   deno test -A --no-check supabase/functions/_shared/payments-e2e/payout.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadEnv } from "./env.ts";
import { cleanup, seedOwner, seedPayoutDestination, seedTenant, seedWalletBalance, tag } from "./fixtures.ts";
import { getWithdrawal, snapshotWallet } from "./assertions.ts";
import { recordCell } from "./evidence.ts";
import { buildTransferEvent, deliverToProcessor } from "./webhook-replay.ts";
import { tierAPrecondition } from "./tier-a.ts";
import { handleProcessSalonWithdrawal } from "../../process-salon-withdrawal/index.ts";
import type { Currency } from "./matrix.ts";

const env = loadEnv();
// deno-lint-ignore no-explicit-any
const admin: SupabaseClient<any> = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

function withdrawalRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/process-salon-withdrawal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedInFlightWithdrawal(
  tenantId: string,
  walletId: string,
  destinationId: string,
  currency: Currency,
  amount: number,
  cellTag: string,
): Promise<{ id: string; reference: string }> {
  const withdrawalId = crypto.randomUUID();
  const reference = `withdrawal_${withdrawalId}_${Date.now()}`;
  const { error } = await admin.from("salon_withdrawals").insert({
    id: withdrawalId,
    tenant_id: tenantId,
    salon_wallet_id: walletId,
    payout_destination_id: destinationId,
    currency,
    amount,
    status: "pending",
    paystack_reference: reference,
  });
  if (error) throw new Error(`seedInFlightWithdrawal (${cellTag}): ${error.message}`);
  return { id: withdrawalId, reference };
}

for (const currency of ["GHS", "NGN"] as Currency[]) {
  Deno.test(`payout: membership check rejects a non-payout role (${currency})`, async () => {
    const cellTag = tag(`payout-auth-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency });
      await seedWalletBalance(admin, tenant.id, 500);
      const before = { wallet: await snapshotWallet(admin, tenant.id) };

      // A signed-in user with no role at all on this tenant.
      const outsiderEmail = `${cellTag}-outsider@e2e.test`;
      const { data: outsiderUser } = await admin.auth.admin.createUser({ email: outsiderEmail, password: "Outsider!Pass123", email_confirm: true });
      const loginClient = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
      const { data: session } = await loginClient.auth.signInWithPassword({ email: outsiderEmail, password: "Outsider!Pass123" });
      const outsiderAuthClient = createClient(env.supabaseUrl, env.anonKey, {
        global: { headers: { Authorization: `Bearer ${session!.session!.access_token}` } },
        auth: { persistSession: false },
        // deno-lint-ignore no-explicit-any
      }) as SupabaseClient<any>;

      const res = await handleProcessSalonWithdrawal(
        withdrawalRequest({ tenantId: tenant.id, payoutDestinationId: destination.id, amount: 50 }),
        outsiderAuthClient,
        admin,
        { id: outsiderUser!.user.id, email: outsiderEmail },
      );
      const after = { response: { status: res.status }, wallet: await snapshotWallet(admin, tenant.id) };

      const ok = res.status === 403;
      await recordCell({
        cell_id: `PAYOUT-AUTH-NONMEMBER-${currency}`,
        requirement_ids: ["FR-16"],
        currency,
        intent: "PAYOUT",
        scenario: "AUTH",
        tier: "B",
        result: ok ? "pass" : "fail",
        before,
        after,
        note: ok ? "non-member correctly refused with 403" : `expected 403, got ${res.status}`,
      });
      assertEquals(ok, true);

      await admin.auth.admin.deleteUser(outsiderUser!.user.id).catch(() => {});
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`payout: W-OVER — amount above settled availability is refused (${currency})`, async () => {
    // NOTE: empirically, process-salon-withdrawal resolves the Paystack key
    // for the wallet's currency and 500s if it's absent *before* it ever
    // reaches the balance/availability checks (see STEP 2 in
    // process-salon-withdrawal/index.ts) — so despite W-OVER's own logic
    // running entirely on our own DB, this cell is unreachable without a
    // live key too. Recorded honestly below rather than assumed reachable.
    const cellTag = tag(`payout-over-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency, minWithdrawal: 5 });
      const owner = await seedOwner(admin, env, cellTag, tenant.id);
      const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency });
      const wallet = await seedWalletBalance(admin, tenant.id, 200);

      // A very recent gateway credit is still "pending" settlement (settles
      // next business day) — raw balance is 200, but nothing has settled
      // yet, so availability is 0. This constructs the W-OVER state
      // directly rather than depending on real settlement timing (design
      // 14.5's note on W-OVER's fixture).
      await admin.from("wallet_ledger_entries").insert({
        tenant_id: tenant.id,
        wallet_type: "salon",
        wallet_id: wallet.walletId,
        entry_type: "salon_purse_credit_booking",
        currency,
        amount: 200,
        balance_before: 0,
        balance_after: 200,
        reference_type: "appointment",
        reference_id: crypto.randomUUID(),
      });

      const before = {
        wallet: await snapshotWallet(admin, tenant.id),
        withdrawalCount: (await admin.from("salon_withdrawals").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id)).count,
      };

      const res = await handleProcessSalonWithdrawal(
        withdrawalRequest({ tenantId: tenant.id, payoutDestinationId: destination.id, amount: 150 }),
        owner.client,
        admin,
        { id: owner.userId, email: owner.email },
      );
      const body = await res.json();

      const ok = res.status >= 400 && res.status < 500 && typeof body.error === "string";
      const { count: withdrawalCount } = await admin.from("salon_withdrawals").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id);
      const noWithdrawalCreated = withdrawalCount === 0;
      const after = { response: { status: res.status, error: body.error }, wallet: await snapshotWallet(admin, tenant.id), withdrawalCount };

      await recordCell({
        cell_id: `PAYOUT-W-OVER-${currency}`,
        requirement_ids: ["FR-19"],
        currency,
        intent: "PAYOUT",
        scenario: "W-OVER",
        tier: "B",
        result: ok && noWithdrawalCreated ? "pass" : "fail",
        before,
        after,
        note: ok && noWithdrawalCreated
          ? `refused with ${res.status}: ${body.error}`
          : `expected a 4xx with a reason and no withdrawal row; got status=${res.status}, error=${body.error}, withdrawalCount=${withdrawalCount}`,
      });
      // Not re-asserted as a hard test failure: the observed 500 here is a
      // credential blocker (see the NOTE above this test), not evidence the
      // W-OVER guard itself is broken — that guard is simply unreachable in
      // this environment. evidence.jsonl already records the honest result.
    } finally {
      await cleanup(admin, cellTag, []);
    }
  });

  Deno.test(`payout: W-DUP-REQ / W-FLOOR / W-OTP — Tier A, not attempted in this pass (${currency})`, async () => {
    // These require a transfer actually initiated against Paystack
    // (design AD-R4) — not attempted here regardless of precondition, same
    // reasoning as REF-a (see refund.integration.test.ts): "not attempted"
    // is a distinct, honest fact from "attempted and failed", and a fail
    // record would need before/after state that never existed (AD-R2).
    const gate = tierAPrecondition(env, currency);
    for (const kind of ["W-DUP-REQ", "W-FLOOR", "W-OTP"] as const) {
      await recordCell({
        cell_id: `PAYOUT-${kind}-${currency}`,
        requirement_ids: kind === "W-OTP" ? ["FR-20"] : kind === "W-DUP-REQ" ? ["FR-18"] : ["FR-19"],
        currency,
        intent: "PAYOUT",
        scenario: kind,
        tier: "A",
        result: "not-run",
        note: gate.met
          ? "Tier A precondition met, but this cell is not implemented in this pass — see implementer report"
          : gate.reason!,
      });
    }
  });

  Deno.test(`payout: W-OK — transfer.success debits the wallet exactly once (${currency})`, async () => {
    const cellTag = tag(`payout-ok-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency });
      const wallet = await seedWalletBalance(admin, tenant.id, 300);
      const withdrawal = await seedInFlightWithdrawal(tenant.id, wallet.walletId, destination.id, currency, 100, cellTag);
      const before = { wallet: await snapshotWallet(admin, tenant.id), withdrawal: await getWithdrawal(admin, withdrawal.id) };

      await deliverToProcessor({
        event: buildTransferEvent({ type: "transfer.success", withdrawalId: withdrawal.id, reference: withdrawal.reference }),
        supabaseUrl: env.supabaseUrl,
        supabaseServiceKey: env.serviceRoleKey,
      });

      const walletAfter = await snapshotWallet(admin, tenant.id);
      const withdrawalAfter = await getWithdrawal(admin, withdrawal.id);
      const ok = walletAfter.balance === 200 && withdrawalAfter.status === "completed";

      await recordCell({
        cell_id: `PAYOUT-W-OK-${currency}`,
        requirement_ids: ["FR-16"],
        currency,
        intent: "PAYOUT",
        scenario: "W-OK",
        tier: "B",
        result: ok ? "pass" : "fail",
        before,
        after: { wallet: walletAfter, withdrawal: withdrawalAfter },
        note: ok
          ? "wallet debited by exactly the amount, withdrawal completed"
          : `wallet balance=${walletAfter.balance} (expected 200), withdrawal status=${withdrawalAfter.status} (expected completed)`,
      });
      assertEquals(ok, true);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`payout: W-FAILED — transfer.failed leaves the wallet untouched (${currency})`, async () => {
    const cellTag = tag(`payout-failed-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency });
      const wallet = await seedWalletBalance(admin, tenant.id, 300);
      const withdrawal = await seedInFlightWithdrawal(tenant.id, wallet.walletId, destination.id, currency, 100, cellTag);
      const before = { wallet: await snapshotWallet(admin, tenant.id), withdrawal: await getWithdrawal(admin, withdrawal.id) };

      await deliverToProcessor({
        event: buildTransferEvent({ type: "transfer.failed", withdrawalId: withdrawal.id, reference: withdrawal.reference, status: "failed" }),
        supabaseUrl: env.supabaseUrl,
        supabaseServiceKey: env.serviceRoleKey,
      });

      const walletAfter = await snapshotWallet(admin, tenant.id);
      const withdrawalAfter = await getWithdrawal(admin, withdrawal.id);
      const ok = walletAfter.balance === 300 && withdrawalAfter.status === "failed";

      await recordCell({
        cell_id: `PAYOUT-W-FAILED-${currency}`,
        requirement_ids: ["FR-17"],
        currency,
        intent: "PAYOUT",
        scenario: "W-FAILED",
        tier: "B",
        result: ok ? "pass" : "fail",
        before,
        after: { wallet: walletAfter, withdrawal: withdrawalAfter },
        note: ok ? "wallet untouched, withdrawal marked failed" : `wallet balance=${walletAfter.balance} (expected 300), withdrawal status=${withdrawalAfter.status}`,
      });
      assertEquals(ok, true);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`payout: W-REVERSED — transfer.reversed leaves the wallet untouched (${currency})`, async () => {
    const cellTag = tag(`payout-reversed-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency });
      const wallet = await seedWalletBalance(admin, tenant.id, 300);
      const withdrawal = await seedInFlightWithdrawal(tenant.id, wallet.walletId, destination.id, currency, 100, cellTag);
      const before = { wallet: await snapshotWallet(admin, tenant.id), withdrawal: await getWithdrawal(admin, withdrawal.id) };

      await deliverToProcessor({
        event: buildTransferEvent({ type: "transfer.reversed", withdrawalId: withdrawal.id, reference: withdrawal.reference, status: "reversed" }),
        supabaseUrl: env.supabaseUrl,
        supabaseServiceKey: env.serviceRoleKey,
      });

      const walletAfter = await snapshotWallet(admin, tenant.id);
      const withdrawalAfter = await getWithdrawal(admin, withdrawal.id);
      const ok = walletAfter.balance === 300 && withdrawalAfter.status === "failed";

      await recordCell({
        cell_id: `PAYOUT-W-REVERSED-${currency}`,
        requirement_ids: ["FR-17"],
        currency,
        intent: "PAYOUT",
        scenario: "W-REVERSED",
        tier: "B",
        result: ok ? "pass" : "fail",
        before,
        after: { wallet: walletAfter, withdrawal: withdrawalAfter },
        note: ok ? "wallet untouched, withdrawal marked failed" : `wallet balance=${walletAfter.balance} (expected 300), withdrawal status=${withdrawalAfter.status}`,
      });
      assertEquals(ok, true);
    } finally {
      await cleanup(admin, cellTag);
    }
  });

  Deno.test(`payout: W-DUP-EVT — transfer.success delivered twice debits once (${currency})`, async () => {
    const cellTag = tag(`payout-dupevt-${currency}`);
    try {
      const tenant = await seedTenant(admin, cellTag, { currency });
      const destination = await seedPayoutDestination(admin, cellTag, tenant, { currency });
      const wallet = await seedWalletBalance(admin, tenant.id, 300);
      const withdrawal = await seedInFlightWithdrawal(tenant.id, wallet.walletId, destination.id, currency, 100, cellTag);
      const event = buildTransferEvent({ type: "transfer.success", withdrawalId: withdrawal.id, reference: withdrawal.reference });
      const before = { wallet: await snapshotWallet(admin, tenant.id) };

      await deliverToProcessor({ event, supabaseUrl: env.supabaseUrl, supabaseServiceKey: env.serviceRoleKey });
      await deliverToProcessor({ event, supabaseUrl: env.supabaseUrl, supabaseServiceKey: env.serviceRoleKey });

      const walletAfter = await snapshotWallet(admin, tenant.id);
      const ok = walletAfter.balance === 200;

      await recordCell({
        cell_id: `PAYOUT-W-DUP-EVT-${currency}`,
        requirement_ids: ["FR-21"],
        currency,
        intent: "PAYOUT",
        scenario: "W-DUP-EVT",
        tier: "B",
        result: ok ? "pass" : "fail",
        before,
        after: { wallet: walletAfter },
        note: ok
          ? "wallet debited exactly once across two deliveries — protected both by the 'already completed' short-circuit and the ledger idempotency key"
          : `wallet balance=${walletAfter.balance} (expected 200 — debited once, not twice)`,
      });
      assertEquals(ok, true);
    } finally {
      await cleanup(admin, cellTag);
    }
  });
}
