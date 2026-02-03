export type Currency = "USD" | "NGN" | "GHS";
export type PlanId = "solo" | "studio" | "chain";

export interface PriceTier {
  monthly: number;
  annual: number;
  effectiveMonthly: number;
}

export const PRICING: Record<PlanId, Record<Currency, PriceTier>> = {
  solo: {
    USD: { monthly: 15, annual: 158.40, effectiveMonthly: 13.20 },
    NGN: { monthly: 12000, annual: 126720, effectiveMonthly: 10560 },
    GHS: { monthly: 180, annual: 1900.80, effectiveMonthly: 158.40 },
  },
  studio: {
    USD: { monthly: 30, annual: 316.80, effectiveMonthly: 26.40 },
    NGN: { monthly: 15000, annual: 158400, effectiveMonthly: 13200 },
    GHS: { monthly: 360, annual: 3801.60, effectiveMonthly: 316.80 },
  },
  chain: {
    USD: { monthly: 45, annual: 0, effectiveMonthly: 45 },
    NGN: { monthly: 35000, annual: 0, effectiveMonthly: 35000 },
    GHS: { monthly: 540, annual: 0, effectiveMonthly: 540 },
  },
};

export const CHAIN_ADDITIONAL_LOCATIONS: Record<string, Record<Currency, number> | "custom"> = {
  "2-3": { USD: 30, NGN: 25000, GHS: 360 },
  "4-10": { USD: 20, NGN: 18000, GHS: 240 },
  "11+": "custom",
};

export const TRIAL_DAYS = 14;

// Plan features for display
export const PLAN_FEATURES: Record<PlanId, string[]> = {
  solo: [
    "1 location",
    "Owner + 1 helper",
    "Unlimited appointments",
    "Basic reports",
    "30 free messages/month",
  ],
  studio: [
    "1 location",
    "Up to 10 staff",
    "Advanced scheduling",
    "Full analytics",
    "100 free messages/month",
    "Online booking",
    "Customer purse",
  ],
  chain: [
    "Unlimited locations",
    "Unlimited staff",
    "Multi-location management",
    "Advanced analytics",
    "500 free messages/month",
    "Priority support",
    "API access",
  ],
};

export const PLAN_DESCRIPTIONS: Record<PlanId, string> = {
  solo: "Perfect for independent stylists",
  studio: "For growing salons with a small team",
  chain: "For multi-location businesses",
};

/**
 * Get the currency for a given country code
 */
export function getCurrencyForCountry(countryCode: string): Currency {
  const currencyMap: Record<string, Currency> = {
    NG: "NGN",
    GH: "GHS",
    US: "USD",
    GB: "USD", // Default to USD for non-African markets
    KE: "USD",
    ZA: "USD",
  };
  return currencyMap[countryCode] || "USD";
}

/**
 * Format pricing for display
 */
export function formatPlanPrice(
  planId: PlanId,
  currency: Currency,
  billingCycle: "monthly" | "annual" = "monthly"
): { price: number; period: string; savings?: string } {
  const tier = PRICING[planId][currency];
  
  if (billingCycle === "annual" && tier.annual > 0) {
    const monthlySavings = tier.monthly - tier.effectiveMonthly;
    const yearlyTotal = tier.monthly * 12;
    const savingsPercent = Math.round((monthlySavings / tier.monthly) * 100);
    
    return {
      price: tier.effectiveMonthly,
      period: "/mo (billed annually)",
      savings: `Save ${savingsPercent}%`,
    };
  }
  
  return {
    price: tier.monthly,
    period: "/month",
  };
}
