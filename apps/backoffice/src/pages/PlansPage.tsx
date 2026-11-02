import { useEffect, useMemo, useRef, useState } from "react";
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
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Switch } from "@ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { Textarea } from "@ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Info,
} from "lucide-react";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";

type CurrencyCode = "NGN" | "GHS";

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
  paystack_plan_code_monthly: string | null;
  paystack_plan_code_annual: string | null;
  updated_at: string;
}

interface PlanLimit {
  id: string;
  plan_id: string;
  max_locations: number;
  max_staff: number;
  max_services: number | null;
  max_products: number | null;
  max_packages: number | null;
  max_vouchers: number | null;
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
  max_packages: string;
  max_vouchers: string;
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

interface ChainTierRowDraft {
  localId: string;
  tier_label: string;
  tier_min: string;
  tier_max: string;
  price_per_location: string;
  annual_discount_pct: string;
  is_custom: boolean;
}

interface MarketCountry {
  country_code: string;
  country_name: string;
  is_selectable: boolean;
}

interface MarketCountryCurrency {
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_enabled: boolean;
}

interface StaffAddonPricingRow {
  id: string;
  country_code: string;
  currency: string;
  unit_price_per_extra_seat: number;
  status: "draft" | "active" | "retired";
  notes: string | null;
  effective_from: string;
}

interface StaffOperationsPricingRow {
  id: string;
  country_code: string;
  currency: string;
  unit_price_per_location: number;
  status: "draft" | "active" | "retired";
  notes: string | null;
  effective_from: string;
}

interface ThemeCatalogRow {
  theme_key: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface ThemeAddonPricingRow {
  id: string;
  theme_key: string;
  country_code: string;
  currency: string;
  billing_interval: "annual";
  unit_price: number;
  status: "draft" | "active" | "retired";
  notes: string | null;
  effective_from: string;
}

interface SmsCreditTierDraft {
  bundle_price: string;
  arkesel_cost_per_sms: string;
}

interface SmsCreditPricingDraft {
  margin_multiplier: string;
  low_balance_threshold_credits: string;
  tiers: Record<"NGN" | "GHS", SmsCreditTierDraft[]>;
}

interface SmsComplimentaryDraft {
  reminder_segments: string;
  marketing_segments: string;
}

interface ProgressionDraft {
  planId: string;
  planName: string;
  nextPlanName: string;
  maxLocations: string;
  maxStaff: string;
}

interface MarketingAddonDraft {
  key: string;
  name: string;
  description: string;
  status: "available" | "coming_soon" | "hidden";
}

interface SeatPricingDraft {
  rowId: string | null;
  country_code: string;
  country_name: string;
  currency: string;
  unit_price: string;
  status: "draft" | "active" | "retired";
  notes: string;
}

interface StaffOperationsPricingDraft {
  rowId: string | null;
  country_code: string;
  country_name: string;
  currency: string;
  unit_price: string;
  status: "draft" | "active" | "retired";
  notes: string;
}

interface ThemePricingDraft {
  rowId: string | null;
  theme_key: string;
  country_code: string;
  country_name: string;
  currency: string;
  billing_interval: "annual";
  unit_price: string;
  status: "draft" | "active" | "retired";
  notes: string;
}

type RolloutMode = "now" | "schedule";
type PricingStatus = "draft" | "active" | "retired";

const CURRENCIES: CurrencyCode[] = ["NGN", "GHS"];
const MAX_PLANS = 4;
const MAX_BATCH_ITEMS = 3;
const PRICING_STATUS_OPTIONS: Array<{ value: PricingStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "retired", label: "Retired" },
];
const MARKETING_ADDON_STATUS_OPTIONS: Array<{ value: MarketingAddonDraft["status"]; label: string }> = [
  { value: "available", label: "Available" },
  { value: "coming_soon", label: "Coming soon" },
  { value: "hidden", label: "Hidden" },
];

const DEFAULT_MARKETING_ADDONS: MarketingAddonDraft[] = [
  { key: "extra_communication_credits", name: "Extra communication credits", description: "Top up SMS credits when your complimentary monthly allowance runs low.", status: "available" },
  { key: "staff_operations", name: "Staff Operations", description: "Track when your staff arrive, time off, and leave requests.", status: "available" },
  { key: "ecommerce_themes", name: "E-commerce themes", description: "Give your booking page a polished storefront-style look with a paid theme.", status: "available" },
  { key: "whatsapp_messaging", name: "WhatsApp messaging", description: "Send booking confirmations, reminders, and updates directly via WhatsApp.", status: "coming_soon" },
  { key: "custom_booking_domain", name: "Custom booking domain", description: "Use your own domain for your client-facing booking page.", status: "coming_soon" },
];

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
  max_packages: "",
  max_vouchers: "",
  monthly_messages: 30,
  reason: "",
  features: [createFeatureDraft(0)],
});

const createPricingSectionDraft = (): PricingSectionDraft => ({
  localId: crypto.randomUUID(),
  plan_id: "",
  currencies: {
    NGN: { enabled: true, monthly_price: "", annual_discount_pct: "" },
    GHS: { enabled: true, monthly_price: "", annual_discount_pct: "" },
  },
});

const createChainTierRowDraft = (
  tierMin = "2",
  tierMax = "3",
  isCustom = false,
): ChainTierRowDraft => ({
  localId: crypto.randomUUID(),
  tier_label: tierMax ? `${tierMin}-${tierMax}` : `${tierMin}+`,
  tier_min: tierMin,
  tier_max: tierMax,
  price_per_location: "",
  annual_discount_pct: "",
  is_custom: isCustom,
});

