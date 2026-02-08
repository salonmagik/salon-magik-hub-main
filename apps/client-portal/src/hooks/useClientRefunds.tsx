import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";
import type { Tables } from "@/lib/supabase";

type RefundRequest = Tables<"refund_requests">;
type Tenant = Tables<"tenants">;

export interface ClientRefundWithDetails extends RefundRequest {
  tenant?: Tenant | null;
}

export function useClientRefunds() {
  const { customers, isAuthenticated } = useClientAuth();
  const [refunds, setRefunds] = useState<ClientRefundWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const customerIds = customers.map((c) => c.id);

  const fetchRefunds = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setRefunds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("refund_requests")
        .select(`
          *,
          tenant:tenants(*)
        `)
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setRefunds((data as ClientRefundWithDetails[]) || []);
    } catch (err) {
      console.error("Error fetching client refunds:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, customerIds.join(",")]);

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  const pendingRefunds = refunds.filter((r) => r.status === "pending");
  const approvedRefunds = refunds.filter((r) => r.status === "approved" || r.status === "completed");
  const rejectedRefunds = refunds.filter((r) => r.status === "rejected");

  return {
    refunds,
    pendingRefunds,
    approvedRefunds,
    rejectedRefunds,
    isLoading,
    error,
    refetch: fetchRefunds,
  };
}
