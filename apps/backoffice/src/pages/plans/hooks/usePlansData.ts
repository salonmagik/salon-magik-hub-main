import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { errorToMessage } from "../utils";
import type {
  ActorUser,
  CurrencyCode,
  EditPricingRow,
  FeatureDraft,
  Plan,
  PlanDraft,
  PlanFeature,
  PlanLimit,
  PlanPricing,
  PricingSectionDraft,
  PaystackCodeDraft,
  RolloutMode,
} from "../types";
import {
  CURRENCIES,
  deriveAnnualTotal,
  deriveEffectiveMonthly,
  parseNumericInput,
  sanitizeSlug,
  toFixedNumber,
} from "../utils";

/**
 * Plans CRUD, base pricing CRUD, and Paystack plan-code bookkeeping.
 * Kept as one hook because every mutation here reaches into the same
 * plans/pricing/limits/features query cache for its audit-log payload.
 */
export function usePlansData(backofficeUser: ActorUser | null | undefined) {
  const queryClient = useQueryClient();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["backoffice-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("display_order");
      if (error) throw error;
      return (data || []) as Plan[];
    },
  });

  const { data: pricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["backoffice-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_pricing")
        .select("*")
        .is("valid_until", null);
      if (error) throw error;
      return (data || []) as unknown as PlanPricing[];
    },
  });

  // Map of planPricingId → ISO timestamp of most-recent successful Paystack sync.
  // Any row whose updated_at is AFTER its last sync timestamp needs to be flagged.
  const { data: lastSyncedAt } = useQuery({
    queryKey: ["backoffice-pricing-sync-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("metadata, created_at")
        .eq("action", "paystack_plan_pricing_synced")
        .order("created_at", { ascending: false });
      const map: Record<string, string> = {};
      for (const row of data || []) {
        const id = (row.metadata as Record<string, unknown>)?.planPricingId as string | undefined;
        if (id && !map[id]) map[id] = row.created_at as string;
      }
      return map;
    },
    staleTime: 30 * 1000,
  });

  const isOutOfSync = (row: PlanPricing) => {
    if (!row.paystack_plan_code_monthly && !row.paystack_plan_code_annual) return false;
    const syncedAt = lastSyncedAt?.[row.id];
    if (!syncedAt) return true;
    return new Date(row.updated_at) > new Date(syncedAt);
  };

  const { data: limits, isLoading: limitsLoading } = useQuery({
    queryKey: ["backoffice-limits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_limits").select("*");
      if (error) throw error;
      return (data || []) as PlanLimit[];
    },
  });

  const { data: features, isLoading: featuresLoading } = useQuery({
    queryKey: ["backoffice-plan-features"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_features")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as PlanFeature[];
    },
  });

  const isLoading = plansLoading || pricingLoading || limitsLoading || featuresLoading;

  const limitsByPlan = useMemo(() => {
    const map = new Map<string, PlanLimit>();
    (limits || []).forEach((row) => map.set(row.plan_id, row));
    return map;
  }, [limits]);

  const featuresByPlan = useMemo(() => {
    const map = new Map<string, PlanFeature[]>();
    (features || []).forEach((row) => {
      const items = map.get(row.plan_id) || [];
      items.push(row);
      map.set(row.plan_id, items);
    });
    map.forEach((items, key) =>
      map.set(
        key,
        [...items].sort((a, b) => a.sort_order - b.sort_order),
      ),
    );
    return map;
  }, [features]);

  const activePricingByPlan = useMemo(() => {
    const map = new Map<string, Map<CurrencyCode, PlanPricing>>();
    (pricing || []).forEach((row) => {
      const currMap = map.get(row.plan_id) || new Map<CurrencyCode, PlanPricing>();
      currMap.set(row.currency, row);
      map.set(row.plan_id, currMap);
    });
    return map;
  }, [pricing]);

  const recommendedPlanId = useMemo(
    () => (plans || []).find((plan) => plan.is_recommended)?.id || null,
    [plans],
  );

  const chainPlan = useMemo(
    () => (plans || []).find((plan) => plan.slug.trim().toLowerCase() === "chain") || null,
    [plans],
  );

  const progressionPlans = useMemo(
    () => [...(plans || [])].sort((a, b) => a.display_order - b.display_order),
    [plans],
  );

  // The public product now has one subscription. Keep the historic plan rows
  // available for existing tenants and billing records, but make the solo
  // row (or the first active row during a transition) the single customer-
  // facing base subscription that operators configure.
  const basePlan = useMemo(
    () =>
      (plans || []).find((plan) => plan.slug.trim().toLowerCase() === "solo") ||
      (plans || []).find((plan) => plan.is_active) ||
      (plans || [])[0] ||
      null,
    [plans],
  );
  const basePlanFeatures = basePlan ? featuresByPlan.get(basePlan.id) || [] : [];
  const basePlanPricing = basePlan ? activePricingByPlan.get(basePlan.id) : undefined;

  const planCount = plans?.length || 0;
  const remainingPlanSlots = Math.max(0, 4 - planCount);

  const plansWithoutActivePricing = useMemo(
    () => (plans || []).filter((plan) => !activePricingByPlan.has(plan.id)),
    [plans, activePricingByPlan],
  );

  const getPlanName = (planId: string) =>
    (plans || []).find((plan) => plan.id === planId)?.name || "Unnamed plan";

  const createPlanChangeBatchForPricing = async (
    planId: string,
    reason: string,
    pricingRows: Array<{
      currency: CurrencyCode;
      monthly_price: number;
      effective_monthly: number;
      annual_price: number;
    }>,
    rolloutMode: RolloutMode = "now",
    rolloutAt: string | null = null,
  ) => {
    const plan = (plans || []).find((item) => item.id === planId);
    if (!plan) return;
    const planLimit = limitsByPlan.get(planId);
    const planFeatures = (featuresByPlan.get(planId) || []).map((feature) => ({
      feature_text: feature.feature_text,
      sort_order: feature.sort_order,
    }));
    const previousByCurrency = activePricingByPlan.get(planId);
    const priceDeltas = pricingRows.map((row) => {
      const previous = previousByCurrency?.get(row.currency);
      return {
        currency: row.currency,
        previous_monthly_price: previous ? Number(previous.monthly_price) : null,
        new_monthly_price: row.monthly_price,
        previous_annual_price: previous ? Number(previous.annual_price) : null,
        new_annual_price: row.annual_price,
      };
    });
    await (supabase.rpc as any)("backoffice_create_plan_change_batch", {
      p_plan_id: planId,
      p_reason: reason,
      p_plan_core_json: {
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        display_order: plan.display_order,
        trial_days: plan.trial_days,
        is_active: plan.is_active,
        is_recommended: plan.is_recommended,
      },
      p_limits_json: {
        max_locations: planLimit?.max_locations || 1,
        max_staff: planLimit?.max_staff || 1,
        max_services: planLimit?.max_services ?? null,
        max_products: planLimit?.max_products ?? null,
        max_packages: planLimit?.max_packages ?? null,
        max_vouchers: planLimit?.max_vouchers ?? null,
        monthly_messages: planLimit?.monthly_messages || 30,
      },
      p_pricing_json: pricingRows,
      p_change_summary_json: {
        plan_name: plan.name,
        changes: ["pricing"],
        features: planFeatures,
        price_deltas: priceDeltas,
      },
      p_rollout_mode: rolloutMode,
      p_rollout_at: rolloutAt,
    });
  };

  const createPlansMutation = useMutation({
    mutationFn: async (drafts: PlanDraft[]) => {
      for (const draft of drafts) {
        const normalizedSlug = sanitizeSlug(draft.slug);

        const { data: createdPlan, error: planError } = await supabase
          .from("plans")
          .insert({
            name: draft.name.trim(),
            slug: normalizedSlug,
            description: draft.description.trim() || null,
            display_order: draft.display_order,
            trial_days: draft.trial_days,
            is_active: draft.is_active,
            is_recommended: false,
          })
          .select("id")
          .single();

        if (planError) throw planError;

        const { error: limitsError } = await supabase.from("plan_limits").insert({
          plan_id: createdPlan.id,
          max_locations: draft.max_locations,
          max_staff: draft.max_staff,
          max_services: draft.max_services.trim() ? Number(draft.max_services) : null,
          max_products: draft.max_products.trim() ? Number(draft.max_products) : null,
          max_packages: draft.max_packages.trim() ? Number(draft.max_packages) : null,
          max_vouchers: draft.max_vouchers.trim() ? Number(draft.max_vouchers) : null,
          monthly_messages: draft.monthly_messages,
        });
        if (limitsError) throw limitsError;

        const featureRows = draft.features
          .filter((feature: FeatureDraft) => feature.feature_text.trim())
          .map((feature: FeatureDraft) => ({
            plan_id: createdPlan.id,
            feature_text: feature.feature_text.trim(),
            sort_order: feature.sort_order,
          }));

        if (featureRows.length > 0) {
          const { error: featuresError } = await supabase.from("plan_features").insert(featureRows);
          if (featuresError) throw featuresError;
        }

        if (draft.is_recommended) {
          const { error: unsetError } = await supabase
            .from("plans")
            .update({ is_recommended: false })
            .neq("id", createdPlan.id);
          if (unsetError) throw unsetError;

          const { error: setError } = await supabase
            .from("plans")
            .update({ is_recommended: true })
            .eq("id", createdPlan.id);
          if (setError) throw setError;
        }

        const { error: auditError } = await supabase.from("audit_logs").insert({
          action: "plan_created",
          entity_type: "plan",
          entity_id: createdPlan.id,
          actor_user_id: backofficeUser?.user_id,
          metadata: {
            reason: draft.reason.trim(),
            name: draft.name.trim(),
            slug: normalizedSlug,
            is_recommended: draft.is_recommended,
          },
        });
        if (auditError) throw auditError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-plans"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-plan-features"] });
      toast.success("Plans created successfully.");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({
      planId,
      draft,
      rolloutMode,
      rolloutAt,
    }: {
      planId: string;
      draft: PlanDraft;
      rolloutMode: RolloutMode;
      rolloutAt: string | null;
    }) => {
      const normalizedSlug = sanitizeSlug(draft.slug);
      const featurePayload = draft.features
        .filter((item) => item.feature_text.trim())
        .map((item) => ({
          feature_text: item.feature_text.trim(),
          sort_order: item.sort_order,
        }));
      const pricingRows = Array.from(activePricingByPlan.get(planId)?.values() || []).map((row) => ({
        currency: row.currency,
        monthly_price: row.monthly_price,
        effective_monthly: row.effective_monthly,
        annual_price: row.annual_price,
      }));

      const { data, error } = await (supabase.rpc as any)("backoffice_create_plan_change_batch", {
        p_plan_id: planId,
        p_reason: draft.reason.trim(),
        p_plan_core_json: {
          name: draft.name.trim(),
          slug: normalizedSlug,
          description: draft.description.trim() || null,
          display_order: draft.display_order,
          trial_days: draft.trial_days,
          is_active: draft.is_active,
          is_recommended: draft.is_recommended,
        },
        p_limits_json: {
          max_locations: draft.max_locations,
          max_staff: draft.max_staff,
          max_services: draft.max_services.trim() ? Number(draft.max_services) : null,
          max_products: draft.max_products.trim() ? Number(draft.max_products) : null,
          max_packages: draft.max_packages.trim() ? Number(draft.max_packages) : null,
          max_vouchers: draft.max_vouchers.trim() ? Number(draft.max_vouchers) : null,
          monthly_messages: draft.monthly_messages,
        },
        p_pricing_json: pricingRows,
        p_change_summary_json: {
          plan_name: draft.name.trim(),
          changes: ["base_subscription", "plan_features"],
          features: featurePayload,
        },
        p_rollout_mode: rolloutMode,
        p_rollout_at: rolloutAt,
      });
      if (error) throw error;
      return { data, rolloutMode };
    },
    onSuccess: ({ rolloutMode }) => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-plans"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-plan-features"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
      toast.success(rolloutMode === "schedule" ? "Plan changes scheduled." : "Plan changes rolled out.");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async ({ planId, reason, totpCode }: { planId: string; reason: string; totpCode: string }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Missing session. Please sign in again.");
      }

      const verifyResponse = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
        body: {
          token: totpCode,
          action: "plan_delete",
          resourceId: planId,
          accessToken: session.access_token,
        },
      });

      if (verifyResponse.error || !verifyResponse.data?.valid || !verifyResponse.data?.challengeId) {
        throw verifyResponse.error || new Error(verifyResponse.data?.error || "Invalid 2FA code.");
      }

      const { data, error } = await (supabase.rpc as any)("backoffice_delete_or_archive_plan", {
        p_plan_id: planId,
        p_reason: reason,
        p_challenge_id: verifyResponse.data.challengeId,
      });
      if (error) throw error;
      return data as { status?: "deleted" | "archived" };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-plans"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-plan-features"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
      toast.success(result?.status === "archived" ? "Plan is in use and was archived instead." : "Plan deleted.");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const createPricingMutation = useMutation({
    mutationFn: async (payload: { sections: PricingSectionDraft[]; reason: string }) => {
      const rows: Array<{
        plan_id: string;
        currency: CurrencyCode;
        monthly_price: number;
        annual_price: number;
        effective_monthly: number;
      }> = [];

      for (const section of payload.sections) {
        const hasActivePricing = activePricingByPlan.has(section.plan_id);
        if (hasActivePricing) {
          throw new Error("Pricing already exists for this plan/currency. Edit existing pricing instead.");
        }

        for (const currency of CURRENCIES) {
          const row = section.currencies[currency];
          if (!row.enabled) continue;

          const monthly = parseNumericInput(row.monthly_price);
          const annualDiscountPct = parseNumericInput(row.annual_discount_pct || "0");
          const effectiveMonthly = deriveEffectiveMonthly(monthly, annualDiscountPct);
          const annualTotal = deriveAnnualTotal(effectiveMonthly);

          rows.push({
            plan_id: section.plan_id,
            currency,
            monthly_price: toFixedNumber(monthly),
            effective_monthly: effectiveMonthly,
            annual_price: annualTotal,
          });
        }
      }

      const { error: insertError } = await supabase.from("plan_pricing").insert(rows);
      if (insertError) throw insertError;

      const rowsByPlan = new Map<
        string,
        Array<{
          currency: CurrencyCode;
          monthly_price: number;
          effective_monthly: number;
          annual_price: number;
        }>
      >();
      rows.forEach((row) => {
        const list = rowsByPlan.get(row.plan_id) || [];
        list.push({
          currency: row.currency,
          monthly_price: row.monthly_price,
          effective_monthly: row.effective_monthly,
          annual_price: row.annual_price,
        });
        rowsByPlan.set(row.plan_id, list);
      });
      for (const [planId, planRows] of rowsByPlan.entries()) {
        await createPlanChangeBatchForPricing(planId, payload.reason.trim(), planRows);
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "pricing_created",
        entity_type: "plan_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: payload.reason.trim(),
          sections: payload.sections.map((section) => ({
            plan_id: section.plan_id,
            plan_name: getPlanName(section.plan_id),
            currencies: CURRENCIES.filter((currency) => section.currencies[currency].enabled),
          })),
          row_count: rows.length,
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
      toast.success("Pricing created successfully.");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const updatePricingMutation = useMutation({
    mutationFn: async ({
      planId,
      rows,
      reason,
      rolloutMode = "now",
      rolloutAt = null,
    }: {
      planId: string;
      rows: EditPricingRow[];
      reason: string;
      rolloutMode?: RolloutMode;
      rolloutAt?: string | null;
    }) => {
      // The actual plan_pricing write (closing the old row, inserting the new one)
      // happens inside backoffice_create_plan_change_batch / backoffice_apply_plan_change_batch.
      // We only compute the target values here, since writing them directly first would make
      // scheduled rollouts take effect immediately, defeating the rollout date.
      const changedRows = rows.map((row) => {
        const monthly = parseNumericInput(row.monthly_price);
        const annualDiscountPct = parseNumericInput(row.annual_discount_pct || "0");
        const effectiveMonthly = deriveEffectiveMonthly(monthly, annualDiscountPct);
        const annualTotal = deriveAnnualTotal(effectiveMonthly);

        return {
          currency: row.currency,
          monthly_price: toFixedNumber(monthly),
          effective_monthly: effectiveMonthly,
          annual_price: annualTotal,
        };
      });

      await createPlanChangeBatchForPricing(planId, reason.trim(), changedRows, rolloutMode, rolloutAt);

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "pricing_updated",
        entity_type: "plan_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: reason.trim(),
          plan_id: planId,
          currencies: rows.map((row) => row.currency),
          rollout_mode: rolloutMode,
          rollout_at: rolloutAt,
        },
      });
      if (auditError) throw auditError;
      return { rolloutMode };
    },
    onSuccess: ({ rolloutMode }) => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
      toast.success(rolloutMode === "schedule" ? "Pricing change scheduled." : "Pricing updated successfully.");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  // Paystack plan codes: per pricing-row drafts (NGN/GHS only). Wired up here
  // because it shares the `pricing` query cache, but note (preserved as-is
  // from the pre-split file): no JSX in this page currently renders a UI for
  // paystackCodeDrafts/paystackCodeRevealedRows/savePaystackCodeRow/
  // syncPaystackPlanPricing or `isOutOfSync` — they're reachable dead code
  // today, not something this split introduced or removed.
  const [paystackCodeDrafts, setPaystackCodeDrafts] = useState<Record<string, PaystackCodeDraft>>({});
  const [paystackCodeRevealedRows, setPaystackCodeRevealedRows] = useState<Set<string>>(new Set());
  const [paystackCodeSavingRows, setPaystackCodeSavingRows] = useState<Set<string>>(new Set());
  const [paystackSyncingRows, setPaystackSyncingRows] = useState<Set<string>>(new Set());

  useMemo(() => {
    if (!pricing) return;
    setPaystackCodeDrafts((prev) => {
      const next = { ...prev };
      pricing.forEach((row) => {
        if (row.currency !== "NGN" && row.currency !== "GHS") return;
        if (!next[row.id]?.dirty) {
          next[row.id] = {
            monthly: row.paystack_plan_code_monthly ?? "",
            annual: row.paystack_plan_code_annual ?? "",
            dirty: false,
          };
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing]);

  const savePaystackCodeRow = async (rowId: string) => {
    const draft = paystackCodeDrafts[rowId];
    if (!draft) return;
    setPaystackCodeSavingRows((prev) => new Set([...prev, rowId]));
    try {
      const { error } = await supabase
        .from("plan_pricing")
        .update({
          paystack_plan_code_monthly: draft.monthly.trim() || null,
          paystack_plan_code_annual: draft.annual.trim() || null,
        })
        .eq("id", rowId);
      if (error) throw error;
      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "paystack_plan_code_updated",
        entity_type: "plan_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          rowId,
          hasMonthly: Boolean(draft.monthly.trim()),
          hasAnnual: Boolean(draft.annual.trim()),
        },
      });
      if (auditError) throw auditError;
      setPaystackCodeDrafts((prev) => ({ ...prev, [rowId]: { ...prev[rowId], dirty: false } }));
      toast.success("Plan codes saved.");
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    } catch (err) {
      toast.error(errorToMessage(err));
    } finally {
      setPaystackCodeSavingRows((prev) => { const n = new Set(prev); n.delete(rowId); return n; });
    }
  };

  const syncPaystackPlanPricing = async (rowId: string) => {
    setPaystackSyncingRows((prev) => new Set([...prev, rowId]));
    try {
      const { data, error } = await supabase.functions.invoke("sync-paystack-plan-pricing", {
        body: { planPricingId: rowId },
      });
      if (error) throw error;
      const results = (data?.results || []) as Array<{ cycle: string; status: string; detail?: string }>;
      const errors = results.filter((r) => r.status === "error");
      if (errors.length > 0) {
        toast.error(`Paystack sync failed for ${errors.map((e) => e.cycle).join(", ")}: ${errors[0].detail}`);
      } else {
        toast.success("Paystack plan amounts synced.");
      }
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    } catch (err) {
      toast.error(errorToMessage(err));
    } finally {
      setPaystackSyncingRows((prev) => { const n = new Set(prev); n.delete(rowId); return n; });
    }
  };

  return {
    plans,
    pricing,
    limits,
    features,
    isLoading,
    lastSyncedAt,
    isOutOfSync,
    limitsByPlan,
    featuresByPlan,
    activePricingByPlan,
    recommendedPlanId,
    chainPlan,
    progressionPlans,
    basePlan,
    basePlanFeatures,
    basePlanPricing,
    planCount,
    remainingPlanSlots,
    plansWithoutActivePricing,
    getPlanName,
    createPlanChangeBatchForPricing,
    createPlansMutation,
    updatePlanMutation,
    deletePlanMutation,
    createPricingMutation,
    updatePricingMutation,
    paystackCodeDrafts,
    setPaystackCodeDrafts,
    paystackCodeRevealedRows,
    setPaystackCodeRevealedRows,
    paystackCodeSavingRows,
    paystackSyncingRows,
    savePaystackCodeRow,
    syncPaystackPlanPricing,
  };
}
