import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

export type SalonWithdrawal = Tables<"salon_withdrawals">;

interface CreateWithdrawalData {
  tenantId: string;
  payoutDestinationId: string;
  amount: number;
}

export function useWithdrawals(tenantId?: string) {
  const [withdrawals, setWithdrawals] = useState<SalonWithdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWithdrawals = useCallback(async () => {
    if (!tenantId) {
      setWithdrawals([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("salon_withdrawals")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("requested_at", { ascending: false });

      if (fetchError) throw fetchError;

      setWithdrawals((data as SalonWithdrawal[]) || []);
    } catch (err) {
      console.error("Error fetching withdrawals:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchWithdrawals();
    }
  }, [tenantId, fetchWithdrawals]);

  const createWithdrawal = async (
    data: CreateWithdrawalData
  ): Promise<SalonWithdrawal | null> => {
    if (!data.tenantId) {
      toast({
        title: "Error",
        description: "No tenant ID provided",
        variant: "destructive",
      });
      return null;
    }

    try {
      // Call the process-salon-withdrawal edge function
      const { data: withdrawal, error: createError } = await supabase.functions.invoke(
        "process-salon-withdrawal",
        {
          body: data,
        }
      );

      if (createError) throw createError;

      toast({
        title: "Success",
        description: "Withdrawal processed successfully",
      });
      
      // Refetch withdrawals to update the list
      await fetchWithdrawals();
      
      return withdrawal as SalonWithdrawal;
    } catch (err) {
      console.error("Error creating withdrawal:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to process withdrawal",
        variant: "destructive",
      });
      return null;
    }
  };

  return {
    withdrawals,
    isLoading,
    error,
    createWithdrawal,
    refetch: fetchWithdrawals,
  };
}