const createSmsPricingDraft = (): SmsCreditPricingDraft => ({
  margin_multiplier: "1.5",
  low_balance_threshold_credits: "20",
  tiers: {
    NGN: [5000, 10000, 20000, 50000, 100000].map((bundlePrice) => ({
      bundle_price: String(bundlePrice),
      arkesel_cost_per_sms: "6.30",
    })),
    GHS: [20, 50, 100, 200, 500].map((bundlePrice) => ({
      bundle_price: String(bundlePrice),
      arkesel_cost_per_sms: "0.0300",
    })),
  },
});

const createSmsComplimentaryDraft = (): SmsComplimentaryDraft => ({
  reminder_segments: "100",
  marketing_segments: "25",
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
  const { backofficeUser, hasBackofficePermission } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";
  const canManagePaystackCodes = isSuperAdmin || hasBackofficePermission("plans.manage_paystack_codes");

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
  const [editPricingRolloutMode, setEditPricingRolloutMode] = useState<RolloutMode>("now");
  const [editPricingRolloutAt, setEditPricingRolloutAt] = useState("");
  const editPlanSaveRef = useRef(false);
  const [deletePlanOpen, setDeletePlanOpen] = useState(false);
  const [deletePlanTarget, setDeletePlanTarget] = useState<Plan | null>(null);
  const [deletePlanReason, setDeletePlanReason] = useState("");
  const [deletePlanTotp, setDeletePlanTotp] = useState("");
  const [locationPricingReason, setLocationPricingReason] = useState("");
  const [seatPricingReason, setSeatPricingReason] = useState("");
  const [chainTierDrafts, setChainTierDrafts] = useState<Record<CurrencyCode, ChainTierRowDraft[]>>({
    NGN: [createChainTierRowDraft("2", "3"), createChainTierRowDraft("4", "10"), createChainTierRowDraft("11", "", true)],
    GHS: [createChainTierRowDraft("2", "3"), createChainTierRowDraft("4", "10"), createChainTierRowDraft("11", "", true)],
  });
  const [chainTierDirty, setChainTierDirty] = useState(false);
  const [seatPricingDrafts, setSeatPricingDrafts] = useState<Record<string, SeatPricingDraft>>({});
  const [seatPricingDirty, setSeatPricingDirty] = useState(false);
  const [staffOperationsPricingReason, setStaffOperationsPricingReason] = useState("");
  const [staffOperationsPricingDrafts, setStaffOperationsPricingDrafts] =
    useState<Record<string, StaffOperationsPricingDraft>>({});
  const [staffOperationsPricingDirty, setStaffOperationsPricingDirty] = useState(false);
  const [themePricingReason, setThemePricingReason] = useState("");
  const [themePricingDrafts, setThemePricingDrafts] = useState<Record<string, ThemePricingDraft>>({});
  const [themePricingDirty, setThemePricingDirty] = useState(false);
  const [themeCatalogDraft, setThemeCatalogDraft] = useState({ name: "", description: "", is_active: true });
  const [smsPricingReason, setSmsPricingReason] = useState("");
  const [smsPricingDraft, setSmsPricingDraft] = useState<SmsCreditPricingDraft>(createSmsPricingDraft);
  const [smsComplimentaryDraft, setSmsComplimentaryDraft] = useState<SmsComplimentaryDraft>(createSmsComplimentaryDraft);
  const [smsPricingDirty, setSmsPricingDirty] = useState(false);
  const [marketingAddonsDraft, setMarketingAddonsDraft] = useState<MarketingAddonDraft[]>(DEFAULT_MARKETING_ADDONS);
  const [marketingAddonsDirty, setMarketingAddonsDirty] = useState(false);
  const [marketingAddonsReason, setMarketingAddonsReason] = useState("");
  const [editingAddon, setEditingAddon] = useState<"locations" | "seats" | "staff" | "themes" | "messaging" | null>(null);
  const [progressionReason, setProgressionReason] = useState("");
  const [progressionDrafts, setProgressionDrafts] = useState<Record<string, ProgressionDraft>>({});
  const [progressionDirty, setProgressionDirty] = useState(false);

  // Paystack plan codes: per pricing-row drafts (NGN/GHS only)
  interface PaystackCodeDraft { monthly: string; annual: string; dirty: boolean; }
  const [paystackCodeDrafts, setPaystackCodeDrafts] = useState<Record<string, PaystackCodeDraft>>({});
  const [paystackCodeRevealedRows, setPaystackCodeRevealedRows] = useState<Set<string>>(new Set());
  const [paystackCodeSavingRows, setPaystackCodeSavingRows] = useState<Set<string>>(new Set());
  const [paystackSyncingRows, setPaystackSyncingRows] = useState<Set<string>>(new Set());

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

  const { data: marketCountries } = useQuery({
    queryKey: ["backoffice-market-countries-compact"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("market_countries")
        .select("country_code,country_name,is_selectable")
        .order("country_name", { ascending: true });
      if (error) throw error;
      return (data || []) as MarketCountry[];
    },
  });

  const { data: marketCurrencies } = useQuery({
    queryKey: ["backoffice-market-country-currencies-compact"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("market_country_currency")
        .select("country_code,currency_code,is_default,is_enabled");
      if (error) throw error;
      return (data || []) as MarketCountryCurrency[];
    },
  });

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

  const chainPlan = useMemo(
    () => (plans || []).find((plan) => plan.slug.trim().toLowerCase() === "chain") || null,
    [plans],
  );

  const defaultCurrencyByCountry = useMemo(() => {
    const map = new Map<string, string>();
    (marketCurrencies || [])
      .filter((row) => row.is_default || row.is_enabled)
      .forEach((row) => {
        if (!map.has(row.country_code) || row.is_default) {
          map.set(row.country_code, row.currency_code);
        }
      });
    return map;
  }, [marketCurrencies]);

  const pricingMarkets = useMemo(() => {
    const selectableMarkets = (marketCountries || []).filter((country) => country.is_selectable);
    const source = selectableMarkets.length > 0 ? selectableMarkets : marketCountries || [];
    return source
      .map((country) => ({
        country_code: country.country_code,
        country_name: country.country_name,
        currency:
          defaultCurrencyByCountry.get(country.country_code) ||
          (country.country_code === "NG" ? "NGN" : "GHS"),
      }))
      .sort((a, b) => a.country_name.localeCompare(b.country_name));
  }, [defaultCurrencyByCountry, marketCountries]);

  const latestSeatPricingByCountry = useMemo(() => {
    const map = new Map<string, StaffAddonPricingRow>();
    (seatPricingRows || []).forEach((row) => {
      if (!map.has(row.country_code)) {
        map.set(row.country_code, row);
      }
    });
    return map;
  }, [seatPricingRows]);

  const latestStaffOperationsPricingByCountry = useMemo(() => {
    const map = new Map<string, StaffOperationsPricingRow>();
    (staffOperationsPricingRows || []).forEach((row) => {
      if (!map.has(row.country_code)) {
        map.set(row.country_code, row);
      }
    });
    return map;
  }, [staffOperationsPricingRows]);

  const latestThemePricingByCountry = useMemo(() => {
    const map = new Map<string, ThemeAddonPricingRow>();
    (themePricingRows || []).forEach((row) => {
      if (!map.has(row.country_code)) {
        map.set(row.country_code, row);
      }
    });
    return map;
  }, [themePricingRows]);

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

  const isLoading = plansLoading || pricingLoading || limitsLoading || featuresLoading;

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

  useEffect(() => {
    if (smsPricingDirty || !smsPricingSetting) return;
    const defaults = createSmsPricingDraft();
    const rawTiers = (smsPricingSetting.tiers || {}) as Record<string, unknown>;
    const tiers = (Object.keys(defaults.tiers) as Array<"NGN" | "GHS">).reduce((result, currency) => {
      const rows = Array.isArray(rawTiers[currency]) ? rawTiers[currency] : [];
      result[currency] = rows.length > 0
        ? rows.flatMap((row) => {
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

  useEffect(() => {
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
  }, [pricing]);

  const limitsByPlan = useMemo(() => {
    const map = new Map<string, PlanLimit>();
    (limits || []).forEach((row) => map.set(row.plan_id, row));
    return map;
  }, [limits]);

  const progressionPlans = useMemo(
    () => [...(plans || [])].sort((a, b) => a.display_order - b.display_order),
    [plans],
  );

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
      setEditPricingOpen(false);
      setEditPricingPlanId(null);
      setEditPricingRows([]);
      setEditPricingReason("");
      setEditPricingRolloutMode("now");
      setEditPricingRolloutAt("");
    },
    onError: (error) => {
      toast.error(errorToMessage(error));
    },
  });

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

  const saveProgressionMutation = useMutation({
    mutationFn: async () => {
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
      queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-audit-logs"] });
    },
    onError: (error) => toast.error(errorToMessage(error)),
  });

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
    setEditPricingRolloutMode("now");
    setEditPricingRolloutAt("");
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

  const updateSeatPricingDraft = (countryCode: string, patch: Partial<SeatPricingDraft>) => {
    setSeatPricingDirty(true);
    setSeatPricingDrafts((prev) => ({
      ...prev,
      [countryCode]: { ...prev[countryCode], ...patch },
    }));
  };

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

  const updateThemePricingDraft = (countryCode: string, patch: Partial<ThemePricingDraft>) => {
    setThemePricingDirty(true);
    setThemePricingDrafts((prev) => ({
      ...prev,
      [countryCode]: { ...prev[countryCode], ...patch },
    }));
  };

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

  const updateProgressionDraft = (planId: string, patch: Partial<ProgressionDraft>) => {
    setProgressionDirty(true);
    setProgressionDrafts((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], ...patch },
    }));
  };

  const canSubmitCreatePlans =
    isSuperAdmin && createPlansValidation.isValid && !createPlansMutation.isPending;
  const canSubmitCreatePricing =
    isSuperAdmin && createPricingValidation.isValid && !createPricingMutation.isPending;
  const canSubmitChainTiers =
    isSuperAdmin && chainTierValidation.isValid && !saveChainTiersMutation.isPending;
  const canSubmitSeatPricing =
    isSuperAdmin && seatPricingValidation.isValid && !saveSeatPricingMutation.isPending;
  const canSubmitStaffOperationsPricing =
    isSuperAdmin
    && staffOperationsPricingValidation.isValid
    && !saveStaffOperationsPricingMutation.isPending;
  const canSubmitThemePricing =
    isSuperAdmin && themePricingValidation.isValid && !saveThemePricingMutation.isPending;
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
  const canSubmitSmsPricing =
    isSuperAdmin && smsPricingValidation.isValid && !saveSmsPricingMutation.isPending;
  const canSubmitMarketingAddons =
    isSuperAdmin &&
    marketingAddonsReason.trim().length > 0 &&
    marketingAddonsDraft.length > 0 &&
    marketingAddonsDraft.every((addon) => addon.name.trim() && addon.description.trim()) &&
    !saveMarketingAddonsMutation.isPending;
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
  const canSubmitProgression =
    isSuperAdmin && progressionValidation.isValid && !saveProgressionMutation.isPending;

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

  const canSubmitEditPlan =
    isSuperAdmin && editPlanValidation.isValid && !updatePlanMutation.isPending;

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

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Base Subscription & Add-ons</h1>
            <p className="text-sm text-muted-foreground">
              Manage the base subscription, add-on pricing, and customer-facing feature copy. Market availability and currencies are managed in Settings → Markets.
            </p>
          </div>
        </div>

        {!isSuperAdmin && (
          <Card className="border-warning-bg bg-warning-bg/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  You have read-only access. Super Admin role is required for changes.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>One base subscription</CardTitle>
                <CardDescription>
                  Configure the customer-facing subscription once. Locations, seats, SMS, themes, and Staff Operations are add-ons as a salon grows.
                </CardDescription>
              </div>
              {basePlan && isSuperAdmin && (
                <Button variant="outline" onClick={() => openEditPlanDialog(basePlan)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit subscription
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {basePlan ? (
              <>
                <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
                  <div className="rounded-lg border bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer-facing name</p>
                    <p className="mt-1 text-lg font-semibold">{basePlan.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{basePlan.description || "Add a short description for the pricing page."}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trial</p>
                    <p className="mt-1 text-lg font-semibold">{basePlan.trial_days} days</p>
                    <p className="mt-1 text-sm text-muted-foreground">Full product access during trial.</p>
                  </div>
                  <div className="rounded-lg border bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Base price</p>
                    <div className="mt-1 space-y-1">
                      {CURRENCIES.map((currency) => {
                        const row = basePlanPricing?.get(currency);
                        return (
                          <p key={currency} className="text-sm font-medium">
                            {currency} {row ? `${getCurrencySymbol(currency)}${row.monthly_price.toLocaleString()}/month` : "Not configured"}
                          </p>
                        );
                      })}
                    </div>
                    {isSuperAdmin && (
                      <Button variant="link" className="h-auto p-0 pt-2" onClick={() => openEditPricingDialog(basePlan)}>
                        Edit base price
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Included benefits</p>
                      <p className="text-sm text-muted-foreground">This list feeds the marketing pricing page and customer subscription views.</p>
                    </div>
                    {isSuperAdmin && (
                      <Button variant="outline" size="sm" onClick={() => openEditPlanDialog(basePlan)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit benefits
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {basePlanFeatures.map((feature) => (
                      <div key={feature.id} className="flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature.feature_text}</span>
                      </div>
                    ))}
                    {basePlanFeatures.length === 0 && <p className="text-sm text-muted-foreground">No benefits configured yet.</p>}
                  </div>
                </div>

                <div>
                  <div className="mb-2">
                    <p className="font-medium">Add-ons</p>
                    <p className="text-sm text-muted-foreground">Keep optional growth features separate from the base subscription.</p>
                  </div>
                  <div className="mb-4 rounded-lg border bg-background p-4">
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground">These names, descriptions, and status badges feed the add-ons section on the marketing pricing page. Hidden items are omitted; coming-soon items remain visible with a badge.</p>
                    </div>
                    <div className="space-y-3">
                      {marketingAddonsDraft.map((addon, index) => (
                        <div key={addon.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-[180px_1fr_150px]">
                          <div className="flex items-center"><p className="text-sm font-medium">{addon.key.replace(/_/g, " ")}</p></div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input value={addon.name} onChange={(event) => { setMarketingAddonsDirty(true); setMarketingAddonsDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)); }} placeholder="Customer-facing name" />
                            <Input value={addon.description} onChange={(event) => { setMarketingAddonsDirty(true); setMarketingAddonsDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item)); }} placeholder="Customer-facing description" />
                          </div>
                          <Select value={addon.status} onValueChange={(value) => { setMarketingAddonsDirty(true); setMarketingAddonsDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, status: value as MarketingAddonDraft["status"] } : item)); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{MARKETING_ADDON_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-[240px] flex-1"><Label>Reason</Label><Textarea value={marketingAddonsReason} onChange={(event) => { setMarketingAddonsDirty(true); setMarketingAddonsReason(event.target.value); }} placeholder="Why are you updating the public add-on list?" /></div>
                      <Button onClick={() => saveMarketingAddonsMutation.mutate()} disabled={!canSubmitMarketingAddons}>{saveMarketingAddonsMutation.isPending ? "Saving…" : "Save public add-on list"}</Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      { key: "locations" as const, label: "Additional locations", detail: "Tiered chain expansion pricing", prices: CURRENCIES.map((currency) => `${currency}: ${chainTierDrafts[currency].some((row) => !row.is_custom && row.price_per_location.trim()) ? "Configured" : "Not configured"}`) },
                      { key: "seats" as const, label: "Additional seats", detail: "Per extra seat / month", prices: pricingMarkets.map((m) => `${m.country_name}: ${getCurrencySymbol(m.currency)}${latestSeatPricingByCountry.get(m.country_code)?.unit_price_per_extra_seat ?? "—"}/seat`) },
                      { key: "staff" as const, label: "Staff Operations", detail: "Check-ins, leave, and approvals", prices: pricingMarkets.map((m) => `${m.country_name}: ${getCurrencySymbol(m.currency)}${latestStaffOperationsPricingByCountry.get(m.country_code)?.unit_price_per_location ?? "—"}/location`) },
                      { key: "themes" as const, label: "E-commerce themes", detail: "Annual storefront theme add-on", prices: pricingMarkets.map((m) => `${m.country_name}: ${getCurrencySymbol(m.currency)}${latestThemePricingByCountry.get(m.country_code)?.unit_price ?? "—"}/year`) },
                      { key: "messaging" as const, label: "Messaging SMS", detail: "Complimentary allowances and paid top-ups", prices: (Object.keys(smsPricingDraft.tiers) as Array<"NGN" | "GHS">).map((currency) => {
                        const tiers = smsPricingDraft.tiers[currency];
                        const prices = tiers.map((tier) => Number(tier.bundle_price)).filter((price) => Number.isFinite(price) && price > 0);
                        return prices.length > 0
                          ? `${currency}: from ${getCurrencySymbol(currency)}${Math.min(...prices).toLocaleString()}`
                          : `${currency}: Not configured`;
                      }) },
                    ].map((addon) => (
                      <div key={addon.label} className="rounded-lg border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{addon.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{addon.detail}</p>
                          </div>
                          {isSuperAdmin && (
                            <Button variant="outline" size="sm" onClick={() => setEditingAddon(editingAddon === addon.key ? null : addon.key)}>
                              {editingAddon === addon.key ? "Close" : "Edit"}
                            </Button>
                          )}
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {addon.prices.length > 0 ? addon.prices.map((price) => <p key={price}>{price}</p>) : <p>Configure market pricing below.</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {editingAddon === "locations" && (
                    <div className="mt-4 rounded-lg border bg-background p-4">
                      <p className="mb-3 text-sm font-medium">Edit additional location pricing</p>
                      <div className="mt-4 rounded-md border p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div><p className="text-sm font-medium">Additional locations</p><p className="text-xs text-muted-foreground">Set the monthly price and annual discount. Annual pricing is calculated automatically as monthly × 12 after the discount.</p></div>
                          <Button type="button" variant="outline" size="sm" onClick={() => CURRENCIES.forEach((currency) => addChainTierRow(currency))}>Add tier</Button>
                        </div>
                        <div className="space-y-3">
                          {CURRENCIES.map((currency) => (
                            <div key={currency}>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">{currency}</p>
                              <div className="mb-1 hidden grid-cols-[100px_1fr_150px_1fr_auto_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                                <span>Tier</span>
                                <span>Monthly / location</span>
                                <span>Annual discount %</span>
                                <span>Annual after discount</span>
                                <span />
                                <span />
                              </div>
                              <div className="space-y-2">
                                {chainTierDrafts[currency].map((row) => (
                                  <div key={row.localId} className="grid gap-2 sm:grid-cols-[100px_1fr_150px_1fr_auto_auto]">
                                    <Input value={row.tier_label} onChange={(e) => updateChainTierRow(currency, row.localId, { tier_label: e.target.value })} aria-label={`${currency} location tier`} />
                                    <Input type="number" min="0" step="0.01" placeholder="Monthly / location" value={row.price_per_location} disabled={row.is_custom} onChange={(e) => updateChainTierRow(currency, row.localId, { price_per_location: e.target.value })} />
                                    <Input type="number" min="0" max="100" step="0.01" placeholder="Annual discount %" value={row.annual_discount_pct} disabled={row.is_custom} onChange={(e) => updateChainTierRow(currency, row.localId, { annual_discount_pct: e.target.value })} aria-label={`${currency} annual discount percentage`} />
                                    <Input type="number" placeholder="Annual after discount" value={row.is_custom || !row.price_per_location.trim() ? "" : deriveAnnualTotal(deriveEffectiveMonthly(Number(row.price_per_location), Math.max(0, Math.min(100, parseNumericInput(row.annual_discount_pct || "0")))))} disabled readOnly aria-label={`${currency} annual price per location after discount`} />
                                    <div className="flex items-center gap-2 rounded-md border px-2"><Switch checked={row.is_custom} onCheckedChange={(checked) => updateChainTierRow(currency, row.localId, { is_custom: checked })} /><span className="text-xs">Custom</span></div>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeChainTierRow(currency, row.localId)} disabled={chainTierDrafts[currency].length <= 1} aria-label={`Remove ${currency} location tier`}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-[240px] flex-1"><Label>Location pricing reason</Label><Textarea value={locationPricingReason} onChange={(e) => { setChainTierDirty(true); setLocationPricingReason(e.target.value); }} placeholder="Why are you updating additional location pricing?" /></div>
                        <Button onClick={() => saveChainTiersMutation.mutate()} disabled={!canSubmitChainTiers}>{saveChainTiersMutation.isPending ? "Saving…" : "Save location pricing"}</Button>
                      </div>
                    </div>
                  )}

                  {editingAddon === "seats" && (
                    <div className="mt-4 rounded-lg border bg-background p-4">
                      <p className="mb-3 text-sm font-medium">Edit additional seat pricing</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {pricingMarkets.map((market) => {
                          const draft = seatPricingDrafts[market.country_code];
                          return (
                            <div key={market.country_code} className="rounded-md border p-3">
                              <div className="mb-2"><p className="text-sm font-medium">{market.country_name}</p><p className="text-xs text-muted-foreground">Per extra seat / month</p></div>
                              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                                <Input type="number" min="0" step="0.01" value={draft?.unit_price || ""} onChange={(e) => updateSeatPricingDraft(market.country_code, { unit_price: e.target.value })} aria-label={`${market.country_name} seat price`} />
                                <Select value={draft?.status || "active"} onValueChange={(value) => updateSeatPricingDraft(market.country_code, { status: value as PricingStatus })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>{PRICING_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <Input className="mt-2" value={draft?.notes || ""} onChange={(e) => updateSeatPricingDraft(market.country_code, { notes: e.target.value })} placeholder="Internal pricing note (optional)" />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-[240px] flex-1"><Label>Seat pricing reason</Label><Textarea value={seatPricingReason} onChange={(e) => { setSeatPricingDirty(true); setSeatPricingReason(e.target.value); }} placeholder="Why are you updating additional seat pricing?" /></div>
                        <Button onClick={() => saveSeatPricingMutation.mutate()} disabled={!canSubmitSeatPricing}>{saveSeatPricingMutation.isPending ? "Saving…" : "Save seat pricing"}</Button>
                      </div>
                    </div>
                  )}

                  {editingAddon === "staff" && (
                    <div className="mt-4 rounded-lg border bg-background p-4">
                      <p className="mb-3 text-sm font-medium">Edit Staff Operations pricing</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {pricingMarkets.map((market) => {
                          const draft = staffOperationsPricingDrafts[market.country_code];
                          return (
                            <div key={market.country_code} className="rounded-md border p-3">
                              <div className="mb-2"><p className="text-sm font-medium">{market.country_name}</p><p className="text-xs text-muted-foreground">Per active location / month</p></div>
                              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                                <Input type="number" min="0" step="0.01" value={draft?.unit_price || ""} onChange={(e) => updateStaffOperationsPricingDraft(market.country_code, { unit_price: e.target.value })} aria-label={`${market.country_name} Staff Operations price`} />
                                <Select value={draft?.status || "active"} onValueChange={(value) => updateStaffOperationsPricingDraft(market.country_code, { status: value as PricingStatus })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>{PRICING_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <Input className="mt-2" value={draft?.notes || ""} onChange={(e) => updateStaffOperationsPricingDraft(market.country_code, { notes: e.target.value })} placeholder="Internal pricing note (optional)" />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-[240px] flex-1"><Label>Reason</Label><Textarea value={staffOperationsPricingReason} onChange={(e) => { setStaffOperationsPricingDirty(true); setStaffOperationsPricingReason(e.target.value); }} placeholder="Why are you updating Staff Operations pricing?" /></div>
                        <Button onClick={() => saveStaffOperationsPricingMutation.mutate()} disabled={!canSubmitStaffOperationsPricing}>{saveStaffOperationsPricingMutation.isPending ? "Saving…" : "Save Staff Operations pricing"}</Button>
                      </div>
                    </div>
                  )}

                  {editingAddon === "themes" && (
                    <div className="mt-4 rounded-lg border bg-background p-4">
                      <div className="mb-3">
                        <p className="text-sm font-medium">Edit e-commerce theme add-on</p>
                        <p className="text-xs text-muted-foreground">This name, description, availability, and annual market pricing feed the customer-facing add-on list.</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <div><Label>Name</Label><Input value={themeCatalogDraft.name} onChange={(e) => setThemeCatalogDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="E-commerce themes" /></div>
                        <div><Label>Description</Label><Input value={themeCatalogDraft.description} onChange={(e) => setThemeCatalogDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="Annual storefront theme add-on" /></div>
                        <div className="flex items-end gap-2 pb-2"><Switch checked={themeCatalogDraft.is_active} onCheckedChange={(checked) => setThemeCatalogDraft((prev) => ({ ...prev, is_active: checked }))} /><Label>Available</Label></div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {pricingMarkets.map((market) => {
                          const draft = themePricingDrafts[market.country_code];
                          return (
                            <div key={market.country_code} className="rounded-md border p-3">
                              <div className="mb-2"><p className="text-sm font-medium">{market.country_name}</p><p className="text-xs text-muted-foreground">Per theme / year</p></div>
                              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                                <Input type="number" min="0" step="0.01" value={draft?.unit_price || ""} onChange={(e) => updateThemePricingDraft(market.country_code, { unit_price: e.target.value })} aria-label={`${market.country_name} theme price`} />
                                <Select value={draft?.status || "active"} onValueChange={(value) => updateThemePricingDraft(market.country_code, { status: value as PricingStatus })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>{PRICING_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <Input className="mt-2" value={draft?.notes || ""} onChange={(e) => updateThemePricingDraft(market.country_code, { notes: e.target.value })} placeholder="Internal pricing note (optional)" />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-[240px] flex-1"><Label>Reason</Label><Textarea value={themePricingReason} onChange={(e) => { setThemePricingDirty(true); setThemePricingReason(e.target.value); }} placeholder="Why are you updating theme pricing?" /></div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => saveThemeCatalogMutation.mutate()} disabled={!isSuperAdmin || saveThemeCatalogMutation.isPending || !themeCatalogDraft.name.trim() || !themePricingReason.trim()}>{saveThemeCatalogMutation.isPending ? "Saving…" : "Save add-on details"}</Button>
                          <Button onClick={() => saveThemePricingMutation.mutate()} disabled={!canSubmitThemePricing}>{saveThemePricingMutation.isPending ? "Saving…" : "Save theme pricing"}</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {editingAddon === "messaging" && (
                    <div className="mt-4 rounded-lg border bg-background p-4">
                      <div className="mb-4">
                        <p className="text-sm font-medium">Edit messaging SMS pricing</p>
                        <p className="text-xs text-muted-foreground">
                          Set the provider cost and margin used to calculate credits, plus the monthly complimentary allowances.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div><Label>Margin multiplier</Label><Input type="number" min="0.01" step="0.01" value={smsPricingDraft.margin_multiplier} onChange={(e) => { setSmsPricingDirty(true); setSmsPricingDraft((prev) => ({ ...prev, margin_multiplier: e.target.value })); }} /></div>
                        <div><Label>Low balance alert threshold</Label><Input type="number" min="0" step="1" value={smsPricingDraft.low_balance_threshold_credits} onChange={(e) => { setSmsPricingDirty(true); setSmsPricingDraft((prev) => ({ ...prev, low_balance_threshold_credits: e.target.value })); }} /></div>
                        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">Credits are calculated from bundle price ÷ provider cost ÷ margin. Purchased SMS never expires.</div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {(Object.keys(smsPricingDraft.tiers) as Array<"NGN" | "GHS">).map((currency) => (
                          <div key={currency} className="rounded-md border p-3">
                            <div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-medium">{currency} bundles</p><p className="text-xs text-muted-foreground">Bundle price and provider cost per SMS</p></div><Button type="button" variant="outline" size="sm" onClick={() => addSmsPricingTier(currency)}><Plus className="mr-1 h-3.5 w-3.5" />Add tier</Button></div>
                            <div className="space-y-2">
                              {smsPricingDraft.tiers[currency].map((tier, index) => (
                                <div key={`${currency}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                  <Input type="number" min="0" step="0.01" placeholder="Bundle price" value={tier.bundle_price} onChange={(e) => updateSmsPricingTier(currency, index, { bundle_price: e.target.value })} aria-label={`${currency} bundle price ${index + 1}`} />
                                  <Input type="number" min="0" step="0.0001" placeholder="Provider cost / SMS" value={tier.arkesel_cost_per_sms} onChange={(e) => updateSmsPricingTier(currency, index, { arkesel_cost_per_sms: e.target.value })} aria-label={`${currency} provider cost ${index + 1}`} />
                                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSmsPricingTier(currency, index)} aria-label={`Remove ${currency} bundle ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 rounded-md border p-3">
                        <p className="mb-2 text-sm font-medium">Monthly complimentary SMS</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div><Label>Appointment reminders</Label><Input type="number" min="0" step="1" value={smsComplimentaryDraft.reminder_segments} onChange={(e) => { setSmsPricingDirty(true); setSmsComplimentaryDraft((prev) => ({ ...prev, reminder_segments: e.target.value })); }} /></div>
                          <div><Label>Marketing campaigns</Label><Input type="number" min="0" step="1" value={smsComplimentaryDraft.marketing_segments} onChange={(e) => { setSmsPricingDirty(true); setSmsComplimentaryDraft((prev) => ({ ...prev, marketing_segments: e.target.value })); }} /></div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-[240px] flex-1"><Label>Reason</Label><Textarea value={smsPricingReason} onChange={(e) => { setSmsPricingDirty(true); setSmsPricingReason(e.target.value); }} placeholder="Why are you updating messaging pricing?" /></div>
                        <Button onClick={() => saveSmsPricingMutation.mutate()} disabled={!canSubmitSmsPricing}>{saveSmsPricingMutation.isPending ? "Saving…" : "Save messaging pricing"}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading the base subscription…</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Growth progression</CardTitle>
            <CardDescription>
              Configure when a salon should be offered the next growth stage based on locations or team members. These thresholds do not limit the salon; they trigger the next plan or add-on conversation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {progressionValidation.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {progressionValidation.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}
            <div className="space-y-3">
              {Object.values(progressionDrafts).map((draft) => (
                <div key={draft.planId} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1.2fr_1fr_1fr] md:items-end">
                  <div>
                    <p className="text-sm font-medium">{draft.planName} → {draft.nextPlanName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {draft.nextPlanName === "Chain expansion"
                        ? "Continue growth through additional location and seat pricing."
                        : "Offer the next stage when either threshold is reached."}
                    </p>
                  </div>
                  <div><Label>Locations to trigger</Label><Input type="number" min="1" step="1" value={draft.maxLocations} onChange={(e) => updateProgressionDraft(draft.planId, { maxLocations: e.target.value })} /></div>
                  <div><Label>Staff to trigger</Label><Input type="number" min="1" step="1" value={draft.maxStaff} onChange={(e) => updateProgressionDraft(draft.planId, { maxStaff: e.target.value })} /></div>
                </div>
              ))}
              {Object.keys(progressionDrafts).length === 0 && <p className="text-sm text-muted-foreground">Configure at least two plan stages to add progression thresholds.</p>}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[240px] flex-1"><Label>Growth progression reason</Label><Textarea value={progressionReason} onChange={(e) => { setProgressionDirty(true); setProgressionReason(e.target.value); }} placeholder="Why are you updating growth progression thresholds?" /></div>
              <Button onClick={() => saveProgressionMutation.mutate()} disabled={!canSubmitProgression}>{saveProgressionMutation.isPending ? "Saving…" : "Save progression thresholds"}</Button>
            </div>
          </CardContent>
        </Card>

      </div>

      <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
        <DialogContent className="sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>Add Plans</DialogTitle>
            <DialogDescription>
              Create up to {Math.min(MAX_BATCH_ITEMS, remainingPlanSlots)} plans in one submission.
            </DialogDescription>
          </DialogHeader>

          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
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

                        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                          Growth progression thresholds are configured in the Growth progression section. Services, products, packages, vouchers, and SMS allowances are configured separately.
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>Edit base subscription</DialogTitle>
            <DialogDescription>
              Manage the single customer-facing subscription. Add-ons, market prices, and growth progression are configured in their own sections so each setting has one source of truth.
            </DialogDescription>
          </DialogHeader>

          {editPlanDraft && (
            <div className={cn(DIALOG_BODY_PADDING, "space-y-6")}>
              {editPlanValidation.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                    {editPlanValidation.errors.slice(0, 6).map((error) => <li key={error}>{error}</li>)}
                  </ul>
                </div>
              )}

              <section className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3">
                  <p className="font-medium">Customer-facing subscription</p>
                  <p className="text-sm text-muted-foreground">This name and description are shown on pricing, onboarding, and subscription screens.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Subscription name</Label>
                    <Input
                      value={editPlanDraft.name}
                      onChange={(event) => setEditPlanDraft((prev) => prev ? { ...prev, name: event.target.value } : prev)}
                    />
                  </div>
                  <div className="flex items-end gap-3 pb-2">
                    <Switch
                      checked={editPlanDraft.is_active}
                      onCheckedChange={(checked) => setEditPlanDraft((prev) => prev ? { ...prev, is_active: checked } : prev)}
                    />
                    <div>
                      <Label>Visible to customers</Label>
                      <p className="text-xs text-muted-foreground">Turn off only when retiring this subscription.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Label>Description</Label>
                  <Textarea
                    value={editPlanDraft.description}
                    onChange={(event) => setEditPlanDraft((prev) => prev ? { ...prev, description: event.target.value } : prev)}
                    placeholder="Explain who this subscription is for."
                  />
                </div>
              </section>

              <section className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Trial and base price</p>
                    <p className="text-sm text-muted-foreground">Trial access is configured here. Prices are edited once per market in the base price editor.</p>
                  </div>
                  {editPlanId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditPlanOpen(false);
                        const plan = (plans || []).find((item) => item.id === editPlanId);
                        if (plan) openEditPricingDialog(plan);
                      }}
                    >
                      <Coins className="mr-2 h-3.5 w-3.5" />
                      Edit base price
                    </Button>
                  )}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Trial days</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editPlanDraft.trial_days}
                      onChange={(event) => setEditPlanDraft((prev) => prev ? { ...prev, trial_days: Number(event.target.value || 0) } : prev)}
                    />
                  </div>
                  {CURRENCIES.map((currency) => {
                    const row = editPlanId ? activePricingByPlan.get(editPlanId)?.get(currency) : undefined;
                    return (
                      <div key={currency} className="rounded-md border bg-muted/20 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{currency}</p>
                        <p className="mt-1 text-sm font-semibold">{row ? `${getCurrencySymbol(currency)}${row.monthly_price.toLocaleString()}/month` : "Not configured"}</p>
                        <p className="text-xs text-muted-foreground">{row ? `Annual ${getCurrencySymbol(currency)}${row.annual_price.toLocaleString()}` : "Add a market price before publishing."}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Included benefits</p>
                    <p className="text-sm text-muted-foreground">This list feeds the marketing pricing page and customer subscription views.</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditPlanDraft((prev) => prev ? { ...prev, features: [...prev.features, createFeatureDraft(prev.features.length)] } : prev)}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add benefit
                  </Button>
                </div>
                <div className="space-y-2">
                  {editPlanDraft.features.map((feature) => (
                    <div key={feature.localId} className="grid gap-2 md:grid-cols-[1fr_120px_80px]">
                      <Input
                        value={feature.feature_text}
                        onChange={(event) => setEditPlanDraft((prev) => prev ? { ...prev, features: prev.features.map((item) => item.localId === feature.localId ? { ...item, feature_text: event.target.value } : item) } : prev)}
                        placeholder="e.g. Unlimited email marketing"
                      />
                      <Input
                        type="number"
                        value={feature.sort_order}
                        onChange={(event) => setEditPlanDraft((prev) => prev ? { ...prev, features: prev.features.map((item) => item.localId === feature.localId ? { ...item, sort_order: Number(event.target.value || 0) } : item) } : prev)}
                        aria-label="Benefit order"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setEditPlanDraft((prev) => prev ? { ...prev, features: prev.features.filter((item) => item.localId !== feature.localId) } : prev)}
                        disabled={editPlanDraft.features.length <= 1}
                        aria-label="Remove benefit"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-dashed p-4">
                <p className="font-medium">Configured separately</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Growth progression thresholds, additional locations and seats, Staff Operations, paid themes, SMS bundles, and complimentary SMS allowances each have their own editor below. This keeps pricing changes auditable and prevents conflicting settings.
                </p>
              </section>

              <div>
                <Label>Reason for change</Label>
                <Textarea
                  value={editPlanDraft.reason}
                  onChange={(event) => setEditPlanDraft((prev) => prev ? { ...prev, reason: event.target.value } : prev)}
                  placeholder="Describe why this subscription or benefit copy is changing."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Publishing</Label>
                  <Select value={editPlanRolloutMode} onValueChange={(value) => setEditPlanRolloutMode(value as RolloutMode)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Publish now</SelectItem>
                      <SelectItem value="schedule">Schedule publishing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editPlanRolloutMode === "schedule" && (
                  <div>
                    <Label>Publish at</Label>
                    <Input className="mt-2" type="datetime-local" value={editPlanRolloutAt} onChange={(event) => setEditPlanRolloutAt(event.target.value)} />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlanOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (updatePlanMutation.isPending || editPlanSaveRef.current) return;
                if (!editPlanDraft || !editPlanId) return;
                updatePlanMutation.mutate({ planId: editPlanId, draft: editPlanDraft });
              }}
              disabled={!canSubmitEditPlan}
            >
              {updatePlanMutation.isPending ? "Saving..." : "Save subscription"}
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

          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
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
                                    <Label>Annual price after discount</Label>
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

          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
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
            <DialogTitle>Edit base subscription price</DialogTitle>
            <DialogDescription>
              Set the monthly price and annual discount for each enabled market. This is the only customer-facing base subscription price editor.
            </DialogDescription>
          </DialogHeader>

          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
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
                      <Label>Annual price after discount</Label>
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Go live</Label>
                <Select
                  value={editPricingRolloutMode}
                  onValueChange={(value) => setEditPricingRolloutMode(value as RolloutMode)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Take effect now</SelectItem>
                    <SelectItem value="schedule">Schedule for a future date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editPricingRolloutMode === "schedule" && (
                <div>
                  <Label>Go-live date</Label>
                  <Input
                    className="mt-2"
                    type="datetime-local"
                    value={editPricingRolloutAt}
                    onChange={(event) => setEditPricingRolloutAt(event.target.value)}
                  />
                </div>
              )}
            </div>
            {editPricingRolloutMode === "schedule" && (
              <p className="text-xs text-muted-foreground">
                Existing subscribers keep today&apos;s price until this date. They&apos;ll see a notice in their
                dashboard once the change is scheduled.
              </p>
            )}
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
                  rolloutMode: editPricingRolloutMode,
                  rolloutAt:
                    editPricingRolloutMode === "schedule" && editPricingRolloutAt
                      ? new Date(editPricingRolloutAt).toISOString()
                      : null,
                });
              }}
              disabled={!isSuperAdmin || !editPricingValidation.isValid || updatePricingMutation.isPending}
            >
              {updatePricingMutation.isPending
                ? "Saving..."
                : editPricingRolloutMode === "schedule"
                  ? "Schedule Pricing Change"
                  : "Save Pricing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
