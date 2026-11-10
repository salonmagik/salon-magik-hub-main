import { useQuery } from "@tanstack/react-query";
import { EXPANSION_COUNTRIES, PRODUCT_LIVE_COUNTRIES } from "@shared/countries";
import { supabase } from "@supabase-client/supabase/client";

type MarketCountryRow = {
  country_code: string;
};

export type MarketingPricingMarket = {
	countryCode: string;
	countryName: string;
	currencyCode: string;
	isDefault: boolean;
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

/**
 * Returns only currencies that backoffice has enabled for live markets.
 * Pricing pages use this instead of a hardcoded currency list so a market can
 * be paused without a frontend deploy.
 */
export function useMarketingPricingMarkets() {
	return useQuery({
		queryKey: ["marketing-pricing-markets"],
		queryFn: async (): Promise<MarketingPricingMarket[]> => {
			const [{ data: countries, error: countriesError }, { data: currencies, error: currenciesError }] = await Promise.all([
				supabase
					.from("market_countries")
					.select("country_code,country_name")
					.eq("is_selectable", true)
					.in("legal_status", ["active", "legal_approved"]),
				supabase
					.from("market_country_currency")
					.select("country_code,currency_code,is_default,is_enabled")
					.eq("is_enabled", true),
			]);

			if (countriesError) throw countriesError;
			if (currenciesError) throw currenciesError;

			const countryByCode = new Map(
				(countries ?? []).map((country) => [country.country_code, country.country_name]),
			);

			return (currencies ?? [])
				.filter((currency) => countryByCode.has(currency.country_code))
				.map((currency) => ({
					countryCode: currency.country_code,
					countryName: countryByCode.get(currency.country_code) ?? currency.country_code,
					currencyCode: currency.currency_code.toUpperCase(),
					isDefault: currency.is_default,
				}))
				.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.countryName.localeCompare(b.countryName));
		},
		staleTime: 60_000,
		retry: 1,
	});
}
