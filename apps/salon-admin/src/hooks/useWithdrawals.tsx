import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

export type SalonWithdrawal = Tables<"salon_withdrawals">;

interface CreateWithdrawalData {
  tenantId: string;
  locationId?: string | null;
  payoutDestinationId: string;
  amount: number;
  acceptedTotalDebit: number;
  feeVersion: string;
}

export function useWithdrawals(tenantId?: string, locationId?: string | null) {
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
      let query = supabase
        .from("salon_withdrawals")
        .select("*")
        .eq("tenant_id", tenantId)
      query = locationId
        ? query.eq("location_id", locationId)
        : query.is("location_id", null);
      const { data, error: fetchError } = await query.order("requested_at", { ascending: false });

      if (fetchError) throw fetchError;

      setWithdrawals((data as SalonWithdrawal[]) || []);
    } catch (err) {
      console.error("Error fetching withdrawals:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    if (tenantId) {
      fetchWithdrawals();
    }
  }, [tenantId, locationId, fetchWithdrawals]);

  // A withdrawal's status changes server-side (the transfer.success/failed
  // webhook, or an internal reconciliation) with no action from the user
  // still looking at this page — without this, "pending" only ever updated
  // to its real outcome after the user did something themselves (e.g.
  // submitted another withdrawal), even though the notification for the
  // same event arrived instantly. This hook mounts more than once at a time
  // (PayoutsPage and WithdrawalDialog both use it) — a hardcoded channel
  // name would collide the same way useNotifications' did, so each instance
  // gets its own channel name.
  const instanceIdRef = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`salon-withdrawals-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "salon_withdrawals",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          fetchWithdrawals();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
        
        try {
          const context = response.error.context;
          const body = context instanceof Response ? await context.json() : response.data;
          if (typeof body?.error === "string") errorMessage = body.error;
        } catch {
          // Keep the fallback when the provider returned no JSON response.
        }

        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Withdrawal submitted. Track its status in payout history.",
      });
      
      // Refetch withdrawals to update the list
      await fetchWithdrawals();
      
      return response.data as SalonWithdrawal;
    } catch (err) {
      console.error("Error creating withdrawal:", err);
      toast({
        title: "Withdrawal request needs attention",
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
