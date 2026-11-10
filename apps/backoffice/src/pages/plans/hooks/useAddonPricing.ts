import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { errorToMessage } from "../utils";
import { DEFAULT_MARKETING_ADDONS, createSmsComplimentaryDraft, createSmsPricingDraft, parseNumericInput } from "../utils";
import type {
  ActorUser,
  MarketingAddonDraft,
  PricingMarket,
  PricingStatus,
  SeatPricingDraft,
  SmsComplimentaryDraft,
  SmsCreditPricingDraft,
  SmsCreditTierDraft,
  StaffAddonPricingRow,
  StaffOperationsPricingDraft,
  StaffOperationsPricingRow,
  ThemeAddonPricingRow,
  ThemeCatalogRow,
  ThemePricingDraft,
} from "../types";

/**
 * Seat / Staff Operations / e-commerce theme / SMS / marketing add-on
 * pricing. These five domains are grouped in one hook because they share
 * the same "per-market draft synced from a query, save via mutation,
 * reason + dirty-flag" shape, even though seats/staff-ops/themes end up
 * sharing one UI component (MarketPricingEditor) and SMS/marketing don't
 * (see components/addon-editors — SMS has tiered bundles, marketing
 * addons aren't per-market at all).
 */
export function useAddonPricing(pricingMarkets: PricingMarket[], backofficeUser: ActorUser | null | undefined) {
  const queryClient = useQueryClient();

  // ---- Seat (extra staff) add-on pricing ----
  const { data: seatPricingRows } = useQuery({
    queryKey: ["backoffice-seat-addon-pricing"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("staff_addon_pricing")
        .select("id,country_code,currency,unit_price_per_extra_seat,status,notes,effective_from")
        .order("country_code", { ascending: true })
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffAddonPricingRow[];
    },
  });

  const latestSeatPricingByCountry = useMemo(() => {
    const map = new Map<string, StaffAddonPricingRow>();
    (seatPricingRows || []).forEach((row) => {
      if (!map.has(row.country_code)) {
        map.set(row.country_code, row);
      }
    });
    return map;
  }, [seatPricingRows]);

  const [seatPricingReason, setSeatPricingReason] = useState("");
  const [seatPricingDrafts, setSeatPricingDrafts] = useState<Record<string, SeatPricingDraft>>({});
  const [seatPricingDirty, setSeatPricingDirty] = useState(false);

  useEffect(() => {
    if (seatPricingDirty || pricingMarkets.length === 0) return;
    const nextDrafts: Record<string, SeatPricingDraft> = {};
    pricingMarkets.forEach((market) => {
      const row = latestSeatPricingByCountry.get(market.country_code);
      nextDrafts[market.country_code] = {
        rowId: row?.id || null,
        country_code: market.country_code,
        country_name: market.country_name,
        currency: row?.currency || market.currency,
        unit_price:
          row?.unit_price_per_extra_seat == null ? "" : String(row.unit_price_per_extra_seat),
        status: row?.status || "active",
        notes: row?.notes || "",
      };
    });
    setSeatPricingDrafts(nextDrafts);
  }, [latestSeatPricingByCountry, pricingMarkets, seatPricingDirty]);

  const seatPricingValidation = useMemo(() => {
    const errors: string[] = [];
    if (!seatPricingReason.trim()) {
      errors.push("Seat pricing reason is required.");
    }
    const drafts = Object.values(seatPricingDrafts);
    if (!drafts.length) {
      errors.push("No seat pricing rows available.");
    }
    drafts.forEach((draft) => {
      if (!draft.currency.trim() || draft.currency.trim().length !== 3) {
        errors.push(`${draft.country_name}: currency must be a 3-letter code.`);
      }
      const unitPrice = parseNumericInput(draft.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(`${draft.country_name}: unit price must be 0 or greater.`);
      }
    });
    return { isValid: errors.length === 0, errors };
  }, [seatPricingDrafts, seatPricingReason]);

  const updateSeatPricingDraft = (countryCode: string, patch: Partial<SeatPricingDraft>) => {
    setSeatPricingDirty(true);
    setSeatPricingDrafts((prev) => ({
      ...prev,
      [countryCode]: { ...prev[countryCode], ...patch },
    }));
  };

  const saveSeatPricingMutation = useMutation({
    mutationFn: async () => {
      for (const draft of Object.values(seatPricingDrafts)) {
        const payload = {
          country_code: draft.country_code,
          currency: draft.currency.trim().toUpperCase(),
          unit_price_per_extra_seat: Number(draft.unit_price),
          status: draft.status,
          notes: draft.notes.trim() || null,
        };

        if (draft.rowId) {
          const { error } = await (supabase.from as any)("staff_addon_pricing")
            .update(payload)
            .eq("id", draft.rowId);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from as any)("staff_addon_pricing").insert({
            ...payload,
            created_by: backofficeUser?.user_id || null,
          });
          if (error) throw error;
        }
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "staff_addon_pricing_updated",
        entity_type: "staff_addon_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: seatPricingReason.trim(),
          rows: Object.values(seatPricingDrafts).map((draft) => ({
            country_code: draft.country_code,
            currency: draft.currency.trim().toUpperCase(),
            unit_price_per_extra_seat: Number(draft.unit_price),
            status: draft.status,
          })),
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("Seat add-on pricing updated.");
      setSeatPricingDirty(false);
      setSeatPricingReason("");
      queryClient.invalidateQueries({ queryKey: ["backoffice-seat-addon-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  // ---- Staff Operations add-on pricing ----
  const { data: staffOperationsPricingRows } = useQuery({
    queryKey: ["backoffice-staff-operations-addon-pricing"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("staff_operations_addon_pricing")
        .select("id,country_code,currency,unit_price_per_location,status,notes,effective_from")
        .order("country_code", { ascending: true })
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffOperationsPricingRow[];
    },
  });

  const latestStaffOperationsPricingByCountry = useMemo(() => {
    const map = new Map<string, StaffOperationsPricingRow>();
    (staffOperationsPricingRows || []).forEach((row) => {
      if (!map.has(row.country_code)) {
        map.set(row.country_code, row);
      }
    });
    return map;
  }, [staffOperationsPricingRows]);

  const [staffOperationsPricingReason, setStaffOperationsPricingReason] = useState("");
  const [staffOperationsPricingDrafts, setStaffOperationsPricingDrafts] =
    useState<Record<string, StaffOperationsPricingDraft>>({});
  const [staffOperationsPricingDirty, setStaffOperationsPricingDirty] = useState(false);

  useEffect(() => {
    if (staffOperationsPricingDirty || pricingMarkets.length === 0) return;
    const nextDrafts: Record<string, StaffOperationsPricingDraft> = {};
    pricingMarkets.forEach((market) => {
      const row = latestStaffOperationsPricingByCountry.get(market.country_code);
      nextDrafts[market.country_code] = {
        rowId: row?.id || null,
        country_code: market.country_code,
        country_name: market.country_name,
        currency: row?.currency || market.currency,
        unit_price: row?.unit_price_per_location == null
          ? ""
          : String(row.unit_price_per_location),
        status: row?.status || "active",
        notes: row?.notes || "",
      };
    });
    setStaffOperationsPricingDrafts(nextDrafts);
  }, [
    latestStaffOperationsPricingByCountry,
    pricingMarkets,
    staffOperationsPricingDirty,
  ]);

  const staffOperationsPricingValidation = useMemo(() => {
    const errors: string[] = [];
    if (!staffOperationsPricingReason.trim()) {
      errors.push("Staff Operations pricing reason is required.");
    }
    const drafts = Object.values(staffOperationsPricingDrafts);
    if (!drafts.length) {
      errors.push("No Staff Operations pricing rows available.");
    }
    drafts.forEach((draft) => {
      if (!draft.currency.trim() || draft.currency.trim().length !== 3) {
        errors.push(`${draft.country_name}: currency must be a 3-letter code.`);
      }
      const unitPrice = parseNumericInput(draft.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(`${draft.country_name}: monthly location price must be 0 or greater.`);
      }
    });
    return { isValid: errors.length === 0, errors };
  }, [staffOperationsPricingDrafts, staffOperationsPricingReason]);

  const updateStaffOperationsPricingDraft = (
    countryCode: string,
    patch: Partial<StaffOperationsPricingDraft>,
  ) => {
    setStaffOperationsPricingDirty(true);
    setStaffOperationsPricingDrafts((prev) => ({
      ...prev,
      [countryCode]: { ...prev[countryCode], ...patch },
    }));
  };

  const saveStaffOperationsPricingMutation = useMutation({
    mutationFn: async () => {
      for (const draft of Object.values(staffOperationsPricingDrafts)) {
        const payload = {
          country_code: draft.country_code,
          currency: draft.currency.trim().toUpperCase(),
          unit_price_per_location: Number(draft.unit_price),
          status: draft.status,
          notes: draft.notes.trim() || null,
        };

        if (draft.rowId) {
          const { error } = await (supabase.from as any)("staff_operations_addon_pricing")
            .update(payload)
            .eq("id", draft.rowId);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from as any)("staff_operations_addon_pricing")
            .insert({
              ...payload,
              created_by: backofficeUser?.user_id || null,
            });
          if (error) throw error;
        }
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "staff_operations_addon_pricing_updated",
        entity_type: "staff_operations_addon_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: staffOperationsPricingReason.trim(),
          billing_model: "monthly_per_location",
          includes: ["location_checkins", "time_off"],
          rows: Object.values(staffOperationsPricingDrafts).map((draft) => ({
            country_code: draft.country_code,
            currency: draft.currency.trim().toUpperCase(),
            unit_price_per_location: Number(draft.unit_price),
            status: draft.status,
          })),
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("Staff Operations add-on pricing updated.");
      setStaffOperationsPricingReason("");
      setStaffOperationsPricingDirty(false);
      queryClient.invalidateQueries({
        queryKey: ["backoffice-staff-operations-addon-pricing"],
      });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  // ---- E-commerce theme catalog + pricing ----
  const { data: themeCatalog } = useQuery({
    queryKey: ["backoffice-theme-catalog", "ecommerce"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("theme_catalog")
        .select("theme_key,name,description,is_active")
        .eq("theme_key", "ecommerce")
        .maybeSingle();
      if (error) throw error;
      return (data || null) as ThemeCatalogRow | null;
    },
  });

  const { data: themePricingRows } = useQuery({
    queryKey: ["backoffice-theme-addon-pricing", "ecommerce"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("theme_addon_pricing")
        .select("id,theme_key,country_code,currency,billing_interval,unit_price,status,notes,effective_from")
        .eq("theme_key", "ecommerce")
        .order("country_code", { ascending: true })
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data || []) as ThemeAddonPricingRow[];
    },
  });

  const latestThemePricingByCountry = useMemo(() => {
    const map = new Map<string, ThemeAddonPricingRow>();
    (themePricingRows || []).forEach((row) => {
      if (!map.has(row.country_code)) {
        map.set(row.country_code, row);
      }
    });
    return map;
  }, [themePricingRows]);

  const [themePricingReason, setThemePricingReason] = useState("");
  const [themePricingDrafts, setThemePricingDrafts] = useState<Record<string, ThemePricingDraft>>({});
  const [themePricingDirty, setThemePricingDirty] = useState(false);
  const [themeCatalogDraft, setThemeCatalogDraft] = useState({ name: "", description: "", is_active: true });

  useEffect(() => {
    if (themePricingDirty || pricingMarkets.length === 0) return;
    const nextDrafts: Record<string, ThemePricingDraft> = {};
    pricingMarkets.forEach((market) => {
      const row = latestThemePricingByCountry.get(market.country_code);
      nextDrafts[market.country_code] = {
        rowId: row?.id || null,
        theme_key: row?.theme_key || "ecommerce",
        country_code: market.country_code,
        country_name: market.country_name,
        currency: row?.currency || market.currency,
        billing_interval: "annual",
        unit_price: row?.unit_price == null ? "" : String(row.unit_price),
        status: row?.status || "active",
        notes: row?.notes || "",
      };
    });
    setThemePricingDrafts(nextDrafts);
  }, [latestThemePricingByCountry, pricingMarkets, themePricingDirty]);

  useEffect(() => {
    if (!themeCatalog) return;
    setThemeCatalogDraft({
      name: themeCatalog.name,
      description: themeCatalog.description || "",
      is_active: themeCatalog.is_active,
    });
  }, [themeCatalog]);

  const themePricingValidation = useMemo(() => {
    const errors: string[] = [];
    if (!themePricingReason.trim()) {
      errors.push("Theme pricing reason is required.");
    }
    const drafts = Object.values(themePricingDrafts);
    if (!drafts.length) {
      errors.push("No theme pricing rows available.");
    }
    drafts.forEach((draft) => {
      if (!draft.currency.trim() || draft.currency.trim().length !== 3) {
        errors.push(`${draft.country_name}: currency must be a 3-letter code.`);
      }
      const unitPrice = parseNumericInput(draft.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(`${draft.country_name}: annual price must be 0 or greater.`);
      }
    });
    return { isValid: errors.length === 0, errors };
  }, [themePricingDrafts, themePricingReason]);

  const updateThemePricingDraft = (countryCode: string, patch: Partial<ThemePricingDraft>) => {
    setThemePricingDirty(true);
    setThemePricingDrafts((prev) => ({
      ...prev,
      [countryCode]: { ...prev[countryCode], ...patch },
    }));
  };

  const saveThemePricingMutation = useMutation({
    mutationFn: async () => {
      for (const draft of Object.values(themePricingDrafts)) {
        const payload = {
          theme_key: draft.theme_key,
          country_code: draft.country_code,
          currency: draft.currency.trim().toUpperCase(),
          billing_interval: "annual" as const,
          unit_price: Number(draft.unit_price),
          status: draft.status,
          notes: draft.notes.trim() || null,
        };

        if (draft.rowId) {
          const { error } = await (supabase.from as any)("theme_addon_pricing")
            .update(payload)
            .eq("id", draft.rowId);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from as any)("theme_addon_pricing").insert({
            ...payload,
            created_by: backofficeUser?.user_id || null,
          });
          if (error) throw error;
        }
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "theme_addon_pricing_updated",
        entity_type: "theme_addon_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: themePricingReason.trim(),
          theme_key: "ecommerce",
          rows: Object.values(themePricingDrafts).map((draft) => ({
            country_code: draft.country_code,
            currency: draft.currency.trim().toUpperCase(),
            unit_price: Number(draft.unit_price),
            status: draft.status,
            billing_interval: draft.billing_interval,
          })),
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("Theme pricing updated.");
      setThemePricingReason("");
      setThemePricingDirty(false);
      queryClient.invalidateQueries({ queryKey: ["backoffice-theme-addon-pricing", "ecommerce"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const saveThemeCatalogMutation = useMutation({
    mutationFn: async () => {
      if (!themeCatalogDraft.name.trim()) throw new Error("Theme add-on name is required.");
      const { error } = await (supabase.from as any)("theme_catalog")
        .update({
          name: themeCatalogDraft.name.trim(),
          description: themeCatalogDraft.description.trim() || null,
          is_active: themeCatalogDraft.is_active,
        })
        .eq("theme_key", "ecommerce");
      if (error) throw error;
      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "theme_catalog_updated",
        entity_type: "theme_catalog",
        actor_user_id: backofficeUser?.user_id,
        metadata: { reason: themePricingReason.trim(), theme_key: "ecommerce", ...themeCatalogDraft },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("E-commerce theme add-on updated.");
      setThemePricingReason("");
      queryClient.invalidateQueries({ queryKey: ["backoffice-theme-catalog", "ecommerce"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => toast.error(errorToMessage(error)),
  });

  // ---- SMS credit pricing + complimentary allowances ----
  const { data: smsPricingSetting } = useQuery({
    queryKey: ["backoffice-platform-setting", "sms_credit_pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "sms_credit_pricing")
        .maybeSingle();
      if (error) throw error;
      return data?.value as Record<string, unknown> | null;
    },
  });

  const { data: smsComplimentarySetting } = useQuery({
    queryKey: ["backoffice-platform-setting", "sms_complimentary_allowances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "sms_complimentary_allowances")
        .maybeSingle();
      if (error) throw error;
      return data?.value as Record<string, unknown> | null;
    },
  });

  const [smsPricingReason, setSmsPricingReason] = useState("");
  const [smsPricingDraft, setSmsPricingDraft] = useState<SmsCreditPricingDraft>(createSmsPricingDraft);
  const [smsComplimentaryDraft, setSmsComplimentaryDraft] = useState<SmsComplimentaryDraft>(createSmsComplimentaryDraft);
  const [smsPricingDirty, setSmsPricingDirty] = useState(false);

  useEffect(() => {
    if (smsPricingDirty || !smsPricingSetting) return;
    const defaults = createSmsPricingDraft();
    const rawTiers = (smsPricingSetting.tiers || {}) as Record<string, unknown>;
    const tiers = (Object.keys(defaults.tiers) as Array<"NGN" | "GHS">).reduce((result, currency) => {
      const rows = Array.isArray(rawTiers[currency]) ? rawTiers[currency] : [];
      result[currency] = rows.length > 0
        ? rows.flatMap((row: unknown) => {
            if (!row || typeof row !== "object") return [];
            const value = row as Record<string, unknown>;
            return [{
              bundle_price: String(value.bundle_price ?? ""),
              arkesel_cost_per_sms: String(value.arkesel_cost_per_sms ?? ""),
            }];
          })
        : defaults.tiers[currency];
      return result;
    }, {} as SmsCreditPricingDraft["tiers"]);
    setSmsPricingDraft({
      margin_multiplier: String(smsPricingSetting.margin_multiplier ?? defaults.margin_multiplier),
      low_balance_threshold_credits: String(
        smsPricingSetting.low_balance_threshold_credits ?? defaults.low_balance_threshold_credits,
      ),
      tiers,
    });
  }, [smsPricingDirty, smsPricingSetting]);

  useEffect(() => {
    if (smsPricingDirty || !smsComplimentarySetting) return;
    const defaults = createSmsComplimentaryDraft();
    const defaultPolicy = smsComplimentarySetting.default;
    const policy = defaultPolicy && typeof defaultPolicy === "object"
      ? defaultPolicy as Record<string, unknown>
      : {};
    setSmsComplimentaryDraft({
      reminder_segments: String(policy.reminder_segments ?? defaults.reminder_segments),
      marketing_segments: String(policy.marketing_segments ?? defaults.marketing_segments),
    });
  }, [smsComplimentarySetting, smsPricingDirty]);

  const smsPricingValidation = useMemo(() => {
    const errors: string[] = [];
    if (!smsPricingReason.trim()) errors.push("Reason is required.");
    const margin = parseNumericInput(smsPricingDraft.margin_multiplier);
    const threshold = parseNumericInput(smsPricingDraft.low_balance_threshold_credits);
    if (!Number.isFinite(margin) || margin <= 0) errors.push("Margin multiplier must be greater than 0.");
    if (!Number.isFinite(threshold) || threshold < 0) errors.push("Low balance threshold must be 0 or greater.");
    (Object.keys(smsPricingDraft.tiers) as Array<"NGN" | "GHS">).forEach((currency) => {
      if (smsPricingDraft.tiers[currency].length === 0) errors.push(`${currency}: add at least one SMS bundle.`);
      smsPricingDraft.tiers[currency].forEach((tier, index) => {
        const bundlePrice = parseNumericInput(tier.bundle_price);
        const providerCost = parseNumericInput(tier.arkesel_cost_per_sms);
        if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) errors.push(`${currency} bundle ${index + 1}: price must be greater than 0.`);
        if (!Number.isFinite(providerCost) || providerCost <= 0) errors.push(`${currency} bundle ${index + 1}: provider cost must be greater than 0.`);
      });
    });
    const reminder = parseNumericInput(smsComplimentaryDraft.reminder_segments);
    const marketing = parseNumericInput(smsComplimentaryDraft.marketing_segments);
    if (!Number.isInteger(reminder) || reminder < 0) errors.push("Complimentary reminder SMS must be a whole number.");
    if (!Number.isInteger(marketing) || marketing < 0) errors.push("Complimentary marketing SMS must be a whole number.");
    return { isValid: errors.length === 0, errors };
  }, [smsComplimentaryDraft, smsPricingDraft, smsPricingReason]);

  const updateSmsPricingTier = (
    currency: "NGN" | "GHS",
    index: number,
    patch: Partial<SmsCreditTierDraft>,
  ) => {
    setSmsPricingDirty(true);
    setSmsPricingDraft((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [currency]: prev.tiers[currency].map((tier, tierIndex) =>
          tierIndex === index ? { ...tier, ...patch } : tier,
        ),
      },
    }));
  };

  const addSmsPricingTier = (currency: "NGN" | "GHS") => {
    setSmsPricingDirty(true);
    setSmsPricingDraft((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [currency]: [...prev.tiers[currency], { bundle_price: "", arkesel_cost_per_sms: "" }],
      },
    }));
  };

  const removeSmsPricingTier = (currency: "NGN" | "GHS", index: number) => {
    setSmsPricingDirty(true);
    setSmsPricingDraft((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [currency]: prev.tiers[currency].filter((_, tierIndex) => tierIndex !== index),
      },
    }));
  };

  const saveSmsPricingMutation = useMutation({
    mutationFn: async () => {
      const pricingValue = {
        margin_multiplier: Number(smsPricingDraft.margin_multiplier),
        low_balance_threshold_credits: Number(smsPricingDraft.low_balance_threshold_credits),
        tiers: Object.fromEntries(
          (Object.keys(smsPricingDraft.tiers) as Array<"NGN" | "GHS">).map((currency) => [
            currency,
            smsPricingDraft.tiers[currency].map((tier) => ({
              bundle_price: Number(tier.bundle_price),
              arkesel_cost_per_sms: Number(tier.arkesel_cost_per_sms),
            })),
          ]),
        ),
      };
      const complimentaryValue = {
        default: {
          reminder_segments: Number(smsComplimentaryDraft.reminder_segments),
          marketing_segments: Number(smsComplimentaryDraft.marketing_segments),
        },
      };

      const { error: pricingError } = await supabase
        .from("platform_settings")
        .upsert({
          key: "sms_credit_pricing",
          value: pricingValue,
          description: "SMS credit bundle pricing and margin settings.",
          updated_by_id: backofficeUser?.user_id || null,
        }, { onConflict: "key" });
      if (pricingError) throw pricingError;

      const { error: complimentaryError } = await supabase
        .from("platform_settings")
        .upsert({
          key: "sms_complimentary_allowances",
          value: complimentaryValue,
          description: "Monthly complimentary SMS segments by purpose. Purchased SMS is separate and never reset.",
          updated_by_id: backofficeUser?.user_id || null,
        }, { onConflict: "key" });
      if (complimentaryError) throw complimentaryError;

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "sms_pricing_updated",
        entity_type: "platform_settings",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: smsPricingReason.trim(),
          pricing: pricingValue,
          complimentary_allowances: complimentaryValue,
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("Messaging pricing updated.");
      setSmsPricingReason("");
      setSmsPricingDirty(false);
      queryClient.invalidateQueries({ queryKey: ["backoffice-platform-setting", "sms_credit_pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-platform-setting", "sms_complimentary_allowances"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => toast.error(errorToMessage(error)),
  });

  // ---- Public-facing marketing add-on list (names/descriptions/availability) ----
  const { data: marketingAddonsSetting } = useQuery({
    queryKey: ["backoffice-platform-setting", "marketing_addons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "marketing_addons")
        .maybeSingle();
      if (error) throw error;
      return data?.value as { addons?: unknown } | null;
    },
  });

  const [marketingAddonsDraft, setMarketingAddonsDraft] = useState<MarketingAddonDraft[]>(DEFAULT_MARKETING_ADDONS);
  const [marketingAddonsDirty, setMarketingAddonsDirty] = useState(false);
  const [marketingAddonsReason, setMarketingAddonsReason] = useState("");

  useEffect(() => {
    if (marketingAddonsDirty || !marketingAddonsSetting?.addons || !Array.isArray(marketingAddonsSetting.addons)) return;
    const parsed = marketingAddonsSetting.addons.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.key !== "string" || typeof row.name !== "string" || typeof row.description !== "string") return [];
      if (row.status !== "available" && row.status !== "coming_soon" && row.status !== "hidden") return [];
      return [{ key: row.key, name: row.name, description: row.description, status: row.status } satisfies MarketingAddonDraft];
    });
    if (parsed.length > 0) setMarketingAddonsDraft(parsed);
  }, [marketingAddonsDirty, marketingAddonsSetting]);

  const saveMarketingAddonsMutation = useMutation({
    mutationFn: async () => {
      const addons = marketingAddonsDraft.map((addon) => ({
        key: addon.key.trim(),
        name: addon.name.trim(),
        description: addon.description.trim(),
        status: addon.status,
      }));
      if (addons.some((addon) => !addon.key || !addon.name || !addon.description)) {
        throw new Error("Every public add-on needs a name and description.");
      }
      const { error } = await supabase
        .from("platform_settings")
        .upsert({
          key: "marketing_addons",
          value: { addons },
          description: "Customer-facing add-on names, descriptions, and availability shown on the marketing pricing page.",
          updated_by_id: backofficeUser?.user_id || null,
        }, { onConflict: "key" });
      if (error) throw error;
      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "marketing_addons_updated",
        entity_type: "platform_settings",
        actor_user_id: backofficeUser?.user_id,
        metadata: { reason: marketingAddonsReason.trim(), addons },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("Public add-on list updated.");
      setMarketingAddonsDirty(false);
      setMarketingAddonsReason("");
      queryClient.invalidateQueries({ queryKey: ["backoffice-platform-setting", "marketing_addons"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => toast.error(errorToMessage(error)),
  });

  return {
    pricingMarkets,
    latestSeatPricingByCountry,
    latestStaffOperationsPricingByCountry,
    latestThemePricingByCountry,

    seatPricingReason,
    setSeatPricingReason,
    seatPricingDrafts,
    seatPricingDirty,
    setSeatPricingDirty,
    seatPricingValidation,
    updateSeatPricingDraft,
    saveSeatPricingMutation,

    staffOperationsPricingReason,
    setStaffOperationsPricingReason,
    staffOperationsPricingDrafts,
    staffOperationsPricingDirty,
    setStaffOperationsPricingDirty,
    staffOperationsPricingValidation,
    updateStaffOperationsPricingDraft,
    saveStaffOperationsPricingMutation,

    themeCatalogDraft,
    setThemeCatalogDraft,
    themePricingReason,
    setThemePricingReason,
    themePricingDrafts,
    themePricingDirty,
    setThemePricingDirty,
    themePricingValidation,
    updateThemePricingDraft,
    saveThemePricingMutation,
    saveThemeCatalogMutation,

    smsPricingReason,
    setSmsPricingReason,
    smsPricingDraft,
    setSmsPricingDraft,
    smsComplimentaryDraft,
    setSmsComplimentaryDraft,
    smsPricingDirty,
    setSmsPricingDirty,
    smsPricingValidation,
    updateSmsPricingTier,
    addSmsPricingTier,
    removeSmsPricingTier,
    saveSmsPricingMutation,

    marketingAddonsDraft,
    setMarketingAddonsDraft,
    marketingAddonsDirty,
    setMarketingAddonsDirty,
    marketingAddonsReason,
    setMarketingAddonsReason,
    saveMarketingAddonsMutation,
  };
}
