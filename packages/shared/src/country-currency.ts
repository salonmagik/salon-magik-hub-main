export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  GH: "GHS",
  NG: "NGN",
  GB: "GBP",
  US: "USD",
  KE: "KES",
  ZA: "ZAR",
};

export function normalizeCountryCode(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

export function getCurrencyForCountryCode(
  countryCode: string | null | undefined,
  fallbackCurrency = "USD",
): string {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (!normalizedCountryCode) return fallbackCurrency;
  return COUNTRY_CURRENCY_MAP[normalizedCountryCode] || fallbackCurrency;
}
