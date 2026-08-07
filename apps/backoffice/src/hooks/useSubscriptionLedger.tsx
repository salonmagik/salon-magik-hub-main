import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface SubscriptionLedgerRow {
  tenant_id: string;
  tenant_name: string;
  country: string | null;
  plan: string | null;
  subscription_status: string | null;
  next_billing_at: string | null;
  currency: string;
  base_mrr: number;
  addon_mrr: number;
  addon_breakdown: {
    extra_seats?: number;
    seat_addon_total?: number;
    location_addon_total?: number;
    staff_operations_enabled?: boolean;
    staff_operations_total?: number;
  } | null;
  comms_balance: number | null;
  comms_last_purchase_at: string | null;
  comms_last_purchase_amount: number | null;
  comms_last_purchase_currency: string | null;
}

export function useSubscriptionLedger() {
  return useQuery({
    queryKey: ["backoffice-subscription-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backoffice_subscription_ledger" as never);
      if (error) throw error;
      return (data || []) as unknown as SubscriptionLedgerRow[];
    },
  });
}

export interface TenantBillingActivityRow {
  event_type: string;
  description: string;
  amount: number | null;
  currency: string | null;
  occurred_at: string;
}

export function useTenantBillingActivity(tenantId: string | null) {
  return useQuery({
    queryKey: ["backoffice-tenant-billing-activity", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tenant_billing_activity" as never, {
        p_tenant_id: tenantId,
      } as never);
      if (error) throw error;
      return (data || []) as unknown as TenantBillingActivityRow[];
    },
  });
}
