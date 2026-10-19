import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface AvailablePackageCredit {
  entitlementId: string;
  entitlementItemId: string;
  serviceId: string;
  packageName: string;
  remaining: number; // remaining_quantity - reserved_quantity
}

interface RawCreditRow {
  entitlement_id: string;
  entitlement_item_id: string;
  service_id: string;
  package_name: string;
  remaining: number;
  expires_at: string | null;
}

// Public-booking's own version of salon-admin's useCustomerActivePackages --
// same reduction logic (pick the soonest-expiring entitlement per service,
// matching reserve_customer_package_credit's own tie-break), but sourced
// from list_customer_available_package_credits, the narrow anon-safe RPC
// added for this (see 20261019100000_public_booking_package_credit_lookup.sql,
// reshaped in 20261019110000_package_credit_lookup_by_identity.sql).
//
// Deliberately keyed by email/phone, not customer_id: public-booking
// resolves a returning customer anonymously, well before (if ever) they
// sign in, so the entitlement tables' RLS (staff or a signed-in customer
// only) can't be used directly. Keying this RPC by a raw customer_id would
// make that id a bearer credential for reading someone's package balance --
// email/phone is the same proof-of-identity already required to resolve
// the customer for prefill in the first place (mirrors
// lookup_booking_customer_match's own pattern), not a weaker one.
export function useCustomerPackageCredits(tenantId?: string | null, email?: string | null, phone?: string | null) {
  const [creditsByServiceId, setCreditsByServiceId] = useState<Map<string, AvailablePackageCredit>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const fetchCredits = useCallback(async () => {
    if (!tenantId || (!email && !phone)) {
      setCreditsByServiceId(new Map());
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "list_customer_available_package_credits" as never,
        { p_tenant_id: tenantId, p_email: email || null, p_phone: phone || null } as never,
      );

      if (error) throw error;

      const rows = (data || []) as unknown as RawCreditRow[];
      const map = new Map<string, AvailablePackageCredit>();
      const chosenExpiry = new Map<string, string | null>();

      for (const row of rows) {
        if (!row.service_id || row.remaining <= 0) continue;

        const existing = map.get(row.service_id);
        if (existing) {
          const existingExpiry = chosenExpiry.get(row.service_id) ?? null;
          const candidateExpiry = row.expires_at ?? null;
          const existingRank = existingExpiry === null ? Infinity : new Date(existingExpiry).getTime();
          const candidateRank = candidateExpiry === null ? Infinity : new Date(candidateExpiry).getTime();
          if (candidateRank >= existingRank) continue;
        }

        map.set(row.service_id, {
          entitlementId: row.entitlement_id,
          entitlementItemId: row.entitlement_item_id,
          serviceId: row.service_id,
          packageName: row.package_name || "Package",
          remaining: row.remaining,
        });
        chosenExpiry.set(row.service_id, row.expires_at ?? null);
      }

      setCreditsByServiceId(map);
    } catch (err) {
      console.error("Error fetching customer package credits:", err);
      setCreditsByServiceId(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, email, phone]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return { creditsByServiceId, isLoading, refetch: fetchCredits };
}
