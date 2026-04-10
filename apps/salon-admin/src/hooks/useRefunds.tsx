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
    amount: number;
    method: string;
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
      // Fetch the refund request details
      const { data: refundRequest, error: fetchError } = await supabase
        .from("refund_requests")
        .select("*, transaction:transactions(id, appointment_id, amount)")
        .eq("id", refundId)
        .eq("tenant_id", currentTenant.id)
        .single();

      if (fetchError || !refundRequest) {
        throw new Error("Refund request not found");
      }

      // Validate refund hasn't already been approved/completed
      if (refundRequest.status === "completed" || refundRequest.status === "approved") {
        throw new Error("This refund has already been processed");
      }

      // Check if there are other approved/completed refunds for the same transaction
      const { data: otherRefunds, error: otherRefundsError } = await supabase
        .from("refund_requests")
        .select("amount, status")
        .eq("transaction_id", refundRequest.transaction_id)
        .eq("tenant_id", currentTenant.id)
        .in("status", ["completed", "approved"])
        .neq("id", refundId);

      if (otherRefundsError) {
        console.error("Error checking other refunds:", otherRefundsError);
      }

      // Calculate total refunded amount
      const totalOtherRefunds = otherRefunds?.reduce(
        (sum, r) => sum + Number(r.amount),
        0
      ) || 0;

      const originalAmount = Number(refundRequest.transaction?.amount || 0);
      const requestedAmount = Number(refundRequest.amount);
      const maxRefundable = originalAmount - totalOtherRefunds;

      if (requestedAmount > maxRefundable) {
        throw new Error(
          `Cannot approve refund. Maximum refundable amount is ${maxRefundable.toFixed(2)} (original: ${originalAmount.toFixed(2)}, already refunded: ${totalOtherRefunds.toFixed(2)})`
        );
      }

      // If refund_type is "store_credit", process wallet transactions
      if (refundRequest.refund_type === "store_credit") {
        // Get tenant currency
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .select("currency")
          .eq("id", currentTenant.id)
          .single();

        if (tenantError || !tenant?.currency) {
          throw new Error("Tenant currency not found");
        }

        // Step 1: Debit salon wallet
        const salonDebitIdempotencyKey = `refund_approval_salon_debit_${refundId}`;
        const { data: salonDebitEntryId, error: salonDebitError } = await supabase.rpc(
          "debit_salon_purse" as never,
          {
            p_tenant_id: currentTenant.id,
            p_entry_type: "salon_purse_debit_refund",
            p_reference_type: "refund_request",
            p_reference_id: refundId,
            p_amount: refundRequest.amount,
            p_currency: tenant.currency,
            p_idempotency_key: salonDebitIdempotencyKey,
          } as never
        );

        if (salonDebitError) {
          console.error("Error debiting salon wallet:", salonDebitError);
          throw new Error(salonDebitError.message || "Failed to debit salon wallet");
        }

        // Step 2: Credit customer purse
        const customerCreditIdempotencyKey = `refund_approval_customer_credit_${refundId}`;
        const { data: customerCreditEntryId, error: customerCreditError } = await supabase.rpc(
          "credit_customer_purse" as never,
          {
            p_tenant_id: currentTenant.id,
            p_customer_id: refundRequest.customer_id,
            p_amount: refundRequest.amount,
            p_currency: tenant.currency,
            p_idempotency_key: customerCreditIdempotencyKey,
            p_gateway_reference: refundRequest.transaction_id,
          } as never
        );

        if (customerCreditError) {
          console.error("Error crediting customer purse:", customerCreditError);
          throw new Error(customerCreditError.message || "Failed to credit customer purse");
        }

        // Step 3: Create refund transaction record
        const { error: transactionError } = await supabase.from("transactions").insert({
          tenant_id: currentTenant.id,
          customer_id: refundRequest.customer_id,
          appointment_id: refundRequest.transaction?.appointment_id || null,
          amount: refundRequest.amount,
          type: "refund",
          method: "purse",
          currency: tenant.currency,
          status: "completed",
          provider: "customer_purse",
          provider_reference: typeof salonDebitEntryId === "string" ? salonDebitEntryId : null,
          created_by_id: user.id,
        });

        if (transactionError) {
          console.error("Error creating refund transaction:", transactionError);
          throw new Error("Failed to create refund transaction");
        }

        // Step 4: Update refund request status to "completed"
        const { error: updateError } = await supabase
          .from("refund_requests")
          .update({
            status: "completed",
            approved_by_id: user.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .eq("tenant_id", currentTenant.id);

        if (updateError) throw updateError;

        toast({
          title: "Refund completed",
          description: "The refund has been processed and credited to customer's purse",
        });
      } else {
        // For non-store-credit refunds, just approve (manual process)
        const { error: updateError } = await supabase
          .from("refund_requests")
          .update({
            status: "approved",
            approved_by_id: user.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .eq("tenant_id", currentTenant.id);

        if (updateError) throw updateError;

        toast({
          title: "Refund approved",
          description: "The refund has been approved. Please process manually via payment gateway.",
        });
      }

      // Log audit
      await supabase.rpc("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "update",
        _entity_type: "refund_request",
        _entity_id: refundId,
        _after_json: {
          status: refundRequest.refund_type === "store_credit" ? "completed" : "approved",
          approved_by_id: user.id,
        },
      });

      fetchRefunds();
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
