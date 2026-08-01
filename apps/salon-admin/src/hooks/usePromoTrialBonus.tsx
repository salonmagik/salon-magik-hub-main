import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface PromoTrialBonusConfig {
  enabled: boolean;
  windowDays: number;
  bonusDays: number;
}

/**
 * Reads the promo_trial_bonus platform_settings row — the single source of
 * truth for whether the "apply a promo code for extra trial days" incentive
 * is currently on, and its numbers. Backoffice can flip `enabled` or change
 * the day counts at any time with zero code changes on this side; every
 * surface that mentions the incentive (banner, reminder modals) must read
 * through this hook rather than hardcoding the day counts or an on/off flag.
 */
export function usePromoTrialBonusConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings", "promo_trial_bonus"],
    queryFn: async (): Promise<PromoTrialBonusConfig> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "promo_trial_bonus")
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Record<string, unknown>;
      return {
        enabled: typeof v.enabled === "boolean" ? v.enabled : true,
        windowDays: typeof v.window_days === "number" ? v.window_days : 7,
        bonusDays: typeof v.bonus_days === "number" ? v.bonus_days : 7,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return { config: data, isLoading };
}

/**
 * Whether THIS tenant is currently within the promo-bonus eligibility
 * window, hasn't already claimed the bonus, and the incentive is enabled —
 * i.e. whether any UI should mention/offer it right now.
 */
export function usePromoTrialBonusEligibility() {
  const { currentTenant } = useAuth();
  const { config, isLoading } = usePromoTrialBonusConfig();

  if (isLoading || !config || !currentTenant) {
    return { eligible: false, config, isLoading };
  }

  const tenant = currentTenant as { created_at?: string; trial_bonus_granted_at?: string | null; subscription_status?: string };

  if (!config.enabled) return { eligible: false, config, isLoading };
  if (tenant.subscription_status !== "trialing") return { eligible: false, config, isLoading };
  if (tenant.trial_bonus_granted_at) return { eligible: false, config, isLoading };
  if (!tenant.created_at) return { eligible: false, config, isLoading };

  const windowEnd = new Date(tenant.created_at).getTime() + config.windowDays * 24 * 60 * 60 * 1000;
  const eligible = Date.now() < windowEnd;

  return { eligible, config, isLoading, daysLeftInWindow: Math.max(0, Math.ceil((windowEnd - Date.now()) / (24 * 60 * 60 * 1000))) };
}
