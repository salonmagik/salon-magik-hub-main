import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export interface CreditPackage {
  id: string;
  credits: number;
  priceUSD: number;
  priceNGN: number;
  priceGHS: number;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "pack_50", credits: 50, priceUSD: 5, priceNGN: 3500, priceGHS: 60 },
  { id: "pack_100", credits: 100, priceUSD: 9, priceNGN: 6500, priceGHS: 108 },
  { id: "pack_250", credits: 250, priceUSD: 20, priceNGN: 15000, priceGHS: 240 },
  { id: "pack_500", credits: 500, priceUSD: 35, priceNGN: 27000, priceGHS: 420 },
];

export function useCreditPurchase() {
  const { currentTenant } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const getPackagePrice = useCallback((pkg: CreditPackage, currency: string): number => {
    switch (currency) {
      case "NGN":
        return pkg.priceNGN;
      case "GHS":
        return pkg.priceGHS;
      default:
        return pkg.priceUSD;
    }
  }, []);

  const purchaseCredits = useCallback(async (packageId: string): Promise<{ success: boolean; checkoutUrl: string | null }> => {
    if (!currentTenant?.id) {
      toast({
        title: "Error",
        description: "No salon selected",
        variant: "destructive",
      });
      return { success: false, checkoutUrl: null };
    }

    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      toast({
        title: "Error",
        description: "Invalid package selected",
        variant: "destructive",
      });
      return { success: false, checkoutUrl: null };
    }

    setIsLoading(true);

    try {
      const currency = currentTenant.currency || "USD";
      const amount = getPackagePrice(pkg, currency);

      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          tenantId: currentTenant.id,
          mode: "payment",
          productType: "credits",
          credits: pkg.credits,
          amount,
          currency,
          returnUrl: `${window.location.origin}/salon/messaging?purchase=success`,
          cancelUrl: `${window.location.origin}/salon/messaging?purchase=cancelled`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        return { success: true, checkoutUrl: data.url };
      }

      throw new Error("No checkout URL returned");
    } catch (err) {
      console.error("Error creating checkout session:", err);
      toast({
        title: "Error",
        description: "Failed to initiate purchase. Please try again.",
        variant: "destructive",
      });
      return { success: false, checkoutUrl: null };
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, currentTenant?.currency, getPackagePrice]);

  return {
    packages: CREDIT_PACKAGES,
    purchaseCredits,
    getPackagePrice,
    isLoading,
    currency: currentTenant?.currency || "USD",
  };
}
