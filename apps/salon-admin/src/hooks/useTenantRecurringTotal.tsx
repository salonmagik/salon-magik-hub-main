import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface TenantRecurringTotalBreakdown {
  billing_cycle: "monthly" | "annual";
  base_price: number;
  addon_total: number;
  addon_breakdown: {
    extra_seats: number;
    seat_unit_price: number;
    seat_addon_total: number;
    location_addon_total: number;
    staff_operations_enabled: boolean;
    staff_operations_locations: number;
    staff_operations_unit_price: number;
    staff_operations_total: number;
  };
  discount: number;
  pre_discount_total: number;
}

export interface TenantRecurringTotal {
  total_amount: number;
  currency: string;
  breakdown: TenantRecurringTotalBreakdown;
}

/** What compute_tenant_recurring_total() would actually charge this tenant next cycle. */
export function useTenantRecurringTotal() {
  const { currentTenant } = useAuth();
  return useQuery({
    queryKey: ["tenant-recurring-total", currentTenant?.id],
    queryFn: async (): Promise<TenantRecurringTotal | null> => {
      if (!currentTenant?.id) return null;
      const { data, error } = await (supabase.rpc as any)("compute_tenant_recurring_total", {
        p_tenant_id: currentTenant.id,
      });
      if (error) throw error;
      return (data?.[0] as TenantRecurringTotal) || null;
    },
    enabled: Boolean(currentTenant?.id),
  });
}
