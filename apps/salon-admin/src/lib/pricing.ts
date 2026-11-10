export type Currency = "NGN" | "GHS";
export type PlanId = "solo" | "studio" | "chain";

// Ordinal rank of each plan tier, lowest to highest. Used to classify a plan
// change as an upgrade/downgrade independent of price: price_delta alone
// isn't reliable because it comes back null whenever the quote requires
// custom pricing (e.g. branch count needing manual chain-tier pricing).
export const PLAN_TIER_RANK: Record<PlanId, number> = {
  solo: 1,
  studio: 2,
  chain: 3,
};

/**
 * Get the currency for a given country code
 */
export function getCurrencyForCountry(countryCode: string): Currency {
  return countryCode.toUpperCase() === "NG" ? "NGN" : "GHS";
}
