import { useMemo, useRef, useState } from "react";
import type { usePlansData } from "./usePlansData";
import {
  CURRENCIES,
  MAX_BATCH_ITEMS,
  createFeatureDraft,
  createPlanDraft,
  createPricingSectionDraft,
  deriveDiscountFromEffective,
  parseNumericInput,
  sanitizeSlug,
} from "../utils";
import type {
  EditPricingRow,
  FeatureDraft,
  Plan,
  PlanDraft,
  PricingSectionDraft,
  RolloutMode,
} from "../types";

/**
 * All dialog-local UI state for the 5 plan/pricing dialogs (create plans,
 * edit plan, create pricing, edit pricing, delete plan), plus the open/
 * update/validate helpers that used to live directly on PlansPage. Kept as
 * one hook (not split per-dialog) because several helpers here are tiny
 * (one-line open/update functions) and splitting them further would mean
 * more prop plumbing than code.
 *
 * Note (preserved behavior, not introduced by this split): the "create
 * plans", "create pricing", and "delete plan" dialogs are fully wired here
 * and rendered by PlansPage, but nothing in the current UI calls their
 * `open*` functions — the product now configures one base subscription
 * instead of a multi-plan catalog. This was already true before the split.
 */
export function usePlanDialogs(data: ReturnType<typeof usePlansData>) {
  const { plans, remainingPlanSlots, recommendedPlanId, limitsByPlan, featuresByPlan, activePricingByPlan, plansWithoutActivePricing } = data;

  // ---- Create plans ----
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createPlanDrafts, setCreatePlanDrafts] = useState<PlanDraft[]>([]);
  const [createPlanAccordion, setCreatePlanAccordion] = useState<string[]>([]);

  const openCreatePlansDialog = () => {
    if (remainingPlanSlots <= 0) {
      return;
    }
    const nextDisplayOrder =
      plans && plans.length ? Math.max(...plans.map((item) => item.display_order)) + 1 : 1;
    const initialDraft = createPlanDraft(nextDisplayOrder);
    setCreatePlanDrafts([initialDraft]);
    setCreatePlanAccordion([initialDraft.localId]);
    setCreatePlanOpen(true);
  };

  const addCreatePlanDraft = () => {
    const maxCanAdd = Math.min(MAX_BATCH_ITEMS, remainingPlanSlots);
    if (createPlanDrafts.length >= maxCanAdd) return;
    const maxDisplayOrder =
      Math.max(
        ...(plans || []).map((plan) => plan.display_order),
        ...createPlanDrafts.map((draft) => draft.display_order),
        0,
      ) + 1;
    const draft = createPlanDraft(maxDisplayOrder);
    setCreatePlanDrafts((prev) => [...prev, draft]);
    setCreatePlanAccordion((prev) => [...prev, draft.localId]);
  };

  const removeCreatePlanDraft = (localId: string) => {
    setCreatePlanDrafts((prev) => prev.filter((draft) => draft.localId !== localId));
    setCreatePlanAccordion((prev) => prev.filter((id) => id !== localId));
  };

  const updateCreatePlanDraft = <K extends keyof PlanDraft>(
    localId: string,
    field: K,
    value: PlanDraft[K],
  ) => {
    setCreatePlanDrafts((prev) =>
      prev.map((draft) => {
        if (draft.localId !== localId) return draft;
        const nextDraft = { ...draft, [field]: value };
        if (field === "name" && !draft.slug.trim()) {
          nextDraft.slug = sanitizeSlug(String(value));
        }
        if (field === "slug") {
          nextDraft.slug = sanitizeSlug(String(value));
        }
        return nextDraft;
      }),
    );
  };

  const addDraftFeature = (localId: string) => {
    setCreatePlanDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === localId
          ? {
              ...draft,
              features: [...draft.features, createFeatureDraft(draft.features.length)],
            }
          : draft,
      ),
    );
  };

  const updateDraftFeature = (
    localId: string,
    featureLocalId: string,
    patch: Partial<FeatureDraft>,
  ) => {
    setCreatePlanDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === localId
          ? {
              ...draft,
              features: draft.features.map((feature) =>
                feature.localId === featureLocalId ? { ...feature, ...patch } : feature,
              ),
            }
          : draft,
      ),
    );
  };

  const removeDraftFeature = (localId: string, featureLocalId: string) => {
    setCreatePlanDrafts((prev) =>
      prev.map((draft) =>
        draft.localId === localId
          ? {
              ...draft,
              features: draft.features.filter((feature) => feature.localId !== featureLocalId),
            }
          : draft,
      ),
    );
  };

  const createPlansValidation = useMemo(() => {
    const errors: string[] = [];
    const drafts = createPlanDrafts;

    if (!drafts.length) {
      errors.push("Add at least one plan.");
      return { isValid: false, errors };
    }

    if (drafts.length > Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)) {
      errors.push("Too many plans in one batch.");
    }

    const nameSet = new Set<string>();
    const slugSet = new Set<string>();
    const existingNameSet = new Set((plans || []).map((p) => p.name.trim().toLowerCase()));
    const existingSlugSet = new Set((plans || []).map((p) => p.slug.trim().toLowerCase()));
    const recommendedCount = drafts.filter((draft) => draft.is_recommended).length;

    if (recommendedCount > 1) {
      errors.push("Only one new plan can be marked as recommended.");
    }

    drafts.forEach((draft, index) => {
      const n = index + 1;
      const name = draft.name.trim();
      const slug = sanitizeSlug(draft.slug);

      if (!name) errors.push(`Plan ${n}: name is required.`);
      if (!slug) errors.push(`Plan ${n}: slug is required.`);
      if (!draft.reason.trim()) errors.push(`Plan ${n}: reason is required.`);

      if (name) {
        const key = name.toLowerCase();
        if (nameSet.has(key)) errors.push(`Plan ${n}: duplicate name in batch.`);
        if (existingNameSet.has(key)) errors.push(`Plan ${n}: name already exists.`);
        nameSet.add(key);
      }

      if (slug) {
        const key = slug.toLowerCase();
        if (slugSet.has(key)) errors.push(`Plan ${n}: duplicate slug in batch.`);
        if (existingSlugSet.has(key)) errors.push(`Plan ${n}: slug already exists.`);
        slugSet.add(key);
      }

      const nonEmptyFeatures = draft.features.filter((feature) => feature.feature_text.trim());
      if (!nonEmptyFeatures.length) {
        errors.push(`Plan ${n}: add at least one feature.`);
      }
      const featureSet = new Set<string>();
      nonEmptyFeatures.forEach((feature) => {
        const key = feature.feature_text.trim().toLowerCase();
        if (featureSet.has(key)) {
          errors.push(`Plan ${n}: feature text must be unique (case-insensitive).`);
        }
        featureSet.add(key);
      });
    });

    return { isValid: errors.length === 0, errors };
  }, [createPlanDrafts, plans, remainingPlanSlots]);

  // ---- Edit (base) plan ----
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [editPlanDraft, setEditPlanDraft] = useState<PlanDraft | null>(null);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [editPlanRolloutMode, setEditPlanRolloutMode] = useState<RolloutMode>("now");
  const [editPlanRolloutAt, setEditPlanRolloutAt] = useState("");
  const editPlanSaveRef = useRef(false);

  const openEditPlanDialog = (plan: Plan) => {
    const planLimits = limitsByPlan.get(plan.id);
    const planFeatures = featuresByPlan.get(plan.id) || [];
    const draft: PlanDraft = {
      localId: crypto.randomUUID(),
      name: plan.name,
      slug: plan.slug,
      description: plan.description || "",
      display_order: plan.display_order,
      trial_days: plan.trial_days,
      is_active: plan.is_active,
      is_recommended: plan.is_recommended,
      max_locations: planLimits?.max_locations || 1,
      max_staff: planLimits?.max_staff || 1,
      max_services: planLimits?.max_services?.toString() || "",
      max_products: planLimits?.max_products?.toString() || "",
      max_packages: planLimits?.max_packages?.toString() || "",
      max_vouchers: planLimits?.max_vouchers?.toString() || "",
      monthly_messages: planLimits?.monthly_messages || 30,
      reason: "",
      features:
        planFeatures.length > 0
          ? planFeatures.map((feature) => ({
              localId: crypto.randomUUID(),
              id: feature.id,
              feature_text: feature.feature_text,
              sort_order: feature.sort_order,
            }))
          : [createFeatureDraft(0)],
    };

    setEditPlanId(plan.id);
    setEditPlanDraft(draft);
    setEditPlanRolloutMode("now");
    setEditPlanRolloutAt("");
    setEditPlanOpen(true);
  };

  const validateEditPlan = () => {
    const errors: string[] = [];
    if (!editPlanDraft || !editPlanId) return { isValid: false, errors: ["Plan form is empty."] };

    const name = editPlanDraft.name.trim().toLowerCase();
    if (!name) errors.push("Name is required.");
    if (!editPlanDraft.reason.trim()) errors.push("Reason is required.");
    if (editPlanRolloutMode === "schedule" && !editPlanRolloutAt) {
      errors.push("Scheduled rollout requires date and time.");
    }

    const duplicateName = (plans || []).some(
      (plan) => plan.id !== editPlanId && plan.name.trim().toLowerCase() === name,
    );
    if (duplicateName) errors.push("Plan name already exists.");

    const hasFeature = editPlanDraft.features.some((feature) => feature.feature_text.trim());
    if (!hasFeature) errors.push("Add at least one feature.");
    const featureSet = new Set<string>();
    editPlanDraft.features
      .filter((feature) => feature.feature_text.trim())
      .forEach((feature) => {
        const key = feature.feature_text.trim().toLowerCase();
        if (featureSet.has(key)) {
          errors.push("Feature text must be unique per plan (case-insensitive).");
        }
        featureSet.add(key);
      });

    return { isValid: errors.length === 0, errors };
  };

  const editPlanValidation = validateEditPlan();

  // ---- Create pricing ----
  const [createPricingOpen, setCreatePricingOpen] = useState(false);
  const [createPricingSections, setCreatePricingSections] = useState<PricingSectionDraft[]>([]);
  const [createPricingReason, setCreatePricingReason] = useState("");
  const [createPricingAccordion, setCreatePricingAccordion] = useState<string[]>([]);

  const openCreatePricingDialog = () => {
    if (plansWithoutActivePricing.length === 0) {
      return;
    }
    const section = createPricingSectionDraft();
    setCreatePricingSections([section]);
    setCreatePricingReason("");
    setCreatePricingAccordion([section.localId]);
    setCreatePricingOpen(true);
  };

  const addPricingSection = () => {
    if (createPricingSections.length >= MAX_BATCH_ITEMS) return;
    const section = createPricingSectionDraft();
    setCreatePricingSections((prev) => [...prev, section]);
    setCreatePricingAccordion((prev) => [...prev, section.localId]);
  };

  const removePricingSection = (localId: string) => {
    setCreatePricingSections((prev) => prev.filter((section) => section.localId !== localId));
    setCreatePricingAccordion((prev) => prev.filter((id) => id !== localId));
  };

  const updatePricingSection = (
    localId: string,
    updater: (section: PricingSectionDraft) => PricingSectionDraft,
  ) => {
    setCreatePricingSections((prev) =>
      prev.map((section) => (section.localId === localId ? updater(section) : section)),
    );
  };

  const getAvailablePlansForSection = (localId: string) => {
    const selectedElsewhere = new Set(
      createPricingSections
        .filter((section) => section.localId !== localId && section.plan_id)
        .map((section) => section.plan_id),
    );
    return plansWithoutActivePricing.filter((plan) => !selectedElsewhere.has(plan.id));
  };

  const createPricingValidation = useMemo(() => {
    const errors: string[] = [];

    if (!createPricingSections.length) {
      errors.push("Add at least one pricing section.");
      return { isValid: false, errors };
    }

    if (!createPricingReason.trim()) {
      errors.push("Reason is required.");
    }

    const selectedPlanIds = new Set<string>();
    let enabledRowCount = 0;

    createPricingSections.forEach((section, idx) => {
      const sectionNumber = idx + 1;
      if (!section.plan_id) {
        errors.push(`Section ${sectionNumber}: select a plan.`);
      } else {
        if (selectedPlanIds.has(section.plan_id)) {
          errors.push(`Section ${sectionNumber}: plan is duplicated in this batch.`);
        }
        selectedPlanIds.add(section.plan_id);
      }

      let sectionHasEnabledRow = false;
      CURRENCIES.forEach((currency) => {
        const row = section.currencies[currency];
        if (!row.enabled) return;

        enabledRowCount += 1;
        sectionHasEnabledRow = true;

        const monthly = parseNumericInput(row.monthly_price);
        const discount = parseNumericInput(row.annual_discount_pct || "0");

        if (!Number.isFinite(monthly) || monthly < 0) {
          errors.push(`Section ${sectionNumber} ${currency}: monthly price must be 0 or greater.`);
        }

        if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
          errors.push(`Section ${sectionNumber} ${currency}: annual discount must be between 0 and 100.`);
        }
      });

      if (!sectionHasEnabledRow) {
        errors.push(`Section ${sectionNumber}: enable at least one currency row.`);
      }
    });

    if (enabledRowCount === 0) {
      errors.push("Enable at least one pricing row.");
    }

    return { isValid: errors.length === 0, errors };
  }, [createPricingReason, createPricingSections]);

  // ---- Edit (base) pricing ----
  const [editPricingOpen, setEditPricingOpen] = useState(false);
  const [editPricingPlanId, setEditPricingPlanId] = useState<string | null>(null);
  const [editPricingRows, setEditPricingRows] = useState<EditPricingRow[]>([]);
  const [editPricingReason, setEditPricingReason] = useState("");
  const [editPricingRolloutMode, setEditPricingRolloutMode] = useState<RolloutMode>("now");
  const [editPricingRolloutAt, setEditPricingRolloutAt] = useState("");

  const openEditPricingDialog = (plan: Plan) => {
    const pricingRows = activePricingByPlan.get(plan.id);
    if (!pricingRows || pricingRows.size === 0) {
      return;
    }

    const rows = CURRENCIES.filter((currency) => pricingRows.has(currency)).map((currency) => {
      const row = pricingRows.get(currency)!;
      const discount = deriveDiscountFromEffective(row.monthly_price, row.effective_monthly);
      return {
        id: row.id,
        currency,
        monthly_price: String(row.monthly_price),
        annual_discount_pct: String(discount),
      } satisfies EditPricingRow;
    });

    setEditPricingPlanId(plan.id);
    setEditPricingRows(rows);
    setEditPricingReason("");
    setEditPricingRolloutMode("now");
    setEditPricingRolloutAt("");
    setEditPricingOpen(true);
  };

  const editPricingValidation = useMemo(() => {
    const errors: string[] = [];
    if (!editPricingPlanId) errors.push("Missing plan.");
    if (!editPricingReason.trim()) errors.push("Reason is required.");
    if (editPricingRolloutMode === "schedule" && !editPricingRolloutAt) {
      errors.push("Scheduled rollout requires a go-live date and time.");
    }

    editPricingRows.forEach((row) => {
      const monthly = parseNumericInput(row.monthly_price);
      const discount = parseNumericInput(row.annual_discount_pct || "0");
      if (!Number.isFinite(monthly) || monthly < 0) {
        errors.push(`${row.currency}: monthly price must be 0 or greater.`);
      }
      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        errors.push(`${row.currency}: annual discount must be between 0 and 100.`);
      }
    });

    return { isValid: errors.length === 0, errors };
  }, [editPricingPlanId, editPricingReason, editPricingRows, editPricingRolloutMode, editPricingRolloutAt]);

  // ---- Delete plan ----
  const [deletePlanOpen, setDeletePlanOpen] = useState(false);
  const [deletePlanTarget, setDeletePlanTarget] = useState<Plan | null>(null);
  const [deletePlanReason, setDeletePlanReason] = useState("");
  const [deletePlanTotp, setDeletePlanTotp] = useState("");

  const openDeletePlanDialog = (plan: Plan) => {
    setDeletePlanTarget(plan);
    setDeletePlanReason("");
    setDeletePlanTotp("");
    setDeletePlanOpen(true);
  };

  return {
    createPlanOpen,
    setCreatePlanOpen,
    createPlanDrafts,
    createPlanAccordion,
    setCreatePlanAccordion,
    openCreatePlansDialog,
    addCreatePlanDraft,
    removeCreatePlanDraft,
    updateCreatePlanDraft,
    addDraftFeature,
    updateDraftFeature,
    removeDraftFeature,
    createPlansValidation,

    editPlanOpen,
    setEditPlanOpen,
    editPlanDraft,
    setEditPlanDraft,
    editPlanId,
    editPlanRolloutMode,
    setEditPlanRolloutMode,
    editPlanRolloutAt,
    setEditPlanRolloutAt,
    editPlanSaveRef,
    openEditPlanDialog,
    editPlanValidation,

    createPricingOpen,
    setCreatePricingOpen,
    createPricingSections,
    createPricingReason,
    setCreatePricingReason,
    createPricingAccordion,
    setCreatePricingAccordion,
    openCreatePricingDialog,
    addPricingSection,
    removePricingSection,
    updatePricingSection,
    getAvailablePlansForSection,
    createPricingValidation,

    editPricingOpen,
    setEditPricingOpen,
    editPricingPlanId,
    editPricingRows,
    setEditPricingRows,
    editPricingReason,
    setEditPricingReason,
    editPricingRolloutMode,
    setEditPricingRolloutMode,
    editPricingRolloutAt,
    setEditPricingRolloutAt,
    openEditPricingDialog,
    editPricingValidation,

    deletePlanOpen,
    setDeletePlanOpen,
    deletePlanTarget,
    deletePlanReason,
    setDeletePlanReason,
    deletePlanTotp,
    setDeletePlanTotp,
    openDeletePlanDialog,
  };
}
