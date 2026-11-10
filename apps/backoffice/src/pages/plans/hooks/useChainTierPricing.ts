import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { errorToMessage } from "../utils";
import {
  CURRENCIES,
  createChainTierRowDraft,
  deriveAnnualTotal,
  deriveDiscountFromEffective,
  deriveEffectiveMonthly,
  parseNumericInput,
} from "../utils";
import type { ChainTierRowDraft, CurrencyCode, Plan } from "../types";

const validateChainCurrencyDrafts = (currency: CurrencyCode, rows: ChainTierRowDraft[]) => {
  const errors: string[] = [];
  if (!rows.length) {
    errors.push(`${currency}: add at least one tier.`);
    return errors;
  }

  const parsed = rows
    .map((row) => ({
      row,
      label: row.tier_label.trim(),
      min: Number(row.tier_min),
      max: row.tier_max.trim() ? Number(row.tier_max) : null,
      price: row.price_per_location.trim() ? Number(row.price_per_location) : null,
      annualDiscountPct: row.annual_discount_pct.trim() ? Number(row.annual_discount_pct) : 0,
    }))
    .sort((a, b) => a.min - b.min);

  const labels = new Set<string>();
  let expectedMin = 2;
  let openEndedCount = 0;

  parsed.forEach((item) => {
    if (!item.label) errors.push(`${currency}: tier label is required.`);
    const normalizedLabel = item.label.toLowerCase();
    if (labels.has(normalizedLabel)) {
      errors.push(`${currency}: tier labels must be unique.`);
    }
    labels.add(normalizedLabel);

    if (!Number.isFinite(item.min) || item.min < 2) {
      errors.push(`${currency}: tier min must be 2 or greater.`);
    }
    if (item.max !== null && (!Number.isFinite(item.max) || item.max < item.min)) {
      errors.push(`${currency}: tier max must be empty or >= tier min.`);
    }
    if (item.min !== expectedMin) {
      errors.push(`${currency}: ranges must be contiguous and start at 2.`);
    }
    if (item.max === null) {
      openEndedCount += 1;
      if (!item.row.is_custom) {
        errors.push(`${currency}: open-ended tier must be marked custom.`);
      }
      expectedMin = Number.MAX_SAFE_INTEGER;
    } else {
      expectedMin = item.max + 1;
    }

    if (item.row.is_custom) {
      if (item.price !== null) {
        errors.push(`${currency}: custom tier must not have a price.`);
      }
    } else {
      if (item.price === null || !Number.isFinite(item.price) || item.price < 0) {
        errors.push(`${currency}: non-custom tiers require price >= 0.`);
      }
      if (!Number.isFinite(item.annualDiscountPct) || item.annualDiscountPct < 0 || item.annualDiscountPct > 100) {
        errors.push(`${currency}: annual discount must be between 0 and 100.`);
      }
    }
  });

  if (openEndedCount > 1) {
    errors.push(`${currency}: only one open-ended tier is allowed.`);
  }
  return errors;
};

