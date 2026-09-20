// Keep the browser quote aligned with the Edge Function quote in
// supabase/functions/_shared/withdrawal-fees.ts. This is intentionally
// self-contained: the shared package must not import files outside its
// rootDir, otherwise the workspace build fails in CI.
// Paystack published transfer pricing, verified 2026-09-16.
export const WITHDRAWAL_FEE_VERSION = "paystack-2026-09-16";

export function quoteWithdrawal(amount: number, currency: string, destinationType: string) {
  const minor = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(minor) ||
    Math.abs(amount * 100 - minor) > 0.000001
  ) {
    throw new Error("Enter an amount with at most two decimal places");
  }
  if (currency !== "NGN" && currency !== "GHS") {
    throw new Error("Unsupported withdrawal currency");
  }
  if (destinationType !== "bank" && !(currency === "GHS" && destinationType === "mobile_money")) {
    throw new Error("Unsupported payout destination");
  }

  const minimum = currency === "NGN" ? 500 : 50;
  const maximum = currency === "NGN" ? 10_000_000 : 50_000;
  if (amount < minimum || amount > maximum) {
    throw new Error(`Withdrawal must be between ${minimum} and ${maximum} ${currency}`);
  }

  const transferFee = currency === "GHS"
    ? (destinationType === "bank" ? 8 : 1)
    : (minor <= 500_000 ? 10 : minor <= 5_000_000 ? 25 : 50);
  const stampDuty = currency === "NGN" && minor >= 1_000_000 ? 50 : 0;

  return {
    amount,
    transferFee,
    stampDuty,
    totalDebit: (minor + (transferFee + stampDuty) * 100) / 100,
    feeVersion: WITHDRAWAL_FEE_VERSION,
  };
}
