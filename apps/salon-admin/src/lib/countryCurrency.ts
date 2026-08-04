// Locations carry `country` (ISO code) but not their own `currency` — this
// maps the countries the platform actually operates in to their currency so
// per-branch money can be grouped/formatted correctly for chain tenants that
// span more than one country. Falls back to the tenant's own currency for
// any country not in this map (keeps single-country tenants unaffected).
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  GH: "GHS",
  NG: "NGN",
};

export function currencyForCountry(country: string | null | undefined, fallback: string): string {
  if (!country) return fallback;
  return COUNTRY_TO_CURRENCY[country] || fallback;
}

export const COUNTRY_NAMES: Record<string, string> = {
  GH: "Ghana",
  NG: "Nigeria",
};

export function countryName(country: string): string {
  return COUNTRY_NAMES[country] || country;
}
