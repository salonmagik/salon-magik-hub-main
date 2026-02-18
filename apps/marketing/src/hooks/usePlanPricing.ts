import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

type PricingRow = {
	id: string;
	plan_id: string;
	currency: string;
	monthly_price: number;
	annual_price: number;
	effective_monthly: number;
};

export function getCurrencySymbol(currency: string) {
	switch (currency) {
		case "USD":
			return "$";
		case "NGN":
			return "₦";
		case "GHS":
			return "₵";
		default:
			return currency;
	}
}

export function usePlanPricing(currency: string) {
	const cur = (currency || "USD").toUpperCase();

	return useQuery({
		queryKey: ["plan-pricing", cur],
		queryFn: async (): Promise<PricingRow[]> => {
			const { data, error } = await supabase
				.from("plan_pricing")
				.select(
					"id, plan_id, currency, monthly_price, annual_price, effective_monthly",
				)
				.eq("currency", cur)
				.is("valid_until", null)
				.order("plan_id", { ascending: true });

			if (error) throw error;

			return (data || []).map((p) => ({
				id: p.id,
				plan_id: p.plan_id,
				currency: p.currency,
				monthly_price: Number(p.monthly_price),
				annual_price: Number(p.annual_price),
				effective_monthly: Number(p.effective_monthly),
			}));
		},
		staleTime: 1000 * 60 * 5,
	});
}
