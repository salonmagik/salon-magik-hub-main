import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";
import type { Tables } from "@/lib/supabase";

type CustomerPurse = Tables<"customer_purses">;
type Transaction = Tables<"transactions">;
type Tenant = Tables<"tenants">;

export interface PurseWithTenant extends CustomerPurse {
  tenant: Tenant;
}

export function useClientPurse() {
  const { customers, isAuthenticated } = useClientAuth();
  const [purses, setPurses] = useState<PurseWithTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const customerIds = customers.map((c) => c.id);

  const fetchPurses = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setPurses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch purses for all customer records
      const { data: pursesData, error: pursesError } = await supabase
        .from("customer_purses")
        .select("*")
        .in("customer_id", customerIds);

      if (pursesError) throw pursesError;

      if (!pursesData || pursesData.length === 0) {
        setPurses([]);
        setIsLoading(false);
        return;
      }

      // Get tenant info for each purse
      const tenantIds = [...new Set(pursesData.map((p) => p.tenant_id))];
      const { data: tenantsData, error: tenantsError } = await supabase
        .from("tenants")
        .select("*")
        .in("id", tenantIds);

      if (tenantsError) throw tenantsError;

      const tenantsMap = new Map(tenantsData?.map((t) => [t.id, t]) || []);

      // Combine purse with tenant
      const pursesWithTenant: PurseWithTenant[] = pursesData
        .map((purse) => ({
          ...purse,
          tenant: tenantsMap.get(purse.tenant_id)!,
        }))
        .filter((p) => p.tenant);

      setPurses(pursesWithTenant);
    } catch (err) {
      console.error("Error fetching client purses:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, customerIds.join(",")]);

  useEffect(() => {
    fetchPurses();
  }, [fetchPurses]);

  // Fetch transactions for a specific customer
  const fetchTransactions = async (customerId: string): Promise<Transaction[]> => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Error fetching transactions:", err);
      return [];
    }
  };

  // Total balance across all salons
  const totalBalance = purses.reduce((sum, p) => sum + Number(p.balance), 0);

  return {
    purses,
    totalBalance,
    isLoading,
    error,
    refetch: fetchPurses,
    fetchTransactions,
  };
}
