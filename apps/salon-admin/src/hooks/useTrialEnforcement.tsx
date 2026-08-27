import { useMemo, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useActiveTrialOverride } from "./useActiveTrialOverride";
import { supabase } from "@/lib/supabase";
import { getFunctionErrorMessage } from "@shared/function-errors";

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

  const { data: activeOverride } = useActiveTrialOverride(currentTenant?.id);

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

    const isTrialing = Boolean(activeOverride) || currentTenant.subscription_status === "trialing";
    const trialEndsAt = activeOverride?.ends_at ?? currentTenant.trial_ends_at;

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
  }, [currentTenant, activeOverride]);

  // Initiate Paystack subscription checkout (used from trial expiry blocking modal)
  const startUpgradeCheckout = useCallback(async (): Promise<{ success: boolean; checkoutUrl: string | null; error?: string }> => {
    if (!currentTenant?.id) {
      return { success: false, checkoutUrl: null, error: "No active salon found." };
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          tenantId: currentTenant.id,
          successUrl: `${window.location.origin}/salon/subscription?subscription=success`,
          cancelUrl: `${window.location.origin}/salon/subscription`,
        },
      });

      if (error || data?.error) {
        const message = data?.error || (await getFunctionErrorMessage(error));
        return { success: false, checkoutUrl: null, error: message };
      }

      if (!data?.url) {
        return { success: false, checkoutUrl: null, error: "Something went wrong starting checkout. Please try again." };
      }

      return { success: true, checkoutUrl: data.url };
    } catch (err) {
      console.error("Error creating checkout session:", err);
      return { success: false, checkoutUrl: null, error: "Something went wrong starting checkout. Please try again." };
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
    startUpgradeCheckout,
    shouldBlockAccess,
    shouldShowWarning,
    shouldShowUrgent,
  };
}
