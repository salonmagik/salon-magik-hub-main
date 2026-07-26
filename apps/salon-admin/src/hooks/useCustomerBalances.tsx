import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface CustomerBalanceSummary {
  id: string;
  customer_id: string;
  tenant_id: string;
  balance: number;
  currency: string;
  updated_at: string;
  customer: { id: string; full_name: string; email: string | null; phone: string | null } | null;
  paidFunds: number;
  storeCredit: number;
  reserved: number;
}

export function useCustomerBalances() {
  const { currentTenant } = useAuth();
  const [balances, setBalances] = useState<CustomerBalanceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) {
      setBalances([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const [pursesResult, grantsResult] = await Promise.all([
      supabase
        .from("customer_purses")
        .select("*, customer:customers(id, full_name, email, phone)")
        .eq("tenant_id", currentTenant.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("customer_credit_grants" as never)
        .select("customer_id, source_type, remaining_amount, reserved_amount")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "active"),
    ]);
    const queryError = pursesResult.error || grantsResult.error;
    if (queryError) {
      setError(new Error(queryError.message));
    } else {
      const grants = (grantsResult.data || []) as Array<{
        customer_id: string;
        source_type: string;
        remaining_amount: number;
        reserved_amount: number;
      }>;
      setBalances((pursesResult.data || []).map((purse) => {
        const customerGrants = grants.filter((grant) => grant.customer_id === purse.customer_id);
        return {
          ...purse,
          paidFunds: customerGrants
            .filter((grant) => ["paid_topup", "legacy"].includes(grant.source_type))
            .reduce((sum, grant) => sum + Number(grant.remaining_amount), 0),
          storeCredit: customerGrants
            .filter((grant) => !["paid_topup", "legacy"].includes(grant.source_type))
            .reduce((sum, grant) => sum + Number(grant.remaining_amount), 0),
          reserved: customerGrants.reduce((sum, grant) => sum + Number(grant.reserved_amount), 0),
        } as CustomerBalanceSummary;
      }));
    }
    setIsLoading(false);
  }, [currentTenant?.id]);

  useEffect(() => { void refetch(); }, [refetch]);
  return { balances, isLoading, error, refetch };
}
