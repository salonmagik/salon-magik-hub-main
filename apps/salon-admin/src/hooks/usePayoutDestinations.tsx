import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

export type PayoutDestination = Tables<"salon_payout_destinations">;

interface CreateDestinationData {
  tenantId: string;
  destinationType: "bank" | "mobile_money";
  country: string;
  currency: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  momoProvider?: string;
  momoNumber?: string;
  isDefault?: boolean;
}

export function usePayoutDestinations(tenantId?: string) {
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDestinations = useCallback(async () => {
    if (!tenantId) {
      setDestinations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("salon_payout_destinations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setDestinations((data as PayoutDestination[]) || []);
    } catch (err) {
      console.error("Error fetching payout destinations:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchDestinations();
    }
  }, [tenantId, fetchDestinations]);

  const createDestination = async (
    data: CreateDestinationData
  ): Promise<PayoutDestination | null> => {
    if (!data.tenantId) {
      toast({
        title: "Error",
        description: "No tenant ID provided",
        variant: "destructive",
      });
      return null;
    }

    try {
      // Call the create-payout-destination edge function
      const { data: destination, error: createError } = await supabase.functions.invoke(
        "create-payout-destination",
        {
          body: data,
        }
      );

      if (createError) throw createError;

      toast({
        title: "Success",
        description: "Payout destination created successfully",
      });
      
      // Refetch destinations to update the list
      await fetchDestinations();
      
      return destination as PayoutDestination;
    } catch (err) {
      console.error("Error creating payout destination:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create payout destination",
        variant: "destructive",
      });
      return null;
    }
  };

  const deleteDestination = async (id: string): Promise<boolean> => {
    if (!tenantId) {
      toast({
        title: "Error",
        description: "No tenant ID provided",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error: deleteError } = await supabase
        .from("salon_payout_destinations")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (deleteError) throw deleteError;

      toast({
        title: "Success",
        description: "Payout destination deleted successfully",
      });
      
      // Refetch destinations to update the list
      await fetchDestinations();
      
      return true;
    } catch (err) {
      console.error("Error deleting payout destination:", err);
      toast({
        title: "Error",
        description: "Failed to delete payout destination",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    destinations,
    isLoading,
    error,
    createDestination,
    deleteDestination,
    refetch: fetchDestinations,
  };
}
