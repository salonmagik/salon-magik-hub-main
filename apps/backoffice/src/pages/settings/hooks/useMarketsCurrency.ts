import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "../utils";
import type { ActorUser, LegalStatus, MarketCountry, MarketCountryCurrency } from "../types";

/** Market activation (go-live/legal status/selectable) and country currency policy. */
export function useMarketsCurrency(backofficeUser: ActorUser | null | undefined) {
  const queryClient = useQueryClient();

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("GH");
  const [newCurrencyCode, setNewCurrencyCode] = useState("GHS");
  const [notesDraft, setNotesDraft] = useState("");

  const { data: marketCountries = [], isLoading: marketsLoading } = useQuery({
    queryKey: ["market-countries-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_countries")
        .select("*")
        .order("country_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MarketCountry[];
    },
  });

  const { data: marketCurrencies = [], isLoading: currenciesLoading } = useQuery({
    queryKey: ["market-country-currencies-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_country_currency")
        .select("*")
        .order("country_code", { ascending: true })
        .order("currency_code", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MarketCountryCurrency[];
    },
  });

  const selectedCountry = useMemo(
    () => marketCountries.find((country) => country.country_code === selectedCountryCode) || null,
    [marketCountries, selectedCountryCode]
  );

  const selectedCountryCurrencies = useMemo(
    () => marketCurrencies.filter((currency) => currency.country_code === selectedCountryCode),
    [marketCurrencies, selectedCountryCode]
  );

  const selectableCountries = useMemo(
    () => marketCountries.filter((country) => country.is_selectable).length,
    [marketCountries]
  );

  const updateCountryMutation = useMutation({
    mutationFn: async ({
      countryCode,
      isSelectable,
      legalStatus,
      notes,
    }: {
      countryCode: string;
      isSelectable: boolean;
      legalStatus: LegalStatus;
      notes: string;
    }) => {
      const goLiveAt = legalStatus === "active" && selectedCountry?.go_live_at == null ? new Date().toISOString() : selectedCountry?.go_live_at;
      const { error } = await supabase
        .from("market_countries")
        .update({
          is_selectable: isSelectable,
          legal_status: legalStatus,
          go_live_at: goLiveAt,
          notes: notes.trim() || null,
        })
        .eq("country_code", countryCode);
      if (error) throw error;

      await writeAuditLog("market_country_updated", backofficeUser?.user_id, {
        country_code: countryCode,
        is_selectable: isSelectable,
        legal_status: legalStatus,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-countries-admin"] });
      toast.success("Market updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update market"),
  });

  const upsertCurrencyMutation = useMutation({
    mutationFn: async ({ countryCode, currencyCode }: { countryCode: string; currencyCode: string }) => {
      const normalizedCode = currencyCode.trim().toUpperCase();
      if (!normalizedCode) throw new Error("Currency code is required");

      const { error } = await supabase
        .from("market_country_currency")
        .upsert(
          {
            country_code: countryCode,
            currency_code: normalizedCode,
            is_enabled: true,
            is_default: false,
          },
          { onConflict: "country_code,currency_code" }
        );

      if (error) throw error;

      await writeAuditLog("market_currency_upserted", backofficeUser?.user_id, {
        country_code: countryCode,
        currency_code: normalizedCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Currency added");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to add currency"),
  });

  const setDefaultCurrencyMutation = useMutation({
    mutationFn: async ({ countryCode, currencyCode }: { countryCode: string; currencyCode: string }) => {
      const { error: resetError } = await supabase
        .from("market_country_currency")
        .update({ is_default: false })
        .eq("country_code", countryCode);
      if (resetError) throw resetError;

      const { error: setError } = await supabase
        .from("market_country_currency")
        .update({ is_default: true, is_enabled: true })
        .eq("country_code", countryCode)
        .eq("currency_code", currencyCode);

      if (setError) throw setError;

      await writeAuditLog("market_default_currency_updated", backofficeUser?.user_id, {
        country_code: countryCode,
        currency_code: currencyCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Default currency updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to set default currency"),
  });

  const toggleCurrencyMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { data, error } = await supabase
        .from("market_country_currency")
        .update({ is_enabled: isEnabled })
        .eq("id", id)
        .select("country_code,currency_code")
        .single();

      if (error) throw error;

      await writeAuditLog("market_currency_toggled", backofficeUser?.user_id, {
        country_code: data.country_code,
        currency_code: data.currency_code,
        is_enabled: isEnabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Currency updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update currency"),
  });

  const updateSelectedCountryLegalStatus = (legalStatus: LegalStatus) => {
    if (!selectedCountry) return;
    queryClient.setQueryData(["market-countries-admin"], (current: MarketCountry[] | undefined) => {
      if (!current) return current;
      return current.map((row) =>
        row.country_code === selectedCountry.country_code ? { ...row, legal_status: legalStatus } : row
      );
    });
  };

  const updateSelectedCountrySelectable = (checked: boolean) => {
    if (!selectedCountry) return;
    queryClient.setQueryData(["market-countries-admin"], (current: MarketCountry[] | undefined) => {
      if (!current) return current;
      return current.map((row) =>
        row.country_code === selectedCountry.country_code ? { ...row, is_selectable: checked } : row
      );
    });
  };

  const saveMarketDetails = (isSuperAdmin: boolean) => {
    if (!selectedCountry) return;
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can update markets");
      return;
    }
    updateCountryMutation.mutate({
      countryCode: selectedCountry.country_code,
      isSelectable: selectedCountry.is_selectable,
      legalStatus: selectedCountry.legal_status,
      notes: notesDraft,
    });
  };

  return {
    selectedCountryCode,
    setSelectedCountryCode,
    newCurrencyCode,
    setNewCurrencyCode,
    notesDraft,
    setNotesDraft,

    marketCountries,
    marketsLoading,
    marketCurrencies,
    currenciesLoading,

    selectedCountry,
    selectedCountryCurrencies,
    selectableCountries,

    updateCountryMutation,
    upsertCurrencyMutation,
    setDefaultCurrencyMutation,
    toggleCurrencyMutation,
    saveMarketDetails,
    updateSelectedCountryLegalStatus,
    updateSelectedCountrySelectable,
  };
}
