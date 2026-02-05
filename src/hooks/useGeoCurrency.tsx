import { useState, useEffect } from "react";

export type SupportedCurrency = "USD" | "NGN" | "GHS";

interface GeoCurrencyState {
  currency: SupportedCurrency;
  country: string | null;
  isLoading: boolean;
  error: string | null;
}

const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  NG: "NGN",
  GH: "GHS",
};

const DEFAULT_CURRENCY: SupportedCurrency = "USD";

export function useGeoCurrency() {
  const [state, setState] = useState<GeoCurrencyState>({
    currency: DEFAULT_CURRENCY,
    country: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function detectCurrency() {
      try {
        // Use a free IP geolocation API
        const response = await fetch("https://ipapi.co/json/", {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Failed to detect location");
        }

        const data = await response.json();
        const countryCode = data.country_code || data.country;

        if (countryCode) {
          const detectedCurrency = COUNTRY_TO_CURRENCY[countryCode] || DEFAULT_CURRENCY;
          setState({
            currency: detectedCurrency,
            country: countryCode,
            isLoading: false,
            error: null,
          });
        } else {
          setState({
            currency: DEFAULT_CURRENCY,
            country: null,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error("Geo currency detection failed:", error);
        setState({
          currency: DEFAULT_CURRENCY,
          country: null,
          isLoading: false,
          error: error instanceof Error ? error.message : "Detection failed",
        });
      }
    }

    detectCurrency();
  }, []);

  return state;
}

// Helper to get currency symbol
export function getCurrencySymbol(currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    USD: "$",
    NGN: "₦",
    GHS: "₵",
  };
  return symbols[currency];
}

// Helper to format currency
export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbol = getCurrencySymbol(currency);
  
  if (currency === "NGN" || currency === "GHS") {
    return `${symbol}${amount.toLocaleString()}`;
  }
  
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
