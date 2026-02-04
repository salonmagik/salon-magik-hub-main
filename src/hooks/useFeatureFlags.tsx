import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  scope: "platform" | "app" | "tenant" | "feature";
  is_enabled: boolean;
  target_tenant_ids: string[];
  schedule_start: string | null;
  schedule_end: string | null;
  reason: string | null;
}

/**
 * Fetches all feature flags from the database
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as FeatureFlag[];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Check if a specific feature flag is enabled
 * Accounts for scheduling and tenant targeting
 */
export function useFeatureFlag(flagName: string, tenantId?: string) {
  const { data: flags, isLoading, error } = useFeatureFlags();

  const flag = flags?.find((f) => f.name === flagName);

  if (!flag) {
    return { isEnabled: false, isLoading, error };
  }

  // Check scheduling
  const now = new Date();
  if (flag.schedule_start && new Date(flag.schedule_start) > now) {
    return { isEnabled: false, isLoading, error };
  }
  if (flag.schedule_end && new Date(flag.schedule_end) < now) {
    return { isEnabled: false, isLoading, error };
  }

  // Check tenant targeting (if flag targets specific tenants)
  if (flag.target_tenant_ids?.length > 0 && tenantId) {
    const isTargeted = flag.target_tenant_ids.includes(tenantId);
    return { isEnabled: flag.is_enabled && isTargeted, isLoading, error };
  }

  return { isEnabled: flag.is_enabled, isLoading, error };
}

/**
 * Convenience hook for waitlist mode check
 */
export function useWaitlistMode() {
  const { isEnabled, isLoading } = useFeatureFlag("waitlist_enabled");
  return { isWaitlistMode: isEnabled, isLoading };
}
