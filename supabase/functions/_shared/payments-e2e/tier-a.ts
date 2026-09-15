// The single gate for Tier-A-only cells (design AD-R4). Tier A splits into
// two kinds of precondition:
//
//  - server-to-server cells the harness can drive itself (initializeTransaction,
//    fetchTransactionByReference, createRefund, fetchTransfer, fetchBalance)
//    need only PAYMENTS_E2E_TIER=A and a live key for the cell's currency —
//    tierAPrecondition().
//  - cells whose definition requires a customer completing a card payment on
//    Paystack's hosted page — and therefore a real charge.success delivered
//    by Paystack to a deployed webhook — need PAYMENTS_E2E_TIER_A_WEBHOOK_URL
//    on top of that — assertTierAWebhookReachable().
//
// Both must import env.ts, never read Deno.env directly, so every check
// passes through the same guard.

import { loadEnv, requirePaystackKey, type Currency, type PaymentsE2EEnv } from "./env.ts";
import { assertSafeEnvironment } from "./guard.ts";

export interface TierAPreconditionResult {
  met: boolean;
  reason?: string;
}

/**
 * The base Tier A gate. Re-runs assertSafeEnvironment() — cheap, idempotent,
 * pure env read — so the forbidden-project-ref / test-mode-key guarantee
 * holds even when this is called long after env.ts's module-load check,
 * and SUPABASE_URL is validated as not the forbidden (production) ref.
 */
export function tierAPrecondition(env: PaymentsE2EEnv, currency: Currency): TierAPreconditionResult {
  assertSafeEnvironment();

  if (env.tier !== "A") {
    return { met: false, reason: "PAYMENTS_E2E_TIER is not 'A' — Tier A was not requested for this run" };
  }
  try {
    requirePaystackKey(env, currency);
  } catch (error) {
    return { met: false, reason: error instanceof Error ? error.message : String(error) };
  }
  return { met: true };
}

/**
 * The stricter gate for cells that require a real charge.success delivered
 * by Paystack to a deployed webhook — i.e. a customer completed a hosted
 * checkout page, which nothing in this harness can drive on its own
 * (design AD-R4, "Rejected: Automate the hosted-checkout card completion").
 */
export function assertTierAWebhookReachable(env: PaymentsE2EEnv, currency: Currency): TierAPreconditionResult {
  const base = tierAPrecondition(env, currency);
  if (!base.met) return base;

  if (!env.tierAWebhookUrl) {
    return {
      met: false,
      reason:
        "PAYMENTS_E2E_TIER_A_WEBHOOK_URL is not set — this cell requires a real charge.success delivered by " +
        "Paystack to a deployed webhook (a customer completing checkout on Paystack's hosted page), which " +
        "nothing in this harness can drive on its own",
    };
  }
  return { met: true };
}

if (import.meta.main) {
  // Manual smoke check: `deno run -A tier-a.ts` prints the precondition
  // result for both currencies against whatever env is currently exported.
  const env = loadEnv();
  for (const currency of ["GHS", "NGN"] as Currency[]) {
    console.log(`${currency}: tierAPrecondition =`, tierAPrecondition(env, currency));
    console.log(`${currency}: assertTierAWebhookReachable =`, assertTierAWebhookReachable(env, currency));
  }
}
