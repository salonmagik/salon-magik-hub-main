import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type RefundRequest = Tables<"refund_requests">;

export interface RefundWithDetails extends RefundRequest {
  customer?: {
    id: string;
    full_name: string;
  } | null;
  transaction?: {
    id: string;
    amount: number;
    method: string;
  } | null;
}

export function useRefunds() {
  const { currentTenant } = useAuth();
  const [refunds, setRefunds] = useState<RefundWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRefunds = useCallback(async () => {
    if (!currentTenant?.id) {
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
          customer:customers(id, full_name),
          transaction:transactions(id, amount, method)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setRefunds((data as RefundWithDetails[]) || []);
    } catch (err) {
      console.error("Error fetching refunds:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

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
