import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface BackofficeTransactionRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  customer_id: string | null;
  customer_name: string | null;
  type: string;
  method: string;
  amount: number;
  currency: string;
  provider: string | null;
  provider_reference: string | null;
  status: string;
  created_at: string;
  appointment_id: string | null;
  service_name: string | null;
  service_count: number;
  total_count: number;
}

export interface TransactionFilters {
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
  tenantId?: string;
  currency?: string;
  method?: string;
  type?: string;
  status?: string;
  search?: string;
}

export function useBackofficeTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ["backoffice-transactions", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backoffice_transactions" as never, {
        p_from: filters.from.toISOString(),
        p_to: filters.to.toISOString(),
        p_limit: filters.pageSize,
        p_offset: filters.page * filters.pageSize,
        p_tenant_id: filters.tenantId || null,
        p_currency: filters.currency || null,
        p_method: filters.method || null,
        p_type: filters.type || null,
        p_status: filters.status || null,
        p_search: filters.search || null,
      } as never);
      if (error) throw error;
      return (data || []) as unknown as BackofficeTransactionRow[];
    },
  });
}

export interface CurrencySummaryRow {
  currency: string;
  volume: number;
  tx_count: number;
}

export interface TypeCountRow {
  type: string;
  tx_count: number;
}

export function useBackofficeTransactionSummary(from: Date, to: Date) {
  return useQuery({
    queryKey: ["backoffice-transaction-summary", from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const [byCurrency, totals, typeCounts] = await Promise.all([
        supabase.rpc("get_backoffice_transaction_summary_by_currency" as never, {
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        } as never),
        supabase.rpc("get_backoffice_transaction_totals" as never, {
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        } as never),
        supabase.rpc("get_backoffice_transaction_type_counts" as never, {
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        } as never),
      ]);
      if (byCurrency.error) throw byCurrency.error;
      if (totals.error) throw totals.error;
      if (typeCounts.error) throw typeCounts.error;
      return {
        byCurrency: (byCurrency.data || []) as unknown as CurrencySummaryRow[],
        totals: ((totals.data as unknown as { total_count: number; failed_count: number; refund_count: number }[])?.[0]) || {
          total_count: 0,
          failed_count: 0,
          refund_count: 0,
        },
        typeCounts: (typeCounts.data || []) as unknown as TypeCountRow[],
      };
    },
  });
}
