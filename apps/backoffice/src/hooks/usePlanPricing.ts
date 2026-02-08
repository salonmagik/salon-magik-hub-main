import { getCurrencySymbol as sharedGetCurrencySymbol } from "@shared/currency";

export function getCurrencySymbol(currency: string) {
  return sharedGetCurrencySymbol(currency);
}
