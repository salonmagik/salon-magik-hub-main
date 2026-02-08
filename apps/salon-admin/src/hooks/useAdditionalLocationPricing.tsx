import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdditionalLocationTier {
  id: string;
  plan_id: string;
  tier_label: string;
  tier_min: number;
  tier_max: number | null;
  currency: string;
  price_per_location: number;
  is_custom: boolean;
}

export function useAdditionalLocationPricing(planId: string, currency: string = "USD") {
  return useQuery({
    queryKey: ["additional-location-pricing", planId, currency],
    queryFn: async (): Promise<AdditionalLocationTier[]> => {
      try {
        // Direct query with type casting for new table
        const { data, error } = await supabase
          .from("additional_location_pricing" as "tenants")
          .select("*")
          .eq("plan_id" as "id", planId)
          .eq("currency" as "slug", currency)
          .order("tier_min" as "name");

        if (error) {
          console.error("Error fetching location pricing:", error);
          return [];
        }
        
        // Type assertion for new table
        const tiers = data as unknown as Array<{
          id: string;
          plan_id: string;
          tier_label: string;
          tier_min: number;
          tier_max: number | null;
          currency: string;
          price_per_location: number;
          is_custom: boolean;
        }>;

        return tiers.map((tier) => ({
          id: tier.id,
          plan_id: tier.plan_id,
          tier_label: tier.tier_label,
          tier_min: tier.tier_min,
          tier_max: tier.tier_max,
          currency: tier.currency,
          price_per_location: Number(tier.price_per_location),
          is_custom: tier.is_custom,
        }));
      } catch (err) {
        console.error("Failed to fetch location pricing:", err);
        return [];
      }
    },
    enabled: !!planId,
    staleTime: 1000 * 60 * 5,
  });
}

// Calculate total price for Chain plan based on number of locations
export function calculateChainPrice(
  basePrice: number,
  locationCount: number,
  tiers: AdditionalLocationTier[]
): { total: number; breakdown: { tier: string; locations: number; pricePerLocation: number; subtotal: number }[] } {
  // Base price includes 1 location
  let total = basePrice;
  const breakdown: { tier: string; locations: number; pricePerLocation: number; subtotal: number }[] = [
    { tier: "Base (1 location)", locations: 1, pricePerLocation: basePrice, subtotal: basePrice },
  ];

  if (locationCount <= 1) {
    return { total, breakdown };
  }

  // Sort tiers by tier_min
  const sortedTiers = [...tiers].sort((a, b) => a.tier_min - b.tier_min);
  let remainingLocations = locationCount - 1; // Subtract the base location

  for (const tier of sortedTiers) {
    if (remainingLocations <= 0) break;

    const tierMax = tier.tier_max ?? Infinity;
    const tierCapacity = tierMax - tier.tier_min + 1;
    const locationsInTier = Math.min(remainingLocations, tierCapacity);

    if (tier.is_custom) {
      // Custom pricing - show as "Contact us"
      breakdown.push({
        tier: tier.tier_label,
        locations: remainingLocations,
        pricePerLocation: 0,
        subtotal: 0,
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
    });

    remainingLocations -= locationsInTier;
  }

  return { total, breakdown };
}
