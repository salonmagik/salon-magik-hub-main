import { getCurrencyForCountryCode } from "@shared/country-currency";
import type { ManageableLocationOption } from "@/hooks/useManageableLocations";

export function getLocationCurrency(
  location: ManageableLocationOption | undefined,
  fallbackCurrency: string,
): string {
  if (!location) return fallbackCurrency;
  return getCurrencyForCountryCode(location.country, fallbackCurrency);
}

export function getCurrenciesForLocations(
  locations: ManageableLocationOption[],
  selectedLocationIds: string[],
  fallbackCurrency: string,
): string[] {
  const currencySet = new Set<string>();
  selectedLocationIds.forEach((locationId) => {
    const location = locations.find((item) => item.id === locationId);
    currencySet.add(getLocationCurrency(location, fallbackCurrency));
  });
  return Array.from(currencySet);
}
