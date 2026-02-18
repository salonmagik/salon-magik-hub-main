import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdditionalLocationTier {
  id: string;
  plan_id: string;
  tier_label: string;
  tier_min: number;
  tier_max: number | null;
  currency: string;
  price_per_location: number | null;
  is_custom: boolean;
}

export interface ChainPriceQuote {
  total_price: number;
  breakdown: Array<{
    tier_label: string;
    locations: number;
    price_per_location: number | null;
    subtotal: number | null;
    is_custom?: boolean;
  }>;
  requires_custom: boolean;
}

export function useAdditionalLocationPricing(planId: string, currency = "USD") {
  return useQuery({
    queryKey: ["additional-location-pricing", planId, currency],
    queryFn: async (): Promise<AdditionalLocationTier[]> => {
      const { data, error } = await (supabase.from as any)("additional_location_pricing")
        .select("*")
        .eq("plan_id", planId)
        .eq("currency", currency)
        .order("tier_min", { ascending: true });

      if (error) throw error;
      return ((data || []) as any[]).map((tier) => ({
        id: tier.id,
        plan_id: tier.plan_id,
        tier_label: tier.tier_label,
        tier_min: Number(tier.tier_min),
        tier_max: tier.tier_max == null ? null : Number(tier.tier_max),
        currency: tier.currency,
        price_per_location:
          tier.price_per_location == null ? null : Number(tier.price_per_location),
        is_custom: Boolean(tier.is_custom),
      }));
    },
    enabled: Boolean(planId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useChainPriceQuote(planId: string | null, currency: string, totalLocations: number) {
  return useQuery({
    queryKey: ["chain-price-quote", planId, currency, totalLocations],
    queryFn: async (): Promise<ChainPriceQuote | null> => {
      if (!planId) return null;
      const { data, error } = await (supabase.rpc as any)("compute_chain_price", {
        p_plan_id: planId,
        p_currency: currency,
        p_total_locations: totalLocations,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        total_price: Number(row.total_price || 0),
        breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
        requires_custom: Boolean(row.requires_custom),
      };
    },
    enabled: Boolean(planId) && Number.isFinite(totalLocations) && totalLocations >= 1,
  });
}

export function calculateChainPrice(
  basePrice: number,
  locationCount: number,
  tiers: AdditionalLocationTier[],
): {
  total: number;
  breakdown: {
    tier: string;
    locations: number;
    pricePerLocation: number | null;
    subtotal: number | null;
    isCustom: boolean;
  }[];
  requiresCustom: boolean;
} {
  let total = basePrice;
  let requiresCustom = false;
  const breakdown: {
    tier: string;
    locations: number;
    pricePerLocation: number | null;
    subtotal: number | null;
    isCustom: boolean;
  }[] = [
    {
      tier: "Base (1 location)",
      locations: 1,
      pricePerLocation: basePrice,
      subtotal: basePrice,
      isCustom: false,
    },
  ];

  if (locationCount <= 1) {
    return { total, breakdown, requiresCustom };
  }

  const sortedTiers = [...tiers].sort((a, b) => a.tier_min - b.tier_min);
  let ptr = 2;

  for (const tier of sortedTiers) {
    if (ptr > locationCount) break;
    if (tier.tier_min > ptr) {
      requiresCustom = true;
      break;
    }

    const tierLimit = tier.tier_max ?? locationCount;
    const locationsInTier = Math.max(0, Math.min(locationCount, tierLimit) - ptr + 1);
    if (locationsInTier <= 0) continue;

    if (tier.is_custom || tier.price_per_location == null) {
      requiresCustom = true;
      breakdown.push({
        tier: tier.tier_label,
        locations: locationsInTier,
        pricePerLocation: null,
        subtotal: null,
        isCustom: true,
      });
      break;
    }

    const subtotal = locationsInTier * tier.price_per_location;
    total += subtotal;
    breakdown.push({
      tier: tier.tier_label,
      locations: locationsInTier,
      pricePerLocation: tier.price_per_location,
      subtotal,
      isCustom: false,
    });

    ptr = tierLimit + 1;
  }

  if (ptr <= locationCount) {
    requiresCustom = true;
  }

  return { total, breakdown, requiresCustom };
}
