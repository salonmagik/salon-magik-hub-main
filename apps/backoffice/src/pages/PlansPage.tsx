import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ui/accordion";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { Switch } from "@ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Textarea } from "@ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";

type CurrencyCode = "USD" | "NGN" | "GHS";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_recommended: boolean;
  trial_days: number;
}

interface PlanPricing {
  id: string;
  plan_id: string;
  currency: CurrencyCode;
  monthly_price: number;
  annual_price: number;
  effective_monthly: number;
}

interface PlanLimit {
  id: string;
  plan_id: string;
  max_locations: number;
  max_staff: number;
  max_services: number | null;
  max_products: number | null;
  monthly_messages: number;
}

interface PlanFeature {
  id: string;
  plan_id: string;
  feature_text: string;
  sort_order: number;
}

interface FeatureDraft {
  localId: string;
  id?: string;
  feature_text: string;
  sort_order: number;
}

interface PlanDraft {
  localId: string;
  name: string;
  slug: string;
  description: string;
  display_order: number;
  trial_days: number;
  is_active: boolean;
  is_recommended: boolean;
  max_locations: number;
  max_staff: number;
  max_services: string;
  max_products: string;
  monthly_messages: number;
  reason: string;
  features: FeatureDraft[];
}

interface PricingCurrencyDraft {
  enabled: boolean;
  monthly_price: string;
  annual_discount_pct: string;
}

interface PricingSectionDraft {
  localId: string;
  plan_id: string;
  currencies: Record<CurrencyCode, PricingCurrencyDraft>;
}

interface EditPricingRow {
  id: string;
  currency: CurrencyCode;
  monthly_price: string;
  annual_discount_pct: string;
}

type RolloutMode = "now" | "schedule";

const CURRENCIES: CurrencyCode[] = ["USD", "NGN", "GHS"];
const MAX_PLANS = 4;
const MAX_BATCH_ITEMS = 3;

const sanitizeSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const parseNumericInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const toFixedNumber = (value: number) => Number(value.toFixed(2));

const deriveEffectiveMonthly = (monthly: number, annualDiscountPct: number) =>
  toFixedNumber(monthly * (1 - annualDiscountPct / 100));

const deriveAnnualTotal = (effectiveMonthly: number) =>
  toFixedNumber(effectiveMonthly * 12);

const deriveDiscountFromEffective = (monthly: number, effectiveMonthly: number) => {
  if (monthly <= 0) return 0;
  const pct = ((monthly - effectiveMonthly) / monthly) * 100;
  if (!Number.isFinite(pct)) return 0;
  return toFixedNumber(Math.max(0, Math.min(100, pct)));
};

const createFeatureDraft = (sortOrder = 0): FeatureDraft => ({
  localId: crypto.randomUUID(),
  feature_text: "",
  sort_order: sortOrder,
});

const createPlanDraft = (displayOrder: number): PlanDraft => ({
  localId: crypto.randomUUID(),
  name: "",
  slug: "",
  description: "",
  display_order: displayOrder,
  trial_days: 14,
  is_active: true,
  is_recommended: false,
  max_locations: 1,
  max_staff: 1,
  max_services: "",
  max_products: "",
  monthly_messages: 30,
  reason: "",
  features: [createFeatureDraft(0)],
});

const createPricingSectionDraft = (): PricingSectionDraft => ({
  localId: crypto.randomUUID(),
  plan_id: "",
  currencies: {
    USD: { enabled: true, monthly_price: "", annual_discount_pct: "" },
    NGN: { enabled: true, monthly_price: "", annual_discount_pct: "" },
    GHS: { enabled: true, monthly_price: "", annual_discount_pct: "" },
  },
});

const errorToMessage = (error: unknown) => {
  if (!error || typeof error !== "object") return "An unexpected error occurred.";
  const code = String((error as { code?: string }).code || "");
  const message = String((error as { message?: string }).message || "");
  const details = String((error as { details?: string }).details || "");
  const normalized = `${code} ${message} ${details}`.toLowerCase();

  if (normalized.includes("plan_cap_reached")) {
    return "Maximum of 4 plans reached.";
  }

  if (
    normalized.includes("idx_plans_name_lower_unique") ||
    normalized.includes("idx_plans_slug_lower_unique") ||
    normalized.includes("duplicate key")
  ) {
    return "Plan name or slug already exists.";
  }

  if (
    normalized.includes("idx_plan_features_plan_feature_text_ci_unique") ||
    normalized.includes("feature text must be unique")
  ) {
    return "Feature text must be unique per plan (case-insensitive).";
  }

  if (normalized.includes("idx_plan_pricing_active_unique")) {
    return "Pricing already exists for this plan/currency. Edit existing pricing instead.";
  }

  if (normalized.includes("idx_plans_single_recommended_true")) {
    return "Only one plan can be recommended at a time.";
  }

  if (normalized.includes("step_up")) {
    return "Step-up verification failed. Enter a valid 2FA code and try again.";
  }

  return message || "An unexpected error occurred.";
};

