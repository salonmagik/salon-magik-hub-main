import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface AvailablePackageCredit {
  entitlementId: string;
  entitlementItemId: string;
  serviceId: string;
  packageName: string;
  remaining: number; // remaining_quantity - reserved_quantity
}

interface RawEntitlementItem {
  id: string;
  service_id: string | null;
  remaining_quantity: number;
  reserved_quantity: number;
}

interface RawEntitlement {
  id: string;
  status: string;
  expires_at: string | null;
  package: { name: string } | null;
  items: RawEntitlementItem[];
}

// Active package credit for ONE customer, scoped by customerId -- used at
// booking time to surface "this customer has N of M sessions left" for a
// given service. Mirrors usePackagePurchases' query shape but scoped to a
// single customer instead of the whole tenant, and pre-filters/reduces to
// a service -> credit map for direct use in the booking dialogs.
export function useCustomerActivePackages(customerId?: string | null) {
  const { currentTenant } = useAuth();
  const [creditsByServiceId, setCreditsByServiceId] = useState<Map<string, AvailablePackageCredit>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!currentTenant?.id || !customerId) {
      setCreditsByServiceId(new Map());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("customer_package_entitlements" as never)
        .select(
          "id, status, expires_at, package:packages(name), items:customer_package_entitlement_items(id, service_id, remaining_quantity, reserved_quantity)",
        )
        .eq("tenant_id", currentTenant.id)
        .eq("customer_id", customerId)
        .eq("status", "active")
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

      if (fetchError) throw fetchError;

      const entitlements = (data || []) as unknown as RawEntitlement[];
      const map = new Map<string, AvailablePackageCredit>();
      // Pick the candidate whose entitlement expires soonest for a given
      // service, same tie-break the RPC itself uses (expires_at asc nulls last).
      const chosenExpiry = new Map<string, string | null>();

      for (const entitlement of entitlements) {
        for (const item of entitlement.items || []) {
          if (!item.service_id) continue; // products out of scope here
          const remaining = item.remaining_quantity - item.reserved_quantity;
          if (remaining <= 0) continue;

          const existing = map.get(item.service_id);
          if (existing) {
            const existingExpiry = chosenExpiry.get(item.service_id) ?? null;
            const candidateExpiry = entitlement.expires_at ?? null;
            const existingRank = existingExpiry === null ? Infinity : new Date(existingExpiry).getTime();
            const candidateRank = candidateExpiry === null ? Infinity : new Date(candidateExpiry).getTime();
            if (candidateRank >= existingRank) continue;
          }

          map.set(item.service_id, {
            entitlementId: entitlement.id,
            entitlementItemId: item.id,
            serviceId: item.service_id,
            packageName: entitlement.package?.name || "Package",
            remaining,
          });
          chosenExpiry.set(item.service_id, entitlement.expires_at ?? null);
        }
      }

      setCreditsByServiceId(map);
    } catch (err) {
      console.error("Error fetching customer active packages:", err);
      setError(err as Error);
      setCreditsByServiceId(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, customerId]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return { creditsByServiceId, isLoading, error, refetch: fetchCredits };
}
