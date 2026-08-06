import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

// Lightweight existence checks (not full counts) for gating walkthroughs that
// can't be completed on a brand-new, empty account — e.g. "view customer
// details" needs a customer to click into, "message a segment" needs someone
// to message. Head-only count queries, cheap enough to run on every page that
// might trigger a gated walkthrough.
export function useWalkthroughDataFlags() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["walkthrough-data-flags", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [customersResult, servicesResult, productsResult] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ]);
      return {
        hasCustomers: (customersResult.count ?? 0) > 0,
        hasCatalog: (servicesResult.count ?? 0) > 0 || (productsResult.count ?? 0) > 0,
      };
    },
  });

  return {
    hasCustomers: data?.hasCustomers ?? false,
    hasCatalog: data?.hasCatalog ?? false,
    isLoading,
  };
}
