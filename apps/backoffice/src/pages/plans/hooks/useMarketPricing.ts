import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { MarketCountry, MarketCountryCurrency, PricingMarket } from "../types";

/**
 * The set of sellable markets (country + its default/enabled currency),
 * shared by every per-market add-on pricing editor (seats, staff ops,
 * themes). Market selectability/currency enablement itself is configured
 * in Settings → Markets, not here.
 */
export function useMarketPricing() {
  const { data: marketCountries } = useQuery({
    queryKey: ["backoffice-market-countries-compact"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("market_countries")
        .select("country_code,country_name,is_selectable")
        .order("country_name", { ascending: true });
      if (error) throw error;
      return (data || []) as MarketCountry[];
    },
  });

  const { data: marketCurrencies } = useQuery({
    queryKey: ["backoffice-market-country-currencies-compact"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("market_country_currency")
        .select("country_code,currency_code,is_default,is_enabled");
      if (error) throw error;
      return (data || []) as MarketCountryCurrency[];
    },
  });

  const defaultCurrencyByCountry = useMemo(() => {
    const map = new Map<string, string>();
    (marketCurrencies || [])
      .filter((row) => row.is_default || row.is_enabled)
      .forEach((row) => {
        if (!map.has(row.country_code) || row.is_default) {
          map.set(row.country_code, row.currency_code);
        }
      });
    return map;
  }, [marketCurrencies]);

  const pricingMarkets: PricingMarket[] = useMemo(() => {
    const selectableMarkets = (marketCountries || []).filter((country) => country.is_selectable);
    const source = selectableMarkets.length > 0 ? selectableMarkets : marketCountries || [];
    return source
      .map((country) => ({
        country_code: country.country_code,
        country_name: country.country_name,
        currency:
          defaultCurrencyByCountry.get(country.country_code) ||
          (country.country_code === "NG" ? "NGN" : "GHS"),
      }))
      .sort((a, b) => a.country_name.localeCompare(b.country_name));
  }, [defaultCurrencyByCountry, marketCountries]);

  return { marketCountries, marketCurrencies, pricingMarkets };
}
