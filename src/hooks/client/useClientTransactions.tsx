import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "./useClientAuth";
import type { Tables } from "@/integrations/supabase/types";

type Transaction = Tables<"transactions">;
type Tenant = Tables<"tenants">;

export interface ClientTransactionWithTenant extends Transaction {
  tenant?: Tenant | null;
}

export function useClientTransactions() {
  const { customers, isAuthenticated } = useClientAuth();
  const [transactions, setTransactions] = useState<ClientTransactionWithTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const customerIds = customers.map((c) => c.id);

  const fetchTransactions = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("transactions")
        .select(`
          *,
          tenant:tenants(*)
        `)
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      setTransactions((data as ClientTransactionWithTenant[]) || []);
    } catch (err) {
      console.error("Error fetching client transactions:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, customerIds.join(",")]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    isLoading,
    error,
    refetch: fetchTransactions,
  };
}
