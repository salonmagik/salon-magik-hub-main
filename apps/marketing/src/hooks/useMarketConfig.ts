import { useQuery } from "@tanstack/react-query";
import { EXPANSION_COUNTRIES, PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import { supabase } from "@supabase-client/supabase/client";

type MarketCountryRow = {
  country_code: string;
};

export function useMarketingMarketCountries() {
  return useQuery({
    queryKey: ["marketing-market-countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_countries")
        .select("country_code")
        .eq("is_selectable", true)
        .in("legal_status", ["active", "legal_approved"]);

      if (error) throw error;
      const liveCodes = new Set(((data ?? []) as MarketCountryRow[]).map((row) => row.country_code));
      const liveCountries = PRODUCT_LIVE_COUNTRIES.filter((country) => liveCodes.has(country.code));
      const expansionCountries = EXPANSION_COUNTRIES.filter((country) => !liveCodes.has(country.code));

      return {
        liveCountries: liveCountries.length > 0 ? liveCountries : PRODUCT_LIVE_COUNTRIES,
        expansionCountries: expansionCountries.length > 0 ? expansionCountries : EXPANSION_COUNTRIES,
      };
    },
    staleTime: 60_000,
    retry: 1,
  });
}
