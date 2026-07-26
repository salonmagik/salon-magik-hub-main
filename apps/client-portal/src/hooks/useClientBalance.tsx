import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";

export interface ClientBalanceGrant {
  id: string;
  tenant_id: string;
  customer_id: string;
  currency: string;
  source_type: "paid_topup" | "refund" | "voucher" | "adjustment" | "legacy";
  original_amount: number;
  remaining_amount: number;
  reserved_amount: number;
  is_cashable: boolean;
  expires_at: string | null;
  status: string;
}

export interface ClientBalanceEntry {
  id: string;
  tenant_id: string;
  customer_id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export interface ClientPackageEntitlement {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  package: { id: string; name: string; description: string | null } | null;
  items: Array<{
    id: string;
    total_quantity: number;
    remaining_quantity: number;
    reserved_quantity: number;
    service: { id: string; name: string } | null;
    product: { id: string; name: string } | null;
  }>;
}

export function useClientBalance() {
  const { customers, isAuthenticated } = useClientAuth();
  const [grants, setGrants] = useState<ClientBalanceGrant[]>([]);
  const [entries, setEntries] = useState<ClientBalanceEntry[]>([]);
  const [packages, setPackages] = useState<ClientPackageEntitlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const customerIds = useMemo(
    () => customers.map((customer) => customer.id),
    [customers],
  );

  const refetch = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setGrants([]);
      setEntries([]);
      setPackages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const [grantsResult, entriesResult, packagesResult] = await Promise.all([
      supabase
        .from("customer_credit_grants" as never)
        .select("*")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_credit_ledger" as never)
        .select("*")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("customer_package_entitlements" as never)
        .select("*, package:packages(id, name, description), items:customer_package_entitlement_items(*, service:services(id, name), product:products(id, name))")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false }),
    ]);

    const firstError = grantsResult.error || entriesResult.error || packagesResult.error;
    if (firstError) {
      setError(new Error(firstError.message));
    } else {
      setGrants((grantsResult.data || []) as ClientBalanceGrant[]);
      setEntries((entriesResult.data || []) as ClientBalanceEntry[]);
      setPackages((packagesResult.data || []) as ClientPackageEntitlement[]);
    }
    setIsLoading(false);
  }, [isAuthenticated, customerIds]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { grants, entries, packages, isLoading, error, refetch };
}
