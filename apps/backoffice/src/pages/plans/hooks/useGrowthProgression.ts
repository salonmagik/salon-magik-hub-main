import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { errorToMessage } from "../utils";
import { CURRENCIES } from "../utils";
import type { ActorUser, ChainTierRowDraft, CurrencyCode, Plan, PlanLimit, ProgressionDraft } from "../types";

/**
 * Per-plan thresholds that trigger the "offer the next growth stage"
 * conversation. Depends on chain-tier drafts only to pick a sensible
 * default location threshold for the Chain row.
 */
export function useGrowthProgression(
  progressionPlans: Plan[],
  limitsByPlan: Map<string, PlanLimit>,
  chainTierDrafts: Record<CurrencyCode, ChainTierRowDraft[]>,
  backofficeUser: ActorUser | null | undefined,
) {
  const queryClient = useQueryClient();

  const [progressionReason, setProgressionReason] = useState("");
  const [progressionDrafts, setProgressionDrafts] = useState<Record<string, ProgressionDraft>>({});
  const [progressionDirty, setProgressionDirty] = useState(false);
  const [hasAttemptedProgressionSubmit, setHasAttemptedProgressionSubmit] = useState(false);

  useEffect(() => {
    if (progressionDirty || progressionPlans.length === 0) return;
    const nextDrafts: Record<string, ProgressionDraft> = {};
    progressionPlans.forEach((plan, index) => {
      const nextPlan = progressionPlans[index + 1];
      const limit = limitsByPlan.get(plan.id);
      const firstChainLocationTier = plan.slug.trim().toLowerCase() === "chain"
        ? CURRENCIES.flatMap((currency) => chainTierDrafts[currency] || [])
          .map((row) => Number(row.tier_min))
          .filter((value) => Number.isFinite(value) && value >= 1)
          .sort((a, b) => a - b)[0]
        : undefined;
      nextDrafts[plan.id] = {
        planId: plan.id,
        planName: plan.name,
        nextPlanName: nextPlan?.name || "Chain expansion",
        maxLocations: String(firstChainLocationTier ?? limit?.max_locations ?? 1),
        maxStaff: String(limit?.max_staff ?? 1),
      };
    });
    setProgressionDrafts(nextDrafts);
  }, [chainTierDrafts, limitsByPlan, progressionDirty, progressionPlans]);

  const progressionValidation = useMemo(() => {
    const errors: string[] = [];
    if (!progressionReason.trim()) errors.push("Growth progression reason is required.");
    const drafts = Object.values(progressionDrafts);
    if (!drafts.length) errors.push("No growth progression stages are configured.");
    drafts.forEach((draft) => {
      const locations = Number(draft.maxLocations);
      const staff = Number(draft.maxStaff);
      if (!Number.isInteger(locations) || locations < 1) errors.push(`${draft.planName}: locations must be a whole number of at least 1.`);
      if (!Number.isInteger(staff) || staff < 1) errors.push(`${draft.planName}: staff must be a whole number of at least 1.`);
    });
    return { isValid: errors.length === 0, errors };
  }, [progressionDrafts, progressionReason]);

  const updateProgressionDraft = (planId: string, patch: Partial<ProgressionDraft>) => {
    setProgressionDirty(true);
    setProgressionDrafts((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], ...patch },
    }));
  };

  const saveProgressionMutation = useMutation({
    mutationFn: async () => {
      setHasAttemptedProgressionSubmit(true);
      if (!progressionValidation.isValid) {
        throw new Error(progressionValidation.errors[0] || "Fix the errors before saving.");
      }
      const rows = Object.values(progressionDrafts);
      for (const draft of rows) {
        const { error } = await supabase
          .from("plan_limits")
          .update({
            max_locations: Number(draft.maxLocations),
            max_staff: Number(draft.maxStaff),
          })
          .eq("plan_id", draft.planId);
        if (error) throw error;
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "plan_growth_progression_updated",
        entity_type: "plan_limits",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: progressionReason.trim(),
          transitions: rows.map((draft) => ({
            plan_id: draft.planId,
            plan_name: draft.planName,
            next_plan_name: draft.nextPlanName,
            locations: Number(draft.maxLocations),
            staff: Number(draft.maxStaff),
          })),
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      toast.success("Growth progression thresholds updated.");
      setProgressionReason("");
      setProgressionDirty(false);
      setHasAttemptedProgressionSubmit(false);
      queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => toast.error(errorToMessage(error)),
  });

  return {
    progressionReason,
    setProgressionReason,
    progressionDrafts,
    progressionDirty,
    setProgressionDirty,
    hasAttemptedProgressionSubmit,
    progressionValidation,
    updateProgressionDraft,
    saveProgressionMutation,
  };
}
