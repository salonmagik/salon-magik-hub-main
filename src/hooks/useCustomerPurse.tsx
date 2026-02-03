import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

export interface CustomerPurse {
  id: string;
  tenant_id: string;
  customer_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export type Transaction = Tables<"transactions">;

export interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  appointmentId?: string;
  type?: string;
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

  // Auto-fetch purse when customerId or tenant changes
  useEffect(() => {
    if (customerId && currentTenant?.id) {
      fetchPurse();
    }
  }, [customerId, currentTenant?.id, fetchPurse]);

  // Fetch purse transactions (from transactions table filtered by purse type)
  const fetchPurseTransactions = useCallback(async () => {
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
      console.error("Error fetching purse transactions:", {
        message: err instanceof Error ? err.message : "Unknown error",
        details: String(err),
      });
      return [];
    }
  }, [currentTenant?.id, customerId]);

  // Fetch all transactions for the customer with optional filters
  const fetchAllCustomerTransactions = useCallback(async (filters?: TransactionFilters): Promise<Transaction[]> => {
    if (!currentTenant?.id || !customerId) return [];

    try {
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      // Apply date filters
      if (filters?.startDate) {
        query = query.gte("created_at", filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte("created_at", filters.endDate);
      }

      // Apply amount filters
      if (filters?.minAmount !== undefined) {
        query = query.gte("amount", filters.minAmount);
      }
      if (filters?.maxAmount !== undefined) {
        query = query.lte("amount", filters.maxAmount);
      }

      // Apply appointment filter
      if (filters?.appointmentId) {
        query = query.eq("appointment_id", filters.appointmentId);
      }

      // Apply type filter
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data as Transaction[]) || [];
    } catch (err) {
      console.error("Error fetching all customer transactions:", {
        message: err instanceof Error ? err.message : "Unknown error",
        details: String(err),
      });
      return [];
    }
  }, [currentTenant?.id, customerId]);

  return {
    purse,
    balance: purse?.balance || 0,
    isLoading,
    error,
    refetch: fetchPurse,
    fetchPurseTransactions,
    fetchAllCustomerTransactions,
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

  // Auto-fetch purses when tenant changes
  useEffect(() => {
    fetchPurses();
  }, [fetchPurses]);

  const totalBalance = purses.reduce((sum, p) => sum + Number(p.balance), 0);

  return {
    purses,
    totalBalance,
    isLoading,
    refetch: fetchPurses,
  };
}
