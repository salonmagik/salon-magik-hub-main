type PricingRow = {
  plan_id: string;
  currency: "USD" | "NGN" | "GHS";
  monthly_price: number;
  annual_price: number;
  effective_monthly: number;
};

const priceTable = {
  USD: { solo: 15, studio: 30, chain: 45 },
  NGN: { solo: 12000, studio: 15000, chain: 35000 },
  GHS: { solo: 180, studio: 360, chain: 540 },
} as const;

function buildPricing(currency: "USD" | "NGN" | "GHS"): PricingRow[] {
  const rows: PricingRow[] = [];
  const plans = ["solo", "studio", "chain"] as const;
  for (const p of plans) {
    const monthly = priceTable[currency][p];
    const annual = monthly * 12 * 0.88; // 12% off annual
    rows.push({
      plan_id: p,
      currency,
      monthly_price: monthly,
      annual_price: Number(annual.toFixed(2)),
      effective_monthly: Number((annual / 12).toFixed(2)),
    });
  }
  return rows;
}

export function getCurrencySymbol(currency: string) {
  switch (currency) {
    case "USD": return "$";
    case "NGN": return "₦";
    case "GHS": return "₵";
    default: return currency;
  }
}

export function usePlanPricing(currency: string) {
  const cur = (currency || "USD").toUpperCase() as "USD" | "NGN" | "GHS";
  const data = buildPricing(cur);
  return { data, isLoading: false };
}
