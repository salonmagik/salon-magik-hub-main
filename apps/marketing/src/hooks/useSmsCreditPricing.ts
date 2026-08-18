import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

interface SmsCreditPricingValue {
	tiers: Record<string, Array<{ bundle_price: number }>>;
}

/**
 * Cheapest real bundle price for the given currency, mirroring
 * apps/salon-admin/src/hooks/useCreditPurchase.tsx's tier math so the
 * "Starting from" figure on the public Pricing page matches what a salon
 * actually sees once they're a customer. Arkesel only prices NGN/GHS bundles
 * today, so USD (and any other currency) has no tier data — callers should
 * treat null as "no bundle pricing for this currency" rather than fall back
 * to a fabricated number.
 */
export function useSmsCreditPricing(currency: string) {
	const cur = (currency || "USD").toUpperCase();

	return useQuery({
		queryKey: ["sms-credit-pricing", cur],
		queryFn: async (): Promise<number | null> => {
			const { data, error } = await supabase
				.from("platform_settings")
				.select("value")
				.eq("key", "sms_credit_pricing")
				.maybeSingle();

			if (error) throw error;

			const value = (data?.value as unknown as SmsCreditPricingValue) || null;
			const tiers = value?.tiers?.[cur] || [];
			if (tiers.length === 0) return null;

			return Math.min(...tiers.map((t) => Number(t.bundle_price)));
		},
		staleTime: 1000 * 60 * 5,
	});
}
