import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

const waitlistEnv = import.meta.env.VITE_WAITLIST_MODE;
const appVersion = import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || "0.0.0";
const appEnv = (import.meta.env.MODE === "production" ? "prod" : import.meta.env.MODE === "staging" ? "staging" : "dev") as
  | "dev"
  | "staging"
  | "prod";

const getFlagEnabled = async (featureKey: string, fallback = false) => {
  const { data, error } = await (supabase.rpc as any)("evaluate_feature_flag", {
    p_feature_key: featureKey,
    p_environment: appEnv,
    p_app_name: "marketing",
    p_version: appVersion,
    p_country_code: null,
    p_tenant_id: null,
    p_user_id: null,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row?.enabled === "boolean" ? row.enabled : fallback;
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
		queryFn: () => getFlagEnabled("other_countries_interest_enabled", false),
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
