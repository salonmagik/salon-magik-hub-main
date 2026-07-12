import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export function useDomainOrders() {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["domain_orders", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data, error } = await supabase
        .from("domain_orders")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant?.id,
  });
}