/** Tiered per-location pricing for the Chain plan's "additional locations" add-on. */
export function useChainTierPricing(chainPlan: Plan | null) {
  const queryClient = useQueryClient();

  const [locationPricingReason, setLocationPricingReason] = useState("");
  const [chainTierDrafts, setChainTierDrafts] = useState<Record<CurrencyCode, ChainTierRowDraft[]>>({
    NGN: [createChainTierRowDraft("2", "3"), createChainTierRowDraft("4", "10"), createChainTierRowDraft("11", "", true)],
    GHS: [createChainTierRowDraft("2", "3"), createChainTierRowDraft("4", "10"), createChainTierRowDraft("11", "", true)],
  });
  const [chainTierDirty, setChainTierDirty] = useState(false);

  const { data: chainTierPricing } = useQuery({
    queryKey: ["backoffice-chain-tier-pricing", chainPlan?.id],
    enabled: Boolean(chainPlan?.id),
    queryFn: async () => {
      if (!chainPlan?.id) return [];
      const { data, error } = await (supabase.from as any)("additional_location_pricing")
        .select("*")
        .eq("plan_id", chainPlan.id)
        .order("currency", { ascending: true })
        .order("tier_min", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{
        currency: CurrencyCode;
        tier_label: string;
        tier_min: number;
        tier_max: number | null;
        price_per_location: number | null;
        price_per_location_annual: number | null;
        is_custom: boolean;
      }>;
    },
  });

  useEffect(() => {
    if (!chainPlan?.id || chainTierDirty) return;
    const grouped: Record<CurrencyCode, ChainTierRowDraft[]> = { NGN: [], GHS: [] };
    (chainTierPricing || []).forEach((row) => {
      grouped[row.currency].push({
        localId: crypto.randomUUID(),
        tier_label: row.tier_label,
        tier_min: String(row.tier_min),
        tier_max: row.tier_max == null ? "" : String(row.tier_max),
        price_per_location: row.price_per_location == null ? "" : String(row.price_per_location),
        annual_discount_pct:
          row.price_per_location != null && row.price_per_location_annual != null
            ? String(deriveDiscountFromEffective(Number(row.price_per_location), Number(row.price_per_location_annual) / 12))
            : "",
        is_custom: Boolean(row.is_custom),
      });
    });
    CURRENCIES.forEach((currency) => {
      if (grouped[currency].length === 0) {
        grouped[currency] = [
          createChainTierRowDraft("2", "3"),
          createChainTierRowDraft("4", "10"),
          createChainTierRowDraft("11", "", true),
        ];
      }
    });
    setChainTierDrafts(grouped);
  }, [chainPlan?.id, chainTierDirty, chainTierPricing]);

  const chainTierValidation = useMemo(() => {
    const errors: string[] = [];
    if (!chainPlan?.id) {
      errors.push("Chain plan not found.");
      return { isValid: false, errors };
    }
    if (!locationPricingReason.trim()) {
      errors.push("Reason is required.");
    }
    CURRENCIES.forEach((currency) => {
      errors.push(...validateChainCurrencyDrafts(currency, chainTierDrafts[currency]));
    });
    return { isValid: errors.length === 0, errors };
  }, [chainPlan?.id, chainTierDrafts, locationPricingReason]);

  const addChainTierRow = (currency: CurrencyCode) => {
    setChainTierDirty(true);
    setChainTierDrafts((prev) => {
      const rows = prev[currency];
      const sorted = [...rows].sort((a, b) => Number(a.tier_min || 0) - Number(b.tier_min || 0));
      const last = sorted[sorted.length - 1];
      const nextMin = last?.tier_max?.trim()
        ? String(Number(last.tier_max) + 1)
        : String(Number(last?.tier_min || "2") + 1);
      const next = createChainTierRowDraft(nextMin, "");
      return { ...prev, [currency]: [...rows, next] };
    });
  };

  const updateChainTierRow = (
    currency: CurrencyCode,
    localId: string,
    patch: Partial<ChainTierRowDraft>,
  ) => {
    setChainTierDirty(true);
    setChainTierDrafts((prev) => ({
      ...prev,
      [currency]: prev[currency].map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    }));
  };

  const removeChainTierRow = (currency: CurrencyCode, localId: string) => {
    setChainTierDirty(true);
    setChainTierDrafts((prev) => ({
      ...prev,
      [currency]: prev[currency].filter((row) => row.localId !== localId),
    }));
  };

  const saveChainTiersMutation = useMutation({
    mutationFn: async () => {
      if (!chainPlan?.id) {
        throw new Error("Chain plan not found.");
      }
      const tiers = CURRENCIES.flatMap((currency) =>
        chainTierDrafts[currency].map((row) => ({
          currency,
          tier_label: row.tier_label.trim(),
          tier_min: Number(row.tier_min),
          tier_max: row.tier_max.trim() ? Number(row.tier_max) : null,
          price_per_location: row.is_custom
            ? null
            : Number(row.price_per_location),
          price_per_location_annual: row.is_custom
            ? null
            : deriveAnnualTotal(
                deriveEffectiveMonthly(
                  Number(row.price_per_location),
                  Math.max(0, Math.min(100, parseNumericInput(row.annual_discount_pct || "0"))),
                ),
              ),
          is_custom: row.is_custom,
        })),
      );
      const { error } = await (supabase.rpc as any)("backoffice_upsert_chain_location_pricing", {
        p_plan_id: chainPlan.id,
        p_tiers: tiers,
        p_reason: locationPricingReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chain location tiers updated.");
      setChainTierDirty(false);
      setLocationPricingReason("");
      queryClient.invalidateQueries({ queryKey: ["backoffice-chain-tier-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  return {
    chainTierDrafts,
    chainTierDirty,
    setChainTierDirty,
    locationPricingReason,
    setLocationPricingReason,
    chainTierValidation,
    addChainTierRow,
    updateChainTierRow,
    removeChainTierRow,
    saveChainTiersMutation,
  };
}
