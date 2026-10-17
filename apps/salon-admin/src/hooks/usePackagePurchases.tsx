import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export type PackagePurchaseStatus = "active" | "exhausted" | "expired" | "cancelled" | "refunded";

export interface PackagePurchaseItem {
  id: string;
  total_quantity: number;
  remaining_quantity: number;
  reserved_quantity: number;
  service: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
}

export interface PackagePurchase {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: PackagePurchaseStatus;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  customer: { id: string; full_name: string } | null;
  package: { id: string; name: string; price: number } | null;
  items: PackagePurchaseItem[];
}

// Purchases of a package (not the package definitions themselves) --
// each row is one `issue_customer_package` grant, with its redeemable
// items so the salon can see redemption progress per customer. Mirrors
// the client-portal's useClientBalance query (same table/embed shape)
// but scoped to the whole tenant instead of one customer.
export function usePackagePurchases() {
  const { currentTenant } = useAuth();
  const [purchases, setPurchases] = useState<PackagePurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPurchases = useCallback(async () => {
    if (!currentTenant?.id) {
      setPurchases([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("customer_package_entitlements" as never)
        .select(
          "*, customer:customers(id, full_name), package:packages(id, name, price), items:customer_package_entitlement_items(*, service:services(id, name), product:products(id, name))",
        )
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setPurchases((data || []) as unknown as PackagePurchase[]);
    } catch (err) {
      console.error("Error fetching package purchases:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  return { purchases, isLoading, error, refetch: fetchPurchases };
}
