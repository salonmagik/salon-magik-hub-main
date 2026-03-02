import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

type MarketingFeatureToggles = {
  waitlist_enabled: boolean;
  other_countries_interest_enabled: boolean;
};

const FALLBACK_TOGGLES: MarketingFeatureToggles = {
  waitlist_enabled: false,
  other_countries_interest_enabled: false,
};

async function getMarketingFeatureToggles(): Promise<MarketingFeatureToggles> {
  const { data, error } = await (supabase.rpc as any)("get_marketing_feature_toggles");
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return FALLBACK_TOGGLES;

  return {
    waitlist_enabled: Boolean(row.waitlist_enabled),
    other_countries_interest_enabled: Boolean(row.other_countries_interest_enabled),
  };
}

function useMarketingFeatureToggles() {
  return useQuery({
    queryKey: ["marketing-feature-toggles"],
    queryFn: getMarketingFeatureToggles,
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 15,
    retry: 1,
  });
}

export function useWaitlistMode() {
  const query = useMarketingFeatureToggles();

  if (query.error) {
    console.error("Failed to read marketing feature toggles", query.error);
  }

  return {
    isWaitlistMode: query.data?.waitlist_enabled ?? FALLBACK_TOGGLES.waitlist_enabled,
    isLoading: query.isLoading,
  };
}

export function useGeoInterestMode() {
  const query = useMarketingFeatureToggles();

  if (query.error) {
    console.error("Failed to read marketing feature toggles", query.error);
  }

  return {
    isEnabled:
      query.data?.other_countries_interest_enabled ??
      FALLBACK_TOGGLES.other_countries_interest_enabled,
    isLoading: query.isLoading,
  };
}

export function useFeatureFlags() {
  const toggles = useMarketingFeatureToggles();

  if (toggles.error) {
    console.error("Failed to read marketing feature toggles", toggles.error);
  }

  return {
    waitlist: toggles.data?.waitlist_enabled ?? FALLBACK_TOGGLES.waitlist_enabled,
    geoInterest:
      toggles.data?.other_countries_interest_enabled ??
      FALLBACK_TOGGLES.other_countries_interest_enabled,
    isLoading: toggles.isLoading,
  };
}
