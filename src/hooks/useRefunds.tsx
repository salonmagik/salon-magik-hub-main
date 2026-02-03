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

  const approveRefund = async (refundId: string) => {
    if (!currentTenant?.id || !user?.id) return false;

    try {
      const { error } = await supabase
        .from("refund_requests")
        .update({
          status: "approved",
          approved_by_id: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", refundId)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      // Log audit
      await supabase.rpc("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "update",
        _entity_type: "refund_request",
        _entity_id: refundId,
        _after_json: { status: "approved", approved_by_id: user.id },
      });

      toast({ title: "Refund approved", description: "The refund has been approved" });
      fetchRefunds();
      return true;
    } catch (err) {
      console.error("Error approving refund:", err);
      toast({ title: "Error", description: "Failed to approve refund", variant: "destructive" });
      return false;
    }
  };

  const rejectRefund = async (refundId: string, rejectionReason: string) => {
    if (!currentTenant?.id || !user?.id) return false;

    try {
      const { error } = await supabase
        .from("refund_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason,
          approved_by_id: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", refundId)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      // Log audit
      await supabase.rpc("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "update",
        _entity_type: "refund_request",
        _entity_id: refundId,
        _after_json: { status: "rejected", rejection_reason: rejectionReason },
      });

      toast({ title: "Refund rejected", description: "The refund has been rejected" });
      fetchRefunds();
      return true;
    } catch (err) {
      console.error("Error rejecting refund:", err);
      toast({ title: "Error", description: "Failed to reject refund", variant: "destructive" });
      return false;
    }
  };

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
  };
}
