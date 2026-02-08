import { useMemo, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

export interface TrialStatus {
  isTrialing: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  isExpired: boolean;
  isGracePeriod: boolean;
  graceDaysRemaining: number;
}

const GRACE_PERIOD_DAYS = 3;

export function useTrialEnforcement() {
  const { currentTenant } = useAuth();

  const trialStatus = useMemo((): TrialStatus => {
    if (!currentTenant) {
      return {
        isTrialing: false,
        daysRemaining: 0,
        expiresAt: null,
        isExpired: false,
        isGracePeriod: false,
        graceDaysRemaining: 0,
      };
    }

    const isTrialing = currentTenant.subscription_status === "trialing";
    const trialEndsAt = currentTenant.trial_ends_at;

    if (!isTrialing || !trialEndsAt) {
      return {
        isTrialing: false,
        daysRemaining: 0,
        expiresAt: null,
        isExpired: false,
        isGracePeriod: false,
        graceDaysRemaining: 0,
      };
    }

    const now = new Date();
    const expiryDate = new Date(trialEndsAt);
    const gracePeriodEnd = new Date(expiryDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay);
    const graceDaysRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / msPerDay);

    const isExpired = daysRemaining <= 0;
    const isGracePeriod = isExpired && graceDaysRemaining > 0;

    return {
      isTrialing: true,
      daysRemaining: Math.max(0, daysRemaining),
      expiresAt: trialEndsAt,
      isExpired,
      isGracePeriod,
      graceDaysRemaining: Math.max(0, graceDaysRemaining),
    };
  }, [currentTenant]);

  // Initiate card collection checkout
  const collectCard = useCallback(async (): Promise<{ success: boolean; checkoutUrl: string | null }> => {
    if (!currentTenant?.id) {
      return { success: false, checkoutUrl: null };
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          tenantId: currentTenant.id,
          mode: "setup", // Setup mode for card collection only
          returnUrl: `${window.location.origin}/salon/settings?tab=subscription`,
        },
      });

      if (error) throw error;

      return {
        success: true,
        checkoutUrl: data.url || null,
      };
    } catch (err) {
      console.error("Error creating checkout session:", err);
      return { success: false, checkoutUrl: null };
    }
  }, [currentTenant?.id]);

  // Check if user should be blocked from accessing features
  const shouldBlockAccess = useMemo(() => {
    return trialStatus.isExpired && !trialStatus.isGracePeriod;
  }, [trialStatus]);

  // Check if we should show warning banner
  const shouldShowWarning = useMemo(() => {
    return trialStatus.isTrialing && trialStatus.daysRemaining <= 7;
  }, [trialStatus]);

  // Check if we should show urgent banner (last 3 days or grace period)
  const shouldShowUrgent = useMemo(() => {
    return (trialStatus.isTrialing && trialStatus.daysRemaining <= 3) || trialStatus.isGracePeriod;
  }, [trialStatus]);

  return {
    trialStatus,
    collectCard,
    shouldBlockAccess,
    shouldShowWarning,
    shouldShowUrgent,
  };
}
