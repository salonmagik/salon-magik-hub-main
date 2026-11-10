export type LegalStatus = "planned" | "legal_approved" | "active" | "paused";
export type SettingsSection = "safety" | "trials" | "balances" | "markets";

export interface MarketCountry {
  country_code: string;
  country_name: string;
  is_selectable: boolean;
  legal_status: LegalStatus;
  go_live_at: string | null;
  notes: string | null;
  updated_at: string;
}

export interface MarketCountryCurrency {
  id: string;
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_enabled: boolean;
}

export interface KillSwitchValue {
  enabled: boolean;
  reason: string | null;
  enabled_at: string | null;
  enabled_by: string | null;
}

export type MaintenancePlatform = "salon_admin" | "client_portal";

export interface MaintenanceBannerValue {
  enabled: boolean;
  mode: "immediate" | "scheduled";
  platforms: MaintenancePlatform[];
  scheduled_at: string | null;
  title: string;
  description: string;
  guidance: string;
}

export interface TenantTrialOverride {
  id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  status: string;
  created_at: string;
}

/** Minimal shape these hooks need from useBackofficeAuth()'s backofficeUser, for audit-log actor_user_id. */
export interface ActorUser {
  user_id: string;
}

/** Minimal shape these hooks need from useBackofficeAuth()'s session, for step-up TOTP calls. */
export interface AuthSession {
  access_token?: string;
}
