import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface TenantSalesPromoSummary {
  redemption_id: string;
  promo_code_id: string;
  code: string;
  target_email: string;
  promo_status: string;
  campaign_name: string;
  campaign_ends_at: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  billing_targets: string[];
  max_uses: number;
  uses_consumed: number;
  remaining_uses: number;
  claimed_at: string | null;
  last_surface: string | null;
  last_used_at: string | null;
}

export function useTenantSalesPromo(surface?: "subscription" | "credits") {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["tenant-sales-promo", currentTenant?.id, surface || "all"],
    enabled: Boolean(currentTenant?.id),
    queryFn: async (): Promise<TenantSalesPromoSummary | null> => {
      if (!currentTenant?.id) return null;

      const { data, error } = await (supabase.rpc as any)("get_tenant_sales_promo_summary", {
        p_tenant_id: currentTenant.id,
        p_surface: surface || null,
      });

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        discount_value: Number(data.discount_value || 0),
        max_uses: Number(data.max_uses || 0),
        uses_consumed: Number(data.uses_consumed || 0),
        remaining_uses: Number(data.remaining_uses || 0),
        billing_targets: Array.isArray(data.billing_targets) ? data.billing_targets : [],
      } as TenantSalesPromoSummary;
    },
    staleTime: 30_000,
  });
}

export function useClaimTenantSalesPromo() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, surface }: { code: string; surface?: "subscription" | "credits" }) => {
      if (!currentTenant?.id) {
        throw new Error("No tenant selected");
      }

      const { data, error } = await (supabase.rpc as any)("claim_sales_promo_code", {
        p_code: code.trim().toUpperCase(),
        p_tenant_id: currentTenant.id,
        p_surface: surface || null,
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.message || "Failed to claim promo code");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-sales-promo"] });
    },
  });
}