export default function PlansPage() {
  const queryClient = useQueryClient();
  const { backofficeUser } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createPlanDrafts, setCreatePlanDrafts] = useState<PlanDraft[]>([]);
  const [createPlanAccordion, setCreatePlanAccordion] = useState<string[]>([]);

  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [editPlanDraft, setEditPlanDraft] = useState<PlanDraft | null>(null);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [editPlanRolloutMode, setEditPlanRolloutMode] = useState<RolloutMode>("now");
  const [editPlanRolloutAt, setEditPlanRolloutAt] = useState("");

  const [createPricingOpen, setCreatePricingOpen] = useState(false);
  const [createPricingSections, setCreatePricingSections] = useState<PricingSectionDraft[]>([]);
  const [createPricingReason, setCreatePricingReason] = useState("");
  const [createPricingAccordion, setCreatePricingAccordion] = useState<string[]>([]);

  const [editPricingOpen, setEditPricingOpen] = useState(false);
  const [editPricingPlanId, setEditPricingPlanId] = useState<string | null>(null);
  const [editPricingRows, setEditPricingRows] = useState<EditPricingRow[]>([]);
  const [editPricingReason, setEditPricingReason] = useState("");
  const editPlanSaveRef = useRef(false);
  const [deletePlanOpen, setDeletePlanOpen] = useState(false);
  const [deletePlanTarget, setDeletePlanTarget] = useState<Plan | null>(null);
  const [deletePlanReason, setDeletePlanReason] = useState("");
  const [deletePlanTotp, setDeletePlanTotp] = useState("");

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
      return (data || []) as PlanPricing[];
    },
  });

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

  const planCount = plans?.length || 0;
  const remainingPlanSlots = Math.max(0, MAX_PLANS - planCount);

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
  ) => {
    const plan = (plans || []).find((item) => item.id === planId);
    if (!plan) return;
    const planLimit = limitsByPlan.get(planId);
    const planFeatures = (featuresByPlan.get(planId) || []).map((feature) => ({
      feature_text: feature.feature_text,
      sort_order: feature.sort_order,
    }));
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
        monthly_messages: planLimit?.monthly_messages || 30,
      },
      p_pricing_json: pricingRows,
      p_change_summary_json: {
        plan_name: plan.name,
        changes: ["pricing"],
        features: planFeatures,
      },
      p_rollout_mode: "now",
      p_rollout_at: null,
    });
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
          monthly_messages: draft.monthly_messages,
        });
        if (limitsError) throw limitsError;

        const featureRows = draft.features
          .filter((feature) => feature.feature_text.trim())
          .map((feature) => ({
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
      setCreatePlanOpen(false);
      setCreatePlanDrafts([]);
      setCreatePlanAccordion([]);
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ planId, draft }: { planId: string; draft: PlanDraft }) => {
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

      const rolloutAt =
        editPlanRolloutMode === "schedule" && editPlanRolloutAt
          ? new Date(editPlanRolloutAt).toISOString()
          : null;

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
          monthly_messages: draft.monthly_messages,
        },
        p_pricing_json: pricingRows,
        p_change_summary_json: {
          plan_name: draft.name.trim(),
          changes: ["plan_core", "plan_limits", "plan_features"],
          features: featurePayload,
        },
        p_rollout_mode: editPlanRolloutMode,
        p_rollout_at: rolloutAt,
      });
      if (error) throw error;
      return data;
    },
    onMutate: () => {
      editPlanSaveRef.current = true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-plans"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-plan-features"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
      toast.success(editPlanRolloutMode === "schedule" ? "Plan changes scheduled." : "Plan changes rolled out.");
      setEditPlanOpen(false);
      setEditPlanDraft(null);
      setEditPlanId(null);
      setEditPlanRolloutMode("now");
      setEditPlanRolloutAt("");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
    onSettled: () => {
      editPlanSaveRef.current = false;
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
      setDeletePlanOpen(false);
      setDeletePlanTarget(null);
      setDeletePlanReason("");
      setDeletePlanTotp("");
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
      setCreatePricingOpen(false);
      setCreatePricingSections([]);
      setCreatePricingReason("");
      setCreatePricingAccordion([]);
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
    }: {
      planId: string;
      rows: EditPricingRow[];
      reason: string;
    }) => {
      const changedRows: Array<{
        currency: CurrencyCode;
        monthly_price: number;
        effective_monthly: number;
        annual_price: number;
      }> = [];
      for (const row of rows) {
        const monthly = parseNumericInput(row.monthly_price);
        const annualDiscountPct = parseNumericInput(row.annual_discount_pct || "0");
        const effectiveMonthly = deriveEffectiveMonthly(monthly, annualDiscountPct);
        const annualTotal = deriveAnnualTotal(effectiveMonthly);

        const { error } = await supabase
          .from("plan_pricing")
          .update({
            monthly_price: toFixedNumber(monthly),
            effective_monthly: effectiveMonthly,
            annual_price: annualTotal,
          })
          .eq("id", row.id);
        if (error) throw error;

        changedRows.push({
          currency: row.currency,
          monthly_price: toFixedNumber(monthly),
          effective_monthly: effectiveMonthly,
          annual_price: annualTotal,
        });
      }

      await createPlanChangeBatchForPricing(planId, reason.trim(), changedRows);

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "pricing_updated",
        entity_type: "plan_pricing",
        actor_user_id: backofficeUser?.user_id,
        metadata: {
          reason: reason.trim(),
          plan_id: planId,
          currencies: rows.map((row) => row.currency),
        },
      });
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
      toast.success("Pricing updated successfully.");
      setEditPricingOpen(false);
      setEditPricingPlanId(null);
      setEditPricingRows([]);
      setEditPricingReason("");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

  const openCreatePlansDialog = () => {
    if (remainingPlanSlots <= 0) {
      toast.error("Maximum of 4 plans reached.");
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

  const openDeletePlanDialog = (plan: Plan) => {
    setDeletePlanTarget(plan);
    setDeletePlanReason("");
    setDeletePlanTotp("");
    setDeletePlanOpen(true);
  };

  const openEditPricingDialog = (plan: Plan) => {
    const pricingRows = activePricingByPlan.get(plan.id);
    if (!pricingRows || pricingRows.size === 0) {
      toast.error("No active pricing found for this plan.");
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
    setEditPricingOpen(true);
  };

  const openCreatePricingDialog = () => {
    if (plansWithoutActivePricing.length === 0) {
      toast.error("All plans already have active pricing.");
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

  const canSubmitCreatePlans =
    isSuperAdmin && createPlansValidation.isValid && !createPlansMutation.isPending;
  const canSubmitCreatePricing =
    isSuperAdmin && createPricingValidation.isValid && !createPricingMutation.isPending;

  const validateEditPlan = () => {
    const errors: string[] = [];
    if (!editPlanDraft || !editPlanId) return { isValid: false, errors: ["Plan form is empty."] };

    const name = editPlanDraft.name.trim().toLowerCase();
    const slug = sanitizeSlug(editPlanDraft.slug).toLowerCase();

    if (!name) errors.push("Name is required.");
    if (!slug) errors.push("Slug is required.");
    if (!editPlanDraft.reason.trim()) errors.push("Reason is required.");
    if (editPlanRolloutMode === "schedule" && !editPlanRolloutAt) {
      errors.push("Scheduled rollout requires date and time.");
    }

    const duplicateName = (plans || []).some(
      (plan) => plan.id !== editPlanId && plan.name.trim().toLowerCase() === name,
    );
    if (duplicateName) errors.push("Plan name already exists.");

    const duplicateSlug = (plans || []).some(
      (plan) => plan.id !== editPlanId && plan.slug.trim().toLowerCase() === slug,
    );
    if (duplicateSlug) errors.push("Plan slug already exists.");

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

  const canSubmitEditPlan =
    isSuperAdmin && editPlanValidation.isValid && !updatePlanMutation.isPending;

  const editPricingValidation = useMemo(() => {
    const errors: string[] = [];
    if (!editPricingPlanId) errors.push("Missing plan.");
    if (!editPricingReason.trim()) errors.push("Reason is required.");

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
  }, [editPricingPlanId, editPricingReason, editPricingRows]);

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Plans & Pricing</h1>
            <p className="text-sm text-muted-foreground">
              Manage plan catalog, pricing, limits, and display features.
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={openCreatePlansDialog} disabled={remainingPlanSlots <= 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add Plans
              </Button>
              <Button variant="outline" onClick={openCreatePricingDialog}>
                <DollarSign className="mr-2 h-4 w-4" />
                Add Pricing
              </Button>
            </div>
          )}
        </div>

        <Card className="border-dashed">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                Plans {planCount}/{MAX_PLANS}
              </Badge>
              <Badge variant="secondary">
                Remaining slots: {remainingPlanSlots}
              </Badge>
              <Badge variant="secondary">
                Without active pricing: {plansWithoutActivePricing.length}
              </Badge>
              {recommendedPlanId ? (
                <Badge variant="default">
                  Recommended: {getPlanName(recommendedPlanId)}
                </Badge>
              ) : (
                <Badge variant="outline">No recommended plan set</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {!isSuperAdmin && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  You have read-only access. Super Admin role is required for changes.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="plans">
          <TabsList>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="pricing">Pricing Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="mt-4">
            {isLoading ? (
              <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
                Loading plans...
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(plans || []).map((plan) => {
                  const limit = limitsByPlan.get(plan.id);
                  const planFeatures = featuresByPlan.get(plan.id) || [];
                  const activePricing = activePricingByPlan.get(plan.id);

                  return (
                    <Card key={plan.id} className={plan.is_recommended ? "border-primary" : ""}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                            <CardDescription>{plan.description || "No description"}</CardDescription>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {plan.is_recommended && <Badge>Recommended</Badge>}
                            {!plan.is_active && <Badge variant="secondary">Inactive</Badge>}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Slug</p>
                            <p className="font-medium">{plan.slug}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Display Order</p>
                            <p className="font-medium">{plan.display_order}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Trial</p>
                            <p className="font-medium">{plan.trial_days} days</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Currencies</p>
                            <p className="font-medium">{activePricing?.size || 0}/3 active</p>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-1 text-sm">
                          <p className="font-medium">Limits</p>
                          <p className="text-muted-foreground">
                            {limit?.max_locations || 1} locations · {limit?.max_staff || 1} staff ·{" "}
                            {limit?.monthly_messages || 30} messages/mo
                          </p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">Features</p>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {planFeatures.slice(0, 4).map((feature) => (
                              <li key={feature.id} className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                <span>{feature.feature_text}</span>
                              </li>
                            ))}
                            {planFeatures.length === 0 && <li>No features configured.</li>}
                          </ul>
                        </div>

                        {isSuperAdmin && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditPlanDialog(plan)}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Edit Plan
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditPricingDialog(plan)}
                              disabled={!activePricing || activePricing.size === 0}
                            >
                              <DollarSign className="mr-2 h-3.5 w-3.5" />
                              Edit Pricing
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeletePlanDialog(plan)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete Plan
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pricing" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Pricing</CardTitle>
                <CardDescription>One active row per plan/currency.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      {CURRENCIES.map((currency) => (
                        <TableHead key={currency}>{currency}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(plans || []).map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        {CURRENCIES.map((currency) => {
                          const row = activePricingByPlan.get(plan.id)?.get(currency);
                          return (
                            <TableCell key={currency}>
                              {row ? (
                                <div className="text-sm">
                                  <p>
                                    {getCurrencySymbol(currency)}
                                    {row.monthly_price.toLocaleString()}/mo
                                  </p>
                                  <p className="text-muted-foreground">
                                    annual {getCurrencySymbol(currency)}
                                    {row.annual_price.toLocaleString()}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
        <DialogContent className="sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>Add Plans</DialogTitle>
            <DialogDescription>
              Create up to {Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)} plans in one submission.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Batch size: {createPlanDrafts.length}/{Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCreatePlanDraft}
                disabled={createPlanDrafts.length >= Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add section
              </Button>
            </div>

            {createPlansValidation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Fix these issues:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
                  {createPlansValidation.errors.slice(0, 6).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <Accordion
              type="multiple"
              value={createPlanAccordion}
              onValueChange={setCreatePlanAccordion}
              className="space-y-3"
            >
              {createPlanDrafts.map((draft, index) => {
                const recommendedLocked = Boolean(recommendedPlanId);
                const recommendedDraftId =
                  createPlanDrafts.find((item) => item.is_recommended)?.localId || null;
                const canToggleRecommended =
                  !recommendedLocked &&
                  (!recommendedDraftId ||
                    recommendedDraftId === draft.localId ||
                    draft.is_recommended);
                return (
                  <AccordionItem key={draft.localId} value={draft.localId} className="rounded-md border px-4">
                    <AccordionTrigger>
                      <div className="flex flex-wrap items-center gap-2 text-left">
                        <span className="font-medium">Plan {index + 1}</span>
                        <Badge variant={draft.name.trim() ? "default" : "outline"}>
                          {draft.name.trim() || "Untitled"}
                        </Badge>
                        <Badge variant="secondary">{draft.slug.trim() || "no-slug"}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pb-2">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <Label>Name</Label>
                            <Input
                              value={draft.name}
                              onChange={(event) =>
                                updateCreatePlanDraft(draft.localId, "name", event.target.value)
                              }
                              placeholder="Solo"
                            />
                          </div>
                          <div>
                            <Label>Slug</Label>
                            <Input
                              value={draft.slug}
                              onChange={(event) =>
                                updateCreatePlanDraft(draft.localId, "slug", event.target.value)
                              }
                              placeholder="solo"
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Description</Label>
                          <Textarea
                            value={draft.description}
                            onChange={(event) =>
                              updateCreatePlanDraft(draft.localId, "description", event.target.value)
                            }
                            placeholder="Short plan description"
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <Label>Display Order</Label>
                            <Input
                              type="number"
                              value={draft.display_order}
                              onChange={(event) =>
                                updateCreatePlanDraft(
                                  draft.localId,
                                  "display_order",
                                  Number(event.target.value || 0),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Trial Days</Label>
                            <Input
                              type="number"
                              value={draft.trial_days}
                              onChange={(event) =>
                                updateCreatePlanDraft(
                                  draft.localId,
                                  "trial_days",
                                  Number(event.target.value || 0),
                                )
                              }
                            />
                          </div>
                          <div className="flex items-end gap-4 pb-2">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={draft.is_active}
                                onCheckedChange={(checked) =>
                                  updateCreatePlanDraft(draft.localId, "is_active", checked)
                                }
                              />
                              <Label>Active</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={draft.is_recommended}
                                onCheckedChange={(checked) =>
                                  updateCreatePlanDraft(draft.localId, "is_recommended", checked)
                                }
                                disabled={!canToggleRecommended}
                              />
                              <Label>Recommended</Label>
                            </div>
                          </div>
                        </div>

                        {recommendedPlanId && (
                          <p className="text-xs text-muted-foreground">
                            Recommended is locked to {getPlanName(recommendedPlanId)}. Unset it there first.
                          </p>
                        )}

                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <Label>Max Locations</Label>
                            <Input
                              type="number"
                              value={draft.max_locations}
                              onChange={(event) =>
                                updateCreatePlanDraft(
                                  draft.localId,
                                  "max_locations",
                                  Number(event.target.value || 0),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Max Staff</Label>
                            <Input
                              type="number"
                              value={draft.max_staff}
                              onChange={(event) =>
                                updateCreatePlanDraft(
                                  draft.localId,
                                  "max_staff",
                                  Number(event.target.value || 0),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Monthly Messages</Label>
                            <Input
                              type="number"
                              value={draft.monthly_messages}
                              onChange={(event) =>
                                updateCreatePlanDraft(
                                  draft.localId,
                                  "monthly_messages",
                                  Number(event.target.value || 0),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Max Services (optional)</Label>
                            <Input
                              type="number"
                              value={draft.max_services}
                              onChange={(event) =>
                                updateCreatePlanDraft(draft.localId, "max_services", event.target.value)
                              }
                            />
                          </div>
                          <div>
                            <Label>Max Products (optional)</Label>
                            <Input
                              type="number"
                              value={draft.max_products}
                              onChange={(event) =>
                                updateCreatePlanDraft(draft.localId, "max_products", event.target.value)
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Plan Features</Label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => addDraftFeature(draft.localId)}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Add feature
                            </Button>
                          </div>

                          <div className="space-y-2">
                            {draft.features.map((feature) => (
                              <div key={feature.localId} className="grid gap-2 md:grid-cols-[1fr_120px_80px]">
                                <Input
                                  value={feature.feature_text}
                                  onChange={(event) =>
                                    updateDraftFeature(draft.localId, feature.localId, {
                                      feature_text: event.target.value,
                                    })
                                  }
                                  placeholder="Feature text"
                                />
                                <Input
                                  type="number"
                                  value={feature.sort_order}
                                  onChange={(event) =>
                                    updateDraftFeature(draft.localId, feature.localId, {
                                      sort_order: Number(event.target.value || 0),
                                    })
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => removeDraftFeature(draft.localId, feature.localId)}
                                  disabled={draft.features.length === 1}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <Label>Reason</Label>
                          <Textarea
                            value={draft.reason}
                            onChange={(event) =>
                              updateCreatePlanDraft(draft.localId, "reason", event.target.value)
                            }
                            placeholder="Why are you adding this plan?"
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCreatePlanDraft(draft.localId)}
                            disabled={createPlanDrafts.length <= 1}
                          >
                            Remove section
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePlanOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createPlansMutation.mutate(createPlanDrafts)}
              disabled={!canSubmitCreatePlans}
            >
              {createPlansMutation.isPending ? "Saving..." : "Save Plans"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editPlanOpen} onOpenChange={setEditPlanOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>Update plan fields, limits, and display features.</DialogDescription>
          </DialogHeader>

          {editPlanDraft && (
            <div className="space-y-4">
              {editPlanValidation.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                    {editPlanValidation.errors.slice(0, 6).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editPlanDraft.name}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              name: event.target.value,
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Slug</Label>
                  <Input
                    value={editPlanDraft.slug}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              slug: sanitizeSlug(event.target.value),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={editPlanDraft.description}
                  onChange={(event) =>
                    setEditPlanDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            description: event.target.value,
                          }
                        : prev,
                    )
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.display_order}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              display_order: Number(event.target.value || 0),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Trial Days</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.trial_days}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              trial_days: Number(event.target.value || 0),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="flex items-end gap-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editPlanDraft.is_active}
                      onCheckedChange={(checked) =>
                        setEditPlanDraft((prev) => (prev ? { ...prev, is_active: checked } : prev))
                      }
                    />
                    <Label>Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editPlanDraft.is_recommended}
                      onCheckedChange={(checked) =>
                        setEditPlanDraft((prev) =>
                          prev ? { ...prev, is_recommended: checked } : prev,
                        )
                      }
                      disabled={Boolean(recommendedPlanId && recommendedPlanId !== editPlanId)}
                    />
                    <Label>Recommended</Label>
                  </div>
                </div>
              </div>

              {recommendedPlanId && recommendedPlanId !== editPlanId && (
                <p className="text-xs text-muted-foreground">
                  Recommended is currently locked to {getPlanName(recommendedPlanId)}.
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Max Locations</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.max_locations}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              max_locations: Number(event.target.value || 0),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Max Staff</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.max_staff}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              max_staff: Number(event.target.value || 0),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Monthly Messages</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.monthly_messages}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              monthly_messages: Number(event.target.value || 0),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Max Services (optional)</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.max_services}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev ? { ...prev, max_services: event.target.value } : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Max Products (optional)</Label>
                  <Input
                    type="number"
                    value={editPlanDraft.max_products}
                    onChange={(event) =>
                      setEditPlanDraft((prev) =>
                        prev ? { ...prev, max_products: event.target.value } : prev,
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Plan Features</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditPlanDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              features: [...prev.features, createFeatureDraft(prev.features.length)],
                            }
                          : prev,
                      )
                    }
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add feature
                  </Button>
                </div>
                <div className="space-y-2">
                  {editPlanDraft.features.map((feature) => (
                    <div key={feature.localId} className="grid gap-2 md:grid-cols-[1fr_120px_80px]">
                      <Input
                        value={feature.feature_text}
                        onChange={(event) =>
                          setEditPlanDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  features: prev.features.map((item) =>
                                    item.localId === feature.localId
                                      ? { ...item, feature_text: event.target.value }
                                      : item,
                                  ),
                                }
                              : prev,
                          )
                        }
                        placeholder="Feature text"
                      />
                      <Input
                        type="number"
                        value={feature.sort_order}
                        onChange={(event) =>
                          setEditPlanDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  features: prev.features.map((item) =>
                                    item.localId === feature.localId
                                      ? { ...item, sort_order: Number(event.target.value || 0) }
                                      : item,
                                  ),
                                }
                              : prev,
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setEditPlanDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  features: prev.features.filter(
                                    (item) => item.localId !== feature.localId,
                                  ),
                                }
                              : prev,
                          )
                        }
                        disabled={editPlanDraft.features.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Textarea
                  value={editPlanDraft.reason}
                  onChange={(event) =>
                    setEditPlanDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            reason: event.target.value,
                          }
                        : prev,
                    )
                  }
                  placeholder="Describe why this edit is needed."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Rollout</Label>
                  <Select
                    value={editPlanRolloutMode}
                    onValueChange={(value) => setEditPlanRolloutMode(value as RolloutMode)}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Roll out now</SelectItem>
                      <SelectItem value="schedule">Schedule rollout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editPlanRolloutMode === "schedule" && (
                  <div>
                    <Label>Rollout at</Label>
                    <Input
                      className="mt-2"
                      type="datetime-local"
                      value={editPlanRolloutAt}
                      onChange={(event) => setEditPlanRolloutAt(event.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (updatePlanMutation.isPending || editPlanSaveRef.current) return;
                if (!editPlanDraft || !editPlanId) return;
                updatePlanMutation.mutate({ planId: editPlanId, draft: editPlanDraft });
              }}
              disabled={!canSubmitEditPlan}
            >
              {updatePlanMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createPricingOpen} onOpenChange={setCreatePricingOpen}>
        <DialogContent className="sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>Add Pricing</DialogTitle>
            <DialogDescription>
              Configure pricing by plan and currency. Annual value is discount percent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Sections: {createPricingSections.length}/{MAX_BATCH_ITEMS}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPricingSection}
                disabled={createPricingSections.length >= MAX_BATCH_ITEMS}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add section
              </Button>
            </div>

            {createPricingValidation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {createPricingValidation.errors.slice(0, 6).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <Accordion
              type="multiple"
              value={createPricingAccordion}
              onValueChange={setCreatePricingAccordion}
              className="space-y-3"
            >
              {createPricingSections.map((section, index) => {
                const availablePlans = getAvailablePlansForSection(section.localId);
                const selectedPlanLabel = section.plan_id
                  ? getPlanName(section.plan_id)
                  : `Section ${index + 1}`;

                return (
                  <AccordionItem key={section.localId} value={section.localId} className="rounded-md border px-4">
                    <AccordionTrigger>
                      <div className="flex flex-wrap items-center gap-2 text-left">
                        <span className="font-medium">Pricing {index + 1}</span>
                        <Badge variant={section.plan_id ? "default" : "outline"}>
                          {selectedPlanLabel}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pb-2">
                        <div>
                          <Label>Plan</Label>
                          <Select
                            value={section.plan_id}
                            onValueChange={(value) =>
                              updatePricingSection(section.localId, (current) => ({
                                ...current,
                                plan_id: value,
                              }))
                            }
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                            <SelectContent>
                              {availablePlans.map((plan) => (
                                <SelectItem key={plan.id} value={plan.id}>
                                  {plan.name} {!plan.is_active ? "(Inactive)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          {CURRENCIES.map((currency) => {
                            const row = section.currencies[currency];
                            const monthly = parseNumericInput(row.monthly_price || "0");
                            const discount = parseNumericInput(row.annual_discount_pct || "0");
                            const effectiveMonthly =
                              Number.isFinite(monthly) && Number.isFinite(discount)
                                ? deriveEffectiveMonthly(monthly, Math.max(0, Math.min(100, discount)))
                                : 0;
                            const annualTotal = deriveAnnualTotal(effectiveMonthly);
                            return (
                              <div key={currency} className="rounded-md border p-3">
                                <div className="mb-3 flex items-center justify-between">
                                  <p className="font-medium">{currency}</p>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs text-muted-foreground">Enable</Label>
                                    <Switch
                                      checked={row.enabled}
                                      onCheckedChange={(checked) =>
                                        updatePricingSection(section.localId, (current) => ({
                                          ...current,
                                          currencies: {
                                            ...current.currencies,
                                            [currency]: { ...current.currencies[currency], enabled: checked },
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-4">
                                  <div>
                                    <Label>Monthly</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={row.monthly_price}
                                      disabled={!row.enabled}
                                      onChange={(event) =>
                                        updatePricingSection(section.localId, (current) => ({
                                          ...current,
                                          currencies: {
                                            ...current.currencies,
                                            [currency]: {
                                              ...current.currencies[currency],
                                              monthly_price: event.target.value,
                                            },
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label>Annual discount %</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={row.annual_discount_pct}
                                      disabled={!row.enabled}
                                      onChange={(event) =>
                                        updatePricingSection(section.localId, (current) => ({
                                          ...current,
                                          currencies: {
                                            ...current.currencies,
                                            [currency]: {
                                              ...current.currencies[currency],
                                              annual_discount_pct: event.target.value,
                                            },
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label>Effective monthly</Label>
                                    <Input
                                      value={Number.isFinite(effectiveMonthly) ? effectiveMonthly : 0}
                                      readOnly
                                      disabled
                                    />
                                  </div>
                                  <div>
                                    <Label>Annual total</Label>
                                    <Input
                                      value={Number.isFinite(annualTotal) ? annualTotal : 0}
                                      readOnly
                                      disabled
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removePricingSection(section.localId)}
                            disabled={createPricingSections.length <= 1}
                          >
                            Remove section
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            <div>
              <Label>Reason</Label>
              <Textarea
                value={createPricingReason}
                onChange={(event) => setCreatePricingReason(event.target.value)}
                placeholder="Why are you creating this pricing batch?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePricingOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createPricingMutation.mutate({
                  sections: createPricingSections,
                  reason: createPricingReason,
                })
              }
              disabled={!canSubmitCreatePricing}
            >
              {createPricingMutation.isPending ? "Saving..." : "Save Pricing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePlanOpen} onOpenChange={setDeletePlanOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Delete is destructive. If the plan is in use, it will be archived instead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">Plan: {deletePlanTarget?.name || "-"}</div>
              <p className="mt-1 text-muted-foreground">
                Confirm with your 2FA code to continue.
              </p>
            </div>

            <div>
              <Label>Reason</Label>
              <Textarea
                value={deletePlanReason}
                onChange={(event) => setDeletePlanReason(event.target.value)}
                placeholder="Why are you deleting this plan?"
              />
            </div>

            <div>
              <Label>2FA code</Label>
              <Input
                value={deletePlanTotp}
                onChange={(event) =>
                  setDeletePlanTotp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="6-digit code"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlanOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                deletePlanMutation.isPending ||
                !deletePlanTarget ||
                !deletePlanReason.trim() ||
                deletePlanTotp.length !== 6
              }
              onClick={() => {
                if (!deletePlanTarget) return;
                deletePlanMutation.mutate({
                  planId: deletePlanTarget.id,
                  reason: deletePlanReason.trim(),
                  totpCode: deletePlanTotp,
                });
              }}
            >
              {deletePlanMutation.isPending ? "Deleting..." : "Delete Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editPricingOpen} onOpenChange={setEditPricingOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Edit Pricing</DialogTitle>
            <DialogDescription>
              Update existing active pricing rows for {editPricingPlanId ? getPlanName(editPricingPlanId) : "plan"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editPricingValidation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {editPricingValidation.errors.slice(0, 6).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {editPricingRows.map((row) => {
              const monthly = parseNumericInput(row.monthly_price || "0");
              const discount = parseNumericInput(row.annual_discount_pct || "0");
              const effectiveMonthly =
                Number.isFinite(monthly) && Number.isFinite(discount)
                  ? deriveEffectiveMonthly(monthly, Math.max(0, Math.min(100, discount)))
                  : 0;
              const annualTotal = deriveAnnualTotal(effectiveMonthly);

              return (
                <div key={row.id} className="rounded-md border p-3">
                  <p className="mb-3 text-sm font-medium">{row.currency}</p>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <Label>Monthly</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.monthly_price}
                        onChange={(event) =>
                          setEditPricingRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, monthly_price: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Annual discount %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.annual_discount_pct}
                        onChange={(event) =>
                          setEditPricingRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, annual_discount_pct: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Effective monthly</Label>
                      <Input value={effectiveMonthly} readOnly disabled />
                    </div>
                    <div>
                      <Label>Annual total</Label>
                      <Input value={annualTotal} readOnly disabled />
                    </div>
                  </div>
                </div>
              );
            })}

            <div>
              <Label>Reason</Label>
              <Textarea
                value={editPricingReason}
                onChange={(event) => setEditPricingReason(event.target.value)}
                placeholder="Why are you changing pricing?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPricingOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editPricingPlanId) return;
                updatePricingMutation.mutate({
                  planId: editPricingPlanId,
                  rows: editPricingRows,
                  reason: editPricingReason,
                });
              }}
              disabled={!isSuperAdmin || !editPricingValidation.isValid || updatePricingMutation.isPending}
            >
              {updatePricingMutation.isPending ? "Saving..." : "Save Pricing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
