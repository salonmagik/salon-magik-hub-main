import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

const waitlistEnv = import.meta.env.VITE_WAITLIST_MODE;

const getFlagEnabled = async (name: string, fallback = false) => {
	const { data, error } = await supabase
		.from("feature_flags")
		.select("is_enabled")
		.eq("name", name)
		.maybeSingle();

	if (error) throw error;
	return data?.is_enabled ?? fallback;
};

export function useWaitlistMode() {
	const envValue = String(waitlistEnv ?? "").toLowerCase() === "true";

	const query = useQuery({
		queryKey: ["marketing-feature-flag", "waitlist_enabled"],
		queryFn: () => getFlagEnabled("waitlist_enabled", envValue),
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
		queryFn: () => getFlagEnabled("other_countries_interest_enabled", true),
		staleTime: 1000 * 60,
		retry: 1,
	});

	return {
		isEnabled: query.data ?? true,
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
