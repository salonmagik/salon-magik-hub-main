import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { COUNTRIES, getCountryByCode } from "@shared/countries";

export interface PublicBookingCountryContext {
  detectedCountryCode: string | null;
  selectedCountryCode: string | null;
  supportedCountryCodes: string[];
  requiresCountrySelection: boolean;
  countryContextEnabled: boolean;
}

interface UseBookingCountryContextArgs {
  tenantSlug: string | undefined;
  enabled?: boolean;
}

interface ResolveCountryContextResponse {
  detected_country_code: string | null;
  selected_country_code: string | null;
  supported_country_codes: string[];
  requires_country_selection: boolean;
  country_context_enabled?: boolean;
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 2 && getCountryByCode(normalized)) return normalized;

  const normalizedName = normalized.replace(/[^A-Z]/g, "");
  if (!normalizedName) return null;
  const byName = COUNTRIES.find(
    (country) => country.name.toUpperCase().replace(/[^A-Z]/g, "") === normalizedName,
  );
  return byName?.code ?? null;
}

function getStorageKey(tenantSlug: string | undefined): string | null {
  if (!tenantSlug) return null;
  return `booking_country:${tenantSlug}`;
}

function readCountryPreference(tenantSlug: string | undefined): string | null {
  if (typeof window === "undefined") return null;

  const storageKey = getStorageKey(tenantSlug);
  if (!storageKey) return null;

  const localCountry = normalizeCountryCode(window.localStorage.getItem(storageKey));
  if (localCountry) return localCountry;

  const sessionCountry = normalizeCountryCode(window.sessionStorage.getItem(storageKey));
  if (sessionCountry) return sessionCountry;

  return null;
}

function persistCountryPreference(tenantSlug: string | undefined, countryCode: string | null): void {
  if (typeof window === "undefined") return;

  const storageKey = getStorageKey(tenantSlug);
  if (!storageKey) return;

  if (!countryCode) {
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, countryCode);
  window.sessionStorage.setItem(storageKey, countryCode);
}

export function useBookingCountryContext({
  tenantSlug,
  enabled = true,
}: UseBookingCountryContextArgs) {
  const queryClient = useQueryClient();
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(() =>
    readCountryPreference(tenantSlug),
  );

  useEffect(() => {
    setSelectedCountryCode(readCountryPreference(tenantSlug));
  }, [tenantSlug]);

  const countryQuery = useQuery({
    queryKey: ["booking-country-context", tenantSlug],
    enabled: Boolean(enabled && tenantSlug),
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<ResolveCountryContextResponse> => {
      if (!tenantSlug) {
        return {
          detected_country_code: null,
          selected_country_code: null,
          supported_country_codes: [],
          requires_country_selection: false,
          country_context_enabled: false,
        };
      }

      const preference = readCountryPreference(tenantSlug);
      const { data, error } = await supabase.functions.invoke("resolve-booking-country-context", {
        body: {
          tenantSlug,
          clientPreferenceCountry: preference,
        },
      });

      if (error) {
        throw error;
      }

      return data as ResolveCountryContextResponse;
    },
  });

  useEffect(() => {
    const resolvedSelection = normalizeCountryCode(countryQuery.data?.selected_country_code);
    if (!resolvedSelection) return;
    setSelectedCountryCode(resolvedSelection);
    persistCountryPreference(tenantSlug, resolvedSelection);
  }, [countryQuery.data?.selected_country_code, tenantSlug]);

  const supportedCountryCodes = useMemo(
    () =>
      (countryQuery.data?.supported_country_codes ?? [])
        .map((code) => normalizeCountryCode(code))
        .filter((code): code is string => Boolean(code)),
    [countryQuery.data?.supported_country_codes],
  );

  const effectiveSelectedCountryCode = useMemo(() => {
    const normalized = normalizeCountryCode(selectedCountryCode);
    if (!normalized) return null;
    return supportedCountryCodes.includes(normalized) ? normalized : null;
  }, [selectedCountryCode, supportedCountryCodes]);

  const setCountry = useCallback(
    (countryCode: string) => {
      if (!(countryQuery.data?.country_context_enabled ?? false)) {
        return;
      }

      const normalized = normalizeCountryCode(countryCode);
      if (!normalized || !supportedCountryCodes.includes(normalized)) {
        return;
      }

      setSelectedCountryCode(normalized);
      persistCountryPreference(tenantSlug, normalized);

      queryClient.setQueryData<ResolveCountryContextResponse | undefined>(
        ["booking-country-context", tenantSlug],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            selected_country_code: normalized,
            requires_country_selection: false,
          };
        },
      );
    },
    [countryQuery.data?.country_context_enabled, queryClient, supportedCountryCodes, tenantSlug],
  );

  const context: PublicBookingCountryContext = {
    detectedCountryCode: normalizeCountryCode(countryQuery.data?.detected_country_code),
    selectedCountryCode: effectiveSelectedCountryCode,
    supportedCountryCodes,
    countryContextEnabled: countryQuery.data?.country_context_enabled ?? false,
    requiresCountrySelection:
      (countryQuery.data?.country_context_enabled ?? false) &&
      supportedCountryCodes.length > 0 &&
      (countryQuery.data?.requires_country_selection ?? false) &&
      !effectiveSelectedCountryCode,
  };

  return {
    ...context,
    setCountry,
    isLoading: countryQuery.isLoading,
    error: countryQuery.error,
    refetch: countryQuery.refetch,
  };
}
