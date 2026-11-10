import type {
  ChainTierRowDraft,
  FeatureDraft,
  MarketingAddonDraft,
  PlanDraft,
  PricingSectionDraft,
  PricingStatus,
  SmsComplimentaryDraft,
  SmsCreditPricingDraft,
} from "./types";

export const CURRENCIES: Array<"NGN" | "GHS"> = ["NGN", "GHS"];
export const MAX_PLANS = 4;
export const MAX_BATCH_ITEMS = 3;

export const PRICING_STATUS_OPTIONS: Array<{ value: PricingStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "retired", label: "Retired" },
];

export const MARKETING_ADDON_STATUS_OPTIONS: Array<{ value: MarketingAddonDraft["status"]; label: string }> = [
  { value: "available", label: "Available" },
  { value: "coming_soon", label: "Coming soon" },
  { value: "hidden", label: "Hidden" },
];

export const DEFAULT_MARKETING_ADDONS: MarketingAddonDraft[] = [
  { key: "extra_communication_credits", name: "Extra communication credits", description: "Top up SMS credits when your complimentary monthly allowance runs low.", status: "available" },
  { key: "staff_operations", name: "Staff Operations", description: "Track when your staff arrive, time off, and leave requests.", status: "available" },
  { key: "ecommerce_themes", name: "E-commerce themes", description: "Give your booking page a polished storefront-style look with a paid theme.", status: "available" },
  { key: "whatsapp_messaging", name: "WhatsApp messaging", description: "Send booking confirmations, reminders, and updates directly via WhatsApp.", status: "coming_soon" },
  { key: "custom_booking_domain", name: "Custom booking domain", description: "Use your own domain for your client-facing booking page.", status: "coming_soon" },
];

export const sanitizeSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export const parseNumericInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const toFixedNumber = (value: number) => Number(value.toFixed(2));

export const deriveEffectiveMonthly = (monthly: number, annualDiscountPct: number) =>
  toFixedNumber(monthly * (1 - annualDiscountPct / 100));

export const deriveAnnualTotal = (effectiveMonthly: number) =>
  toFixedNumber(effectiveMonthly * 12);

export const deriveDiscountFromEffective = (monthly: number, effectiveMonthly: number) => {
  if (monthly <= 0) return 0;
  const pct = ((monthly - effectiveMonthly) / monthly) * 100;
  if (!Number.isFinite(pct)) return 0;
  return toFixedNumber(Math.max(0, Math.min(100, pct)));
};

export const createFeatureDraft = (sortOrder = 0): FeatureDraft => ({
  localId: crypto.randomUUID(),
  feature_text: "",
  sort_order: sortOrder,
});

export const createPlanDraft = (displayOrder: number): PlanDraft => ({
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

export const createPricingSectionDraft = (): PricingSectionDraft => ({
  localId: crypto.randomUUID(),
  plan_id: "",
  currencies: {
    NGN: { enabled: true, monthly_price: "", annual_discount_pct: "" },
    GHS: { enabled: true, monthly_price: "", annual_discount_pct: "" },
  },
});

export const createChainTierRowDraft = (
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

export const createSmsPricingDraft = (): SmsCreditPricingDraft => ({
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

export const createSmsComplimentaryDraft = (): SmsComplimentaryDraft => ({
  reminder_segments: "100",
  marketing_segments: "25",
});

export const errorToMessage = (error: unknown) => {
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
