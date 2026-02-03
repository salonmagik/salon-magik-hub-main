import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export interface CustomerPurse {
  id: string;
  tenant_id: string;
  customer_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export function useCustomerPurse(customerId?: string) {
  const { currentTenant } = useAuth();
  const [purse, setPurse] = useState<CustomerPurse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPurse = useCallback(async () => {
    if (!currentTenant?.id || !customerId) {
      setPurse(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("customer_purses")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setPurse(data as CustomerPurse | null);
    } catch (err) {
      console.error("Error fetching customer purse:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, customerId]);

  // Fetch purse transactions (from transactions table filtered by purse type)
  const fetchPurseTransactions = async () => {
    if (!currentTenant?.id || !customerId) return [];

    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("customer_id", customerId)
        .in("type", ["purse_topup", "purse_redemption"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (err) {
      console.error("Error fetching purse transactions:", err);
      return [];
    }
  };

  return {
    purse,
    balance: purse?.balance || 0,
    isLoading,
    error,
    refetch: fetchPurse,
    fetchPurseTransactions,
  };
}

// Hook to get all customer purses for the tenant (for stats)
export function useAllCustomerPurses() {
  const { currentTenant } = useAuth();
  const [purses, setPurses] = useState<CustomerPurse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPurses = useCallback(async () => {
    if (!currentTenant?.id) {
      setPurses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("customer_purses")
        .select("*")
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      setPurses((data as CustomerPurse[]) || []);
    } catch (err) {
      console.error("Error fetching purses:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  const totalBalance = purses.reduce((sum, p) => sum + Number(p.balance), 0);

  return {
    purses,
    totalBalance,
    isLoading,
    refetch: fetchPurses,
  };
}
