const currencySymbols: Record<string, string> = {
  NGN: "₦",
  GHS: "₵",
  USD: "$",
  EUR: "€",
  GBP: "£",
  ZAR: "R",
  KES: "KSh",
  XOF: "CFA",
  XAF: "CFA",
  ZMW: "ZK",
  BWP: "P",
  MZN: "MT",
  TZS: "TSh",
  UGX: "USh",
  RWF: "RF",
};

/**
 * Format a currency amount with the appropriate symbol
 * @param amount - The numeric amount to format
 * @param currencyCode - ISO currency code (e.g., "USD", "GHS", "NGN")
 * @returns Formatted string like "$150.00" or "₵150.00"
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const symbol = currencySymbols[currencyCode] || currencyCode + " ";
  return `${symbol}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Get just the currency symbol for a given currency code
 * @param currencyCode - ISO currency code
 * @returns The symbol (e.g., "$", "₵", "₦")
 */
export function getCurrencySymbol(currencyCode: string): string {
  return currencySymbols[currencyCode] || currencyCode;
}
