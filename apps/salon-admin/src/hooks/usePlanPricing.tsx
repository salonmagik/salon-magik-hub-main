import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PlanPricing {
  id: string;
  plan_id: string;
  currency: string;
  monthly_price: number;
  annual_price: number;
  effective_monthly: number;
}

export function usePlanPricing(currency: string = "USD") {
  return useQuery({
    queryKey: ["plan-pricing", currency],
    queryFn: async (): Promise<PlanPricing[]> => {
      const { data, error } = await supabase
        .from("plan_pricing")
        .select("*")
        .eq("currency", currency)
        .is("valid_until", null) // Current pricing only
        .order("plan_id");

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
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

export function usePlanPricingByPlan(planId: string, currency: string = "USD") {
  const { data: allPricing, ...rest } = usePlanPricing(currency);
  return {
    ...rest,
    data: allPricing?.find((p) => p.plan_id === planId),
  };
}

// Get currency symbol for display
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    NGN: "₦",
    GHS: "₵",
    GBP: "£",
    EUR: "€",
  };
  return symbols[currency] || currency;
}

// Detect currency based on country
export function getCurrencyForCountry(country: string): string {
  const countryToCurrency: Record<string, string> = {
    NG: "NGN",
    GH: "GHS",
    US: "USD",
    GB: "GBP",
    // Default to USD for other countries
  };
  return countryToCurrency[country] || "USD";
}
