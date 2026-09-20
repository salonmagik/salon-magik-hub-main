import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { useLocations } from "./useLocations";
import { currencyForCountry } from "@/lib/countryCurrency";

/**
 * Returns the settlement currency for the currently viewed interface.
 *
 * A branch's country is authoritative for branch-scoped screens. The tenant
 * currency remains the fallback for the business hub and legacy single-wallet
 * records that are not tied to a branch.
 */
export function useActiveBranchCurrency(fallback = "USD") {
  const { currentTenant, activeContextType, activeLocationId } = useAuth();
  const { locations, defaultLocation } = useLocations();
  const activeLocation = useMemo(
    () => locations.find((location) => location.id === activeLocationId) || defaultLocation || null,
    [activeLocationId, defaultLocation, locations],
  );
  const tenantCurrency = currentTenant?.currency || fallback;
  const currency = activeContextType === "location"
    ? currencyForCountry(activeLocation?.country, tenantCurrency)
    : tenantCurrency;

  return { currency, activeLocation };
}
