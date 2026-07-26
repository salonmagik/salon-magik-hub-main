import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type RefundRequest = Tables<"refund_requests">;

export interface RefundWithDetails extends RefundRequest {
  customer?: {
    id: string;
    full_name: string;
  } | null;
  transaction?: {
    id: string;
    tenant_id: string;
    customer_id: string | null;
    appointment_id: string | null;
    amount: number;
    method: string;
    currency: string;
    status: string;
    type: string;
  } | null;
  status: "pending" | "approved" | "rejected" | "completed";
}

export function useRefunds() {
  const { currentTenant, user } = useAuth();
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
          transaction:transactions(id, tenant_id, customer_id, appointment_id, amount, method, currency, status, type)
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

  const approveRefund = async (refundId: string) => {
    if (!currentTenant?.id || !user?.id) return false;

    try {
      const { data: refundRequest, error: fetchError } = await supabase
        .from("refund_requests")
        .select("*, transaction:transactions(id)")
        .eq("id", refundId)
        .eq("tenant_id", currentTenant.id)
        .single();

      if (fetchError || !refundRequest) {
        throw new Error("Refund request not found");
      }

      const { error } = await supabase.rpc("complete_transaction_refund" as never, {
        p_transaction_id: refundRequest.transaction_id,
        p_amount: refundRequest.amount,
        p_refund_type: refundRequest.refund_type,
        p_reason: refundRequest.reason,
        p_request_id: refundId,
      } as never);
      if (error) throw error;

      await fetchRefunds();
      return true;
    } catch (err) {
      console.error("Error approving refund:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to approve refund",
        variant: "destructive",
      });
      return false;
    }
  };

  const rejectRefund = async (refundId: string, rejectionReason: string) => {
    if (!currentTenant?.id || !user?.id) return false;

    try {
      const { error } = await supabase.rpc("reject_transaction_refund" as never, {
        p_request_id: refundId,
        p_reason: rejectionReason,
      } as never);
      if (error) throw error;

      toast({ title: "Refund rejected", description: "The refund has been rejected" });
      await fetchRefunds();
      return true;
    } catch (err) {
      console.error("Error rejecting refund:", err);
      toast({ title: "Error", description: "Failed to reject refund", variant: "destructive" });
      return false;
    }
  };

  const updateRefundStatusLocally = useCallback(
    (refundId: string, status: RefundWithDetails["status"]) => {
      setRefunds((current) =>
        current.map((refund) =>
          refund.id === refundId ? { ...refund, status } : refund,
        ),
      );
    },
    [],
  );

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
    approveRefund,
    rejectRefund,
    updateRefundStatusLocally,
  };
}
