import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";
import type { Tables } from "@/lib/supabase";

export interface ClientVoucher extends Tables<"vouchers"> {
  tenantName: string | null;
  tenantCurrency: string;
}

// A voucher the customer can still spend: active status and nothing has been
// drawn down from it yet. Partially-used vouchers (balance < amount but
// still active) are intentionally excluded here, same as the design's
// "unused" count and dashboard preview.
export function isVoucherUnused(voucher: Tables<"vouchers">): boolean {
  return voucher.status === "active" && Number(voucher.balance) === Number(voucher.amount);
}

export function useClientVouchers() {
  const { customers, isAuthenticated } = useClientAuth();
  const [vouchers, setVouchers] = useState<ClientVoucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const customerIds = useMemo(() => customers.map((customer) => customer.id), [customers]);
  const tenantById = useMemo(() => {
    const map = new Map<string, { name: string | null; currency: string }>();
    for (const customer of customers) {
      if (customer.tenant) {
        map.set(customer.tenant_id, { name: customer.tenant.name, currency: customer.tenant.currency });
      }
    }
    return map;
  }, [customers]);

  const refetch = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setVouchers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const idList = customerIds.join(",");
      const { data, error: fetchError } = await supabase
        .from("vouchers")
        .select("*")
        .is("deleted_at", null)
        .or(`purchased_by_customer_id.in.(${idList}),redeemed_by_customer_id.in.(${idList})`)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const rows = (data || []) as Tables<"vouchers">[];
      setVouchers(
        rows.map((voucher) => {
          const tenant = tenantById.get(voucher.tenant_id);
          return {
            ...voucher,
            tenantName: tenant?.name ?? null,
            tenantCurrency: tenant?.currency || "GHS",
          };
        }),
      );
    } catch (err) {
      console.error("Error fetching client vouchers:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, customerIds.join(","), tenantById]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { vouchers, isLoading, error, refetch };
}
