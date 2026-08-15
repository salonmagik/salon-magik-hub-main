import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export type PayoutMode = "automatic" | "on_demand";

export function usePayoutMode() {
  const { currentTenant } = useAuth();
  const [payoutMode, setPayoutMode] = useState<PayoutMode>("automatic");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPayoutMode = useCallback(async () => {
    if (!currentTenant?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("payout_mode")
        .eq("id", currentTenant.id)
        .single();
      if (error) throw error;
      setPayoutMode((data?.payout_mode as PayoutMode) || "automatic");
    } catch (err) {
      console.error("Error fetching payout mode:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchPayoutMode();
  }, [fetchPayoutMode]);

  const updatePayoutMode = async (nextMode: PayoutMode) => {
    if (!currentTenant?.id) return false;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-payout-mode", {
        body: { tenantId: currentTenant.id, payoutMode: nextMode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPayoutMode(nextMode);
      toast({
        title: "Payout timing updated",
        description: nextMode === "automatic"
          ? "Paystack will pay your bank directly after each payment clears."
          : "Payments will build up in your salon balance until you withdraw.",
      });
      return true;
    } catch (err) {
      console.error("Error updating payout mode:", err);
      toast({
        title: "Couldn't update payout timing",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { payoutMode, isLoading, isSaving, updatePayoutMode };
}
