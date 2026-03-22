import { useQuery } from "@tanstack/react-query";
import { getCountryByCode, PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import { supabase } from "@/lib/supabase";

type MarketCountryRow = {
  country_code: string;
};

export function useMarketCountries() {
  return useQuery({
    queryKey: ["public-booking-market-countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_countries")
        .select("country_code")
        .eq("is_selectable", true)
        .in("legal_status", ["active", "legal_approved"]);

      if (error) throw error;

      const countries = ((data ?? []) as MarketCountryRow[])
        .map((row) => getCountryByCode(row.country_code))
        .filter(Boolean);

      return countries.length > 0 ? countries : PRODUCT_LIVE_COUNTRIES;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
