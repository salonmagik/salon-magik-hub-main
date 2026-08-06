import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

// Lightweight existence checks (not full counts) for gating walkthroughs that
// can't be completed on a brand-new, empty account — e.g. "view customer
// details" needs a customer to click into, "message a segment" needs someone
// to message.
//
// `enabled` is caller-supplied (see useWalkthroughAutoTrigger, which passes
// `pageNeedsDataFlags(pageKey)`) so these 3 count queries only ever run on
// pages whose own walkthroughs actually declare a `requires` gate — most
// trigger pages don't, and shouldn't pay for this on every session's first
// page load. React Query caches the result per-tenant regardless (30s
// staleTime, no refetch-on-mount), so this only ever fires once per session.
export function useWalkthroughDataFlags(enabled: boolean) {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["walkthrough-data-flags", tenantId],
    enabled: enabled && Boolean(tenantId),
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
    isLoading: enabled ? isLoading : false,
  };
}
