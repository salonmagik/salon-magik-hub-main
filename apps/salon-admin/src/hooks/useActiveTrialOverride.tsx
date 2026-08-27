import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Backoffice's "Tenant Gifted Trials" panel writes to tenant_trial_overrides.
 * is_tenant_operational() honors an active override on the backend (see the
 * 2026-08-03 migration), but every trial-countdown surface in salon-admin —
 * the sidebar badge, banners, blocking modal, Settings tab — used to read
 * tenants.trial_ends_at directly, so a gifted override had zero visible
 * effect for the tenant. Callers should prefer this override's ends_at over
 * the tenant's own trial_ends_at whenever one is active.
 */
export function useActiveTrialOverride(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-trial-override", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("tenant_trial_overrides")
        .select("ends_at")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .lte("starts_at", new Date().toISOString())
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { ends_at: string } | null;
    },
    enabled: Boolean(tenantId),
  });
}
