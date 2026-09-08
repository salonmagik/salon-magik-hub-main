import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface BlockedRefundRow {
  id: string;
  created_at: string;
  tenant_id: string;
  tenant_name: string;
  transaction_id: string | null;
  refund_request_id: string | null;
  attempted_amount: number;
  currency: string;
  wallet_balance_at_attempt: number;
  shortfall: number;
  refund_type: string;
  block_code: string;
  reason: string | null;
  attempted_by_id: string | null;
  attempted_by_email: string | null;
  total_count: number;
}

export interface BlockedRefundFilters {
  page: number;
  pageSize: number;
}

export function useBlockedRefunds(filters: BlockedRefundFilters) {
  return useQuery({
    queryKey: ["backoffice-blocked-refunds", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backoffice_blocked_refunds" as never, {
        p_limit: filters.pageSize,
        p_offset: filters.page * filters.pageSize,
      } as never);
      if (error) throw error;
      return (data || []) as unknown as BlockedRefundRow[];
    },
  });
}

// Lightweight — a single-row fetch used to drive the unresolved-count badge
// on the Transactions nav entry without duplicating the panel's own query.
export function useBlockedRefundsCount() {
  return useQuery({
    queryKey: ["backoffice-blocked-refunds-count"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backoffice_blocked_refunds" as never, {
        p_limit: 1,
        p_offset: 0,
      } as never);
      if (error) throw error;
      const rows = (data || []) as unknown as BlockedRefundRow[];
      return rows[0]?.total_count ?? 0;
    },
    staleTime: 60_000,
  });
}
