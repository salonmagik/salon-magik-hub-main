import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface TenantRuntimeEntitlements {
  tenant_id: string;
  plan_slug: string;
  used_locations: number;
  allowed_locations: number;
  used_staff: number;
  base_staff_limit: number;
  extra_staff_seats: number;
  allowed_staff: number;
  has_ecommerce_theme: boolean;
  ecommerce_theme_expires_at: string | null;
}

export function useTenantEntitlements(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["tenant-runtime-entitlements", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TenantRuntimeEntitlements | null> => {
      if (!tenantId) return null;

      const { data, error } = await (supabase.rpc as any)("get_tenant_runtime_entitlements", {
        p_tenant_id: tenantId,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;

      return {
        tenant_id: row.tenant_id,
        plan_slug: String(row.plan_slug || ""),
        used_locations: Number(row.used_locations || 0),
        allowed_locations: Number(row.allowed_locations || 0),
        used_staff: Number(row.used_staff || 0),
        base_staff_limit: Number(row.base_staff_limit || 0),
        extra_staff_seats: Number(row.extra_staff_seats || 0),
        allowed_staff: Number(row.allowed_staff || 0),
        has_ecommerce_theme: Boolean(row.has_ecommerce_theme),
        ecommerce_theme_expires_at: row.ecommerce_theme_expires_at || null,
      };
    },
    staleTime: 1000 * 30,
  });
}
