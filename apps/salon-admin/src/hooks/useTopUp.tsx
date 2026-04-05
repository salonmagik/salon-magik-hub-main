import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type WalletLedgerEntry = Tables<"wallet_ledger_entries">;

export interface TopUpPresets {
  NGN: number[];
  GHS: number[];
  USD: number[];
  [key: string]: number[];
}

export interface MinimumTopUp {
  NGN: number;
  GHS: number;
  USD: number;
  [key: string]: number;
}

export const TOPUP_PRESETS: TopUpPresets = {
  NGN: [5000, 10000, 20000, 50000],
  GHS: [100, 250, 500, 1000],
  USD: [100, 250, 500, 1000],
};

export const MINIMUM_TOPUP: MinimumTopUp = {
  NGN: 1000,
  GHS: 50,
  USD: 50,
};

export function useTopUp(tenantId?: string, currency: string = "USD") {
  const [recentTopUps, setRecentTopUps] = useState<WalletLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRecentTopUps = useCallback(async () => {
    if (!tenantId) {
      setRecentTopUps([]);
      return;
    }

    setIsFetchingHistory(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("wallet_ledger_entries")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("wallet_type", "salon")
        .eq("entry_type", "salon_purse_topup")
        .order("created_at", { ascending: false })
        .limit(5);

      if (fetchError) throw fetchError;

      setRecentTopUps((data as WalletLedgerEntry[]) || []);
    } catch (err) {
      console.error("Error fetching recent top-ups:", err);
      setError(err as Error);
    } finally {
      setIsFetchingHistory(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchRecentTopUps();
    }
  }, [tenantId, fetchRecentTopUps]);

  const getMinimumAmount = useCallback((curr: string): number => {
    return MINIMUM_TOPUP[curr] || MINIMUM_TOPUP.USD;
  }, []);

  const getPresetAmounts = useCallback((curr: string): number[] => {
    return TOPUP_PRESETS[curr] || TOPUP_PRESETS.USD;
  }, []);

  const createTopUp = useCallback(
    async (amount: number): Promise<{ success: boolean; checkoutUrl: string | null }> => {
      if (!tenantId) {
        toast({
          title: "Error",
          description: "No salon selected",
          variant: "destructive",
        });
        return { success: false, checkoutUrl: null };
      }

      const minAmount = getMinimumAmount(currency);
      if (amount < minAmount) {
        toast({
          title: "Invalid Amount",
          description: `Minimum top-up amount is ${currency} ${minAmount.toLocaleString()}`,
          variant: "destructive",
        });
        return { success: false, checkoutUrl: null };
      }

      setIsLoading(true);
      setError(null);

      try {
        const successUrl = `${window.location.origin}/salon/settings?tab=wallet&topup=success`;
        const cancelUrl = `${window.location.origin}/salon/settings?tab=wallet&topup=cancelled`;

        const { data, error: invokeError } = await supabase.functions.invoke(
          "create-payment-session",
          {
            body: {
              tenantId,
              amount,
              currency: currency.toUpperCase(),
              customerEmail: (await supabase.auth.getUser()).data.user?.email || "",
              customerName: "Salon Owner",
              description: `Wallet Top-Up: ${currency} ${amount.toLocaleString()}`,
              successUrl,
              cancelUrl,
              intentType: "salon_purse_topup",
            },
          }
        );

        if (invokeError) {
          console.error("Edge function error:", invokeError);
          throw new Error(invokeError.message || "Failed to create payment session");
        }

        if (!data?.checkoutUrl) {
          throw new Error("No checkout URL returned from payment session");
        }

        // Redirect to checkout
        window.location.href = data.checkoutUrl;

        return { success: true, checkoutUrl: data.checkoutUrl };
      } catch (err) {
        console.error("Error creating top-up session:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to initiate top-up";
        toast({
          title: "Top-Up Failed",
          description: errorMessage,
          variant: "destructive",
        });
        setError(err as Error);
        return { success: false, checkoutUrl: null };
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId, currency, getMinimumAmount]
  );

  return {
    createTopUp,
    recentTopUps,
    isLoading,
    isFetchingHistory,
    error,
    refetch: fetchRecentTopUps,
    getMinimumAmount,
    getPresetAmounts,
  };
}
