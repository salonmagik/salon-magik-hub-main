/**
 * SMS credit bundle pricing, sourced from platform_settings (key
 * "sms_credit_pricing") rather than hardcoded here — a tier's bundle price
 * and Arkesel's real cost/SMS at that tier live in the DB; credits granted
 * are always computed from them plus the margin, never stored, so editing
 * the margin in backoffice recalculates every tier automatically.
 */

export interface SmsCreditTier {
  bundlePrice: number;
  arkeselCostPerSms: number;
  /** Computed: floor(bundlePrice / (arkeselCostPerSms * marginMultiplier)) */
  credits: number;
}

export interface SmsCreditPricing {
  marginMultiplier: number;
  lowBalanceThresholdCredits: number;
  tiersByCurrency: Record<string, SmsCreditTier[]>;
}

export async function getSmsCreditPricing(
  supabase: { from: (table: string) => any },
): Promise<SmsCreditPricing> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "sms_credit_pricing")
    .maybeSingle();

  if (error) {
    console.error("Failed to load sms_credit_pricing, using fallback:", error);
  }

  const value = (data?.value || {}) as Record<string, unknown>;
  const marginMultiplier = Number(value.margin_multiplier ?? 1.5);
  const lowBalanceThresholdCredits = Number(value.low_balance_threshold_credits ?? 20);
  const rawTiers = (value.tiers || {}) as Record<string, Array<{ bundle_price: number; arkesel_cost_per_sms: number }>>;

  const tiersByCurrency: Record<string, SmsCreditTier[]> = {};
  for (const [currency, tiers] of Object.entries(rawTiers)) {
    tiersByCurrency[currency] = (tiers || []).map((t) => {
      const bundlePrice = Number(t.bundle_price);
      const arkeselCostPerSms = Number(t.arkesel_cost_per_sms);
      const ourCostPerCredit = arkeselCostPerSms * marginMultiplier;
      const credits = ourCostPerCredit > 0 ? Math.floor(bundlePrice / ourCostPerCredit) : 0;
      return { bundlePrice, arkeselCostPerSms, credits };
    });
  }

  return { marginMultiplier, lowBalanceThresholdCredits, tiersByCurrency };
}

/**
 * Finds the exact tier matching a bundle price the client claims to be
 * purchasing, for the given currency. Returns null if no tier matches —
 * callers should reject the purchase rather than trust a client-supplied
 * amount, since that amount previously wasn't re-validated server-side at
 * all (a real price-manipulation gap this closes).
 */
export function findSmsCreditTier(
  pricing: SmsCreditPricing,
  currency: string,
  bundlePrice: number,
): SmsCreditTier | null {
  const tiers = pricing.tiersByCurrency[currency.toUpperCase()] || [];
  return tiers.find((t) => Math.abs(t.bundlePrice - bundlePrice) < 0.01) || null;
}
