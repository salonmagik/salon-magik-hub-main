export type CurrencyCode = "NGN" | "GHS";

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_recommended: boolean;
  trial_days: number;
}

export interface PlanPricing {
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

export interface PlanLimit {
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

export interface PlanFeature {
  id: string;
  plan_id: string;
  feature_text: string;
  sort_order: number;
}

export interface FeatureDraft {
  localId: string;
  id?: string;
  feature_text: string;
  sort_order: number;
}

export interface PlanDraft {
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

export interface PricingCurrencyDraft {
  enabled: boolean;
  monthly_price: string;
  annual_discount_pct: string;
}

export interface PricingSectionDraft {
  localId: string;
  plan_id: string;
  currencies: Record<CurrencyCode, PricingCurrencyDraft>;
}

export interface EditPricingRow {
  id: string;
  currency: CurrencyCode;
  monthly_price: string;
  annual_discount_pct: string;
}

export interface ChainTierRowDraft {
  localId: string;
  tier_label: string;
  tier_min: string;
  tier_max: string;
  price_per_location: string;
  annual_discount_pct: string;
  is_custom: boolean;
}

export interface MarketCountry {
  country_code: string;
  country_name: string;
  is_selectable: boolean;
}

export interface MarketCountryCurrency {
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_enabled: boolean;
}

export interface StaffAddonPricingRow {
  id: string;
  country_code: string;
  currency: string;
  unit_price_per_extra_seat: number;
  status: "draft" | "active" | "retired";
  notes: string | null;
  effective_from: string;
}

export interface StaffOperationsPricingRow {
  id: string;
  country_code: string;
  currency: string;
  unit_price_per_location: number;
  status: "draft" | "active" | "retired";
  notes: string | null;
  effective_from: string;
}

export interface ThemeCatalogRow {
  theme_key: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ThemeAddonPricingRow {
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

export interface SmsCreditTierDraft {
  bundle_price: string;
  arkesel_cost_per_sms: string;
}

export interface SmsCreditPricingDraft {
  margin_multiplier: string;
  low_balance_threshold_credits: string;
  tiers: Record<"NGN" | "GHS", SmsCreditTierDraft[]>;
}

export interface SmsComplimentaryDraft {
  reminder_segments: string;
  marketing_segments: string;
}

export interface ProgressionDraft {
  planId: string;
  planName: string;
  nextPlanName: string;
  maxLocations: string;
  maxStaff: string;
}

export interface MarketingAddonDraft {
  key: string;
  name: string;
  description: string;
  status: "available" | "coming_soon" | "hidden";
}

export interface SeatPricingDraft {
  rowId: string | null;
  country_code: string;
  country_name: string;
  currency: string;
  unit_price: string;
  status: "draft" | "active" | "retired";
  notes: string;
}

export interface StaffOperationsPricingDraft {
  rowId: string | null;
  country_code: string;
  country_name: string;
  currency: string;
  unit_price: string;
  status: "draft" | "active" | "retired";
  notes: string;
}

export interface ThemePricingDraft {
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

export interface PricingMarket {
  country_code: string;
  country_name: string;
  currency: string;
}

export interface PaystackCodeDraft {
  monthly: string;
  annual: string;
  dirty: boolean;
}

export type RolloutMode = "now" | "schedule";
export type PricingStatus = "draft" | "active" | "retired";

/** Minimal shape these hooks need from useBackofficeAuth()'s backofficeUser, for audit-log actor_user_id. */
export interface ActorUser {
  user_id: string;
}
