import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface CreditTier {
  bundlePrice: number;
  credits: number;
}

interface SmsCreditPricingValue {
  margin_multiplier: number;
  low_balance_threshold_credits: number;
  tiers: Record<string, Array<{ bundle_price: number; arkesel_cost_per_sms: number }>>;
}

function computeTiers(value: SmsCreditPricingValue | null, currency: string): CreditTier[] {
  if (!value) return [];
  const margin = Number(value.margin_multiplier || 1.5);
  const rawTiers = value.tiers?.[currency] || [];
  return rawTiers.map((t) => {
    const ourCostPerCredit = Number(t.arkesel_cost_per_sms) * margin;
    const credits = ourCostPerCredit > 0 ? Math.floor(Number(t.bundle_price) / ourCostPerCredit) : 0;
    return { bundlePrice: Number(t.bundle_price), credits };
  });
}

export function useCreditPurchase() {
  const { currentTenant } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [pricingValue, setPricingValue] = useState<SmsCreditPricingValue | null>(null);
  const currency = currentTenant?.currency || "NGN";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "sms_credit_pricing")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load SMS credit pricing:", error);
        } else {
          setPricingValue((data?.value as unknown as SmsCreditPricingValue) || null);
        }
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tiers = computeTiers(pricingValue, currency);

  const purchaseCredits = useCallback(async (bundlePrice: number): Promise<{ success: boolean; checkoutUrl: string | null }> => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No salon selected", variant: "destructive" });
      return { success: false, checkoutUrl: null };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customerEmail = user?.email || "";
      if (!customerEmail) throw new Error("Unable to retrieve your email address. Please try again.");

      const tier = tiers.find((t) => t.bundlePrice === bundlePrice);

      const { data, error } = await supabase.functions.invoke("create-payment-session", {
        body: {
          tenantId: currentTenant.id,
          amount: bundlePrice,
          currency,
          customerEmail,
          customerName: currentTenant.name || "Salon Owner",
          description: `Purchase ${tier?.credits ?? ""} messaging credits`,
          intentType: "messaging_credit_purchase",
          successUrl: `${window.location.origin}/salon/messaging?purchase=success`,
          cancelUrl: `${window.location.origin}/salon/messaging?purchase=cancelled`,
        },
      });

      if (error) throw error;
      if (data?.paymentUrl || data?.checkoutUrl) {
        return { success: true, checkoutUrl: data.paymentUrl || data.checkoutUrl };
      }
      throw new Error("No checkout URL returned");
    } catch (err) {
      console.error("Error creating checkout session:", err);
      toast({ title: "Error", description: "Failed to initiate purchase. Please try again.", variant: "destructive" });
      return { success: false, checkoutUrl: null };
    }
  }, [currentTenant?.id, currentTenant?.name, currency, tiers]);

  return {
    tiers,
    isLoading,
    purchaseCredits,
    currency,
  };
}
