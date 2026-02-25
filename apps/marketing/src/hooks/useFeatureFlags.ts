import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

const waitlistEnv = import.meta.env.VITE_WAITLIST_MODE;
const getMasterToggleEnabled = async (featureKey: string, fallback = false) => {
  const { data: feature, error: featureError } = await supabase
    .from("platform_features")
    .select("id")
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (featureError || !feature?.id) return fallback;

  const { data: masterFlag, error: flagError } = await supabase
    .from("feature_flags")
    .select("is_enabled")
    .eq("feature_id", feature.id)
    .eq("scope", "feature")
    .maybeSingle();

  if (flagError) return fallback;
  return typeof masterFlag?.is_enabled === "boolean" ? masterFlag.is_enabled : fallback;
};

export function useWaitlistMode() {
	const envValue = String(waitlistEnv ?? "").toLowerCase() === "true";

	const query = useQuery({
		queryKey: ["marketing-feature-flag", "waitlist_enabled"],
		queryFn: () => getMasterToggleEnabled("waitlist_enabled", envValue),
		staleTime: 1000 * 60,
		retry: 1,
	});

	return {
		isWaitlistMode: query.data ?? envValue,
		isLoading: query.isLoading,
	};
}

export function useGeoInterestMode() {
	const query = useQuery({
		queryKey: ["marketing-feature-flag", "other_countries_interest_enabled"],
		queryFn: () => getMasterToggleEnabled("other_countries_interest_enabled", false),
		staleTime: 1000 * 60,
		retry: 1,
	});

	return {
		isEnabled: query.data ?? false,
		isLoading: query.isLoading,
	};
}

export function useFeatureFlags() {
	const waitlist = useWaitlistMode();
	const geoInterest = useGeoInterestMode();

	return {
		waitlist: waitlist.isWaitlistMode,
		geoInterest: geoInterest.isEnabled,
		isLoading: waitlist.isLoading || geoInterest.isLoading,
	};
}
