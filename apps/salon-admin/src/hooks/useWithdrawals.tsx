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
      const response = await supabase.functions.invoke(
        "process-salon-withdrawal",
        {
          body: data,
        }
      );

      // Check for edge function errors
      if (response.error) {
        // Try to parse error details from response body
        let errorMessage = "We're unable to process your withdrawal at this time.";
        
        if (response.error.context?.body) {
          try {
            const errorBody = typeof response.error.context.body === 'string' 
              ? JSON.parse(response.error.context.body) 
              : response.error.context.body;
            
            if (errorBody.error || errorBody.details) {
              errorMessage = "We're unable to process your withdrawal at this time. " + 
                            "This may be due to your account settings or payment provider limitations. " +
                            "Please contact our support team for assistance.";
            }
          } catch (parseError) {
            console.error("Error parsing error response:", parseError);
          }
        }
        
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Withdrawal processed successfully",
      });
      
      // Refetch withdrawals to update the list
      await fetchWithdrawals();
      
      return response.data as SalonWithdrawal;
    } catch (err) {
      console.error("Error creating withdrawal:", err);
      toast({
        title: "Withdrawal Not Processed",
        description: err instanceof Error ? err.message : "We're unable to process your withdrawal at this time. Please contact support for assistance.",
        variant: "destructive",
      });
      throw err;
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
