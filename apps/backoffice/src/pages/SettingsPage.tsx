import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Checkbox } from "@ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { toast } from "sonner";
import { AlertTriangle, Calendar, Gift, Globe2, Lock, Megaphone, Power, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import type { Json } from "@/lib/supabase";

type LegalStatus = "planned" | "legal_approved" | "active" | "paused";

interface MarketCountry {
  country_code: string;
  country_name: string;
  is_selectable: boolean;
  legal_status: LegalStatus;
  go_live_at: string | null;
  notes: string | null;
  updated_at: string;
}

interface MarketCountryCurrency {
  id: string;
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_enabled: boolean;
}

interface KillSwitchValue {
  enabled: boolean;
  reason: string | null;
  enabled_at: string | null;
  enabled_by: string | null;
}

type MaintenancePlatform = "salon_admin" | "client_portal";

interface MaintenanceBannerValue {
  enabled: boolean;
  mode: "immediate" | "scheduled";
  platforms: MaintenancePlatform[];
  scheduled_at: string | null;
  title: string;
  description: string;
  guidance: string;
}

interface TenantTrialOverride {
  id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  status: string;
  created_at: string;
}

const LEGAL_STATUS_OPTIONS: { value: LegalStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "legal_approved", label: "Legal Approved" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
];

const COMMON_CURRENCIES = ["USD", "GHS", "NGN", "KES", "ZAR", "GBP", "EUR"];

function parseKillSwitch(value: Json | null): KillSwitchValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false, reason: null, enabled_at: null, enabled_by: null };
  }
  const obj = value as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    reason: typeof obj.reason === "string" ? obj.reason : null,
    enabled_at: typeof obj.enabled_at === "string" ? obj.enabled_at : null,
    enabled_by: typeof obj.enabled_by === "string" ? obj.enabled_by : null,
  };
}

function parseMaintBanner(value: Json | null): MaintenanceBannerValue {
  const defaults: MaintenanceBannerValue = {
    enabled: false,
    mode: "immediate",
    platforms: [],
    scheduled_at: null,
    title: "Scheduled Maintenance",
    description: "",
    guidance: "",
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const obj = value as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : defaults.enabled,
    mode: obj.mode === "scheduled" ? "scheduled" : "immediate",
    platforms: Array.isArray(obj.platforms)
      ? (obj.platforms as string[]).filter((p): p is MaintenancePlatform =>
          p === "salon_admin" || p === "client_portal"
        )
      : [],
    scheduled_at: typeof obj.scheduled_at === "string" ? obj.scheduled_at : null,
    title: typeof obj.title === "string" ? obj.title : defaults.title,
    description: typeof obj.description === "string" ? obj.description : "",
    guidance: typeof obj.guidance === "string" ? obj.guidance : "",
  };
}

async function writeAuditLog(action: string, actorId: string | undefined, metadata: Json) {
  const { error } = await supabase.from("audit_logs").insert({
    action,
    entity_type: "platform_settings",
    entity_id: null,
    actor_user_id: actorId,
    metadata,
  });

  if (error) throw error;
}

export default function BackofficeSettingsPage() {
  const queryClient = useQueryClient();
  const { backofficeUser, profile, session } = useBackofficeAuth();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [killSwitchDialogOpen, setKillSwitchDialogOpen] = useState(false);
  const [killSwitchReason, setKillSwitchReason] = useState("");
  const [pendingKillSwitchState, setPendingKillSwitchState] = useState(false);
  const [killSwitchTotpToken, setKillSwitchTotpToken] = useState("");
  const [killSwitchSecurityError, setKillSwitchSecurityError] = useState("");

  // Maintenance banner state
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintMode, setMaintMode] = useState<"immediate" | "scheduled">("immediate");
  const [maintPlatforms, setMaintPlatforms] = useState<MaintenancePlatform[]>([]);
  const [maintScheduledAt, setMaintScheduledAt] = useState("");
  const [maintTitle, setMaintTitle] = useState("Scheduled Maintenance");
  const [maintDescription, setMaintDescription] = useState("");
  const [maintGuidance, setMaintGuidance] = useState("");
  const [maintBannerDialogOpen, setMaintBannerDialogOpen] = useState(false);
  const [maintTotpToken, setMaintTotpToken] = useState("");
  const [maintSecurityError, setMaintSecurityError] = useState("");

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("GH");
  const [newCurrencyCode, setNewCurrencyCode] = useState("USD");
  const [notesDraft, setNotesDraft] = useState("");
  const [trialDaysDraft, setTrialDaysDraft] = useState(14);
  const [otpLimitEnabled, setOtpLimitEnabled] = useState(true);
  const [otpMaxPerHour, setOtpMaxPerHour] = useState(3);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(60);
  const [otpMaxPerHourPerIp, setOtpMaxPerHourPerIp] = useState(10);
  const [promoBonusEnabled, setPromoBonusEnabled] = useState(true);
  const [promoBonusWindowDays, setPromoBonusWindowDays] = useState(7);
  const [promoBonusDays, setPromoBonusDays] = useState(7);
  const [overrideTenantId, setOverrideTenantId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStartsAt, setOverrideStartsAt] = useState("");
  const [overrideEndsAt, setOverrideEndsAt] = useState("");

  const { data: killSwitch, isLoading: killSwitchLoading } = useQuery({
    queryKey: ["platform-settings", "kill_switch"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("key", "kill_switch")
        .maybeSingle();
      if (error) throw error;
      return parseKillSwitch(data?.value ?? null);
    },
  });

  const { data: maintBanner } = useQuery({
    queryKey: ["platform-settings", "maintenance_banner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "maintenance_banner")
        .maybeSingle();
      if (error) throw error;
      return parseMaintBanner(data?.value ?? null);
    },
  });

  useEffect(() => {
    if (maintBanner) {
      setMaintEnabled(maintBanner.enabled);
      setMaintMode(maintBanner.mode);
      setMaintPlatforms(maintBanner.platforms);
      setMaintScheduledAt(maintBanner.scheduled_at ?? "");
      setMaintTitle(maintBanner.title);
      setMaintDescription(maintBanner.description);
      setMaintGuidance(maintBanner.guidance);
    }
  }, [maintBanner]);

  const { data: marketCountries = [], isLoading: marketsLoading } = useQuery({
    queryKey: ["market-countries-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_countries")
        .select("*")
        .order("country_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MarketCountry[];
    },
  });

  const { data: defaultTrialDays } = useQuery({
    queryKey: ["platform-settings", "default_trial_days"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "default_trial_days")
        .maybeSingle();
      if (error) throw error;
      const parsed = Number((data?.value as Record<string, unknown>)?.days);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 14;
    },
  });

  useEffect(() => {
    if (typeof defaultTrialDays === "number") {
      setTrialDaysDraft(defaultTrialDays);
    }
  }, [defaultTrialDays]);

  const { data: otpRateLimitConfig } = useQuery({
    queryKey: ["platform-settings", "otp_rate_limit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "otp_rate_limit")
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Record<string, unknown>;
      return {
        enabled: typeof v.enabled === "boolean" ? v.enabled : true,
        maxPerHour: typeof v.max_per_hour === "number" ? v.max_per_hour : 3,
        cooldownSeconds: typeof v.cooldown_seconds === "number" ? v.cooldown_seconds : 60,
        maxPerHourPerIp: typeof v.max_per_hour_per_ip === "number" ? v.max_per_hour_per_ip : 10,
      };
    },
  });

  useEffect(() => {
    if (otpRateLimitConfig) {
      setOtpLimitEnabled(otpRateLimitConfig.enabled);
      setOtpMaxPerHour(otpRateLimitConfig.maxPerHour);
      setOtpCooldownSeconds(otpRateLimitConfig.cooldownSeconds);
      setOtpMaxPerHourPerIp(otpRateLimitConfig.maxPerHourPerIp);
    }
  }, [otpRateLimitConfig]);

  const updateOtpRateLimitMutation = useMutation({
    mutationFn: async ({ enabled, maxPerHour, cooldownSeconds, maxPerHourPerIp }: { enabled: boolean; maxPerHour: number; cooldownSeconds: number; maxPerHourPerIp: number }) => {
      const { error } = await supabase
        .from("platform_settings")
        .upsert(
          {
            key: "otp_rate_limit",
            value: { enabled, max_per_hour: maxPerHour, cooldown_seconds: cooldownSeconds, max_per_hour_per_ip: maxPerHourPerIp } as Json,
            description: "OTP rate limiting. Set enabled=false to bypass limits for testing.",
            updated_by_id: backofficeUser?.user_id,
          },
          { onConflict: "key" }
        );
      if (error) throw error;
      await writeAuditLog("otp_rate_limit_updated", backofficeUser?.user_id, { enabled, max_per_hour: maxPerHour, cooldown_seconds: cooldownSeconds, max_per_hour_per_ip: maxPerHourPerIp });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "otp_rate_limit"] });
      toast.success("OTP rate limit settings saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update OTP rate limit settings"),
  });

  const { data: promoBonusConfig } = useQuery({
    queryKey: ["platform-settings", "promo_trial_bonus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "promo_trial_bonus")
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Record<string, unknown>;
      return {
        enabled: typeof v.enabled === "boolean" ? v.enabled : true,
        windowDays: typeof v.window_days === "number" ? v.window_days : 7,
        bonusDays: typeof v.bonus_days === "number" ? v.bonus_days : 7,
      };
    },
  });

  useEffect(() => {
    if (promoBonusConfig) {
      setPromoBonusEnabled(promoBonusConfig.enabled);
      setPromoBonusWindowDays(promoBonusConfig.windowDays);
      setPromoBonusDays(promoBonusConfig.bonusDays);
    }
  }, [promoBonusConfig]);

  const updatePromoBonusMutation = useMutation({
    mutationFn: async ({ enabled, windowDays, bonusDays }: { enabled: boolean; windowDays: number; bonusDays: number }) => {
      const { error } = await supabase
        .from("platform_settings")
        .upsert(
          {
            key: "promo_trial_bonus",
            value: { enabled, window_days: windowDays, bonus_days: bonusDays } as Json,
            description: "Extra trial days granted when a promo code is applied within N days of signup. Set enabled=false to turn the incentive off entirely (the nudge UI stops mentioning it and no bonus is granted) without a code change.",
            updated_by_id: backofficeUser?.user_id,
          },
          { onConflict: "key" }
        );
      if (error) throw error;
      await writeAuditLog("promo_trial_bonus_updated", backofficeUser?.user_id, { enabled, window_days: windowDays, bonus_days: bonusDays });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "promo_trial_bonus"] });
      toast.success("Promo trial-bonus settings saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update promo trial-bonus settings"),
  });

  const { data: marketCurrencies = [], isLoading: currenciesLoading } = useQuery({
    queryKey: ["market-country-currencies-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_country_currency")
        .select("*")
        .order("country_code", { ascending: true })
        .order("currency_code", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MarketCountryCurrency[];
    },
  });

  const { data: trialOverrides = [] } = useQuery({
    queryKey: ["tenant-trial-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_trial_overrides")
        .select("id, tenant_id, starts_at, ends_at, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as TenantTrialOverride[];
    },
  });


  const {
    data: arkeselBalance,
    isLoading: arkeselBalanceLoading,
    refetch: refetchArkeselBalance,
    isRefetching: arkeselBalanceRefetching,
  } = useQuery({
    queryKey: ["arkesel-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-arkesel-balance");
      if (error) throw error;
      type BalanceEntry = { sms_balance: number | null; main_balance: string | null; error?: string };
      return data as { gh: BalanceEntry; ng_transactional: BalanceEntry; ng_promotional: BalanceEntry };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedCountry = useMemo(
    () => marketCountries.find((country) => country.country_code === selectedCountryCode) || null,
    [marketCountries, selectedCountryCode]
  );

  const selectedCountryCurrencies = useMemo(
    () => marketCurrencies.filter((currency) => currency.country_code === selectedCountryCode),
    [marketCurrencies, selectedCountryCode]
  );

  const selectableCountries = useMemo(
    () => marketCountries.filter((country) => country.is_selectable).length,
    [marketCountries]
  );

  const toggleKillSwitchMutation = useMutation({
    mutationFn: async ({ enabled, reason }: { enabled: boolean; reason: string }) => {
      const newValue: Record<string, Json> = {
        enabled,
        reason: enabled ? reason : null,
        enabled_at: enabled ? new Date().toISOString() : null,
        enabled_by: enabled ? profile?.full_name || backofficeUser?.user_id || null : null,
      };

      const { error } = await supabase
        .from("platform_settings")
        .update({ value: newValue, updated_by_id: backofficeUser?.user_id })
        .eq("key", "kill_switch");

      if (error) throw error;

      await writeAuditLog(enabled ? "kill_switch_enabled" : "kill_switch_disabled", backofficeUser?.user_id, {
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "kill_switch"] });
      toast.success(
        pendingKillSwitchState
          ? "Kill switch enabled - platform is now in read-only mode"
          : "Kill switch disabled - platform is back to normal"
      );
      setKillSwitchDialogOpen(false);
      setKillSwitchReason("");
      setKillSwitchTotpToken("");
      setKillSwitchSecurityError("");
    },
    onError: (error: Error) => {
      toast.error("Failed to toggle kill switch: " + error.message);
    },
  });

  const saveMaintenanceBannerMutation = useMutation({
    mutationFn: async () => {
      const newValue: MaintenanceBannerValue = {
        enabled: maintEnabled,
        mode: maintMode,
        platforms: maintPlatforms,
        scheduled_at: maintMode === "scheduled" && maintScheduledAt ? maintScheduledAt : null,
        title: maintTitle,
        description: maintDescription,
        guidance: maintGuidance,
      };
      const { error } = await supabase
        .from("platform_settings")
        .update({ value: newValue as unknown as Json, updated_by_id: backofficeUser?.user_id })
        .eq("key", "maintenance_banner");
      if (error) throw error;
      await writeAuditLog(
        maintEnabled ? "maintenance_banner_enabled" : "maintenance_banner_updated",
        backofficeUser?.user_id,
        newValue as unknown as Json
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "maintenance_banner"] });
      toast.success("Maintenance banner settings saved.");
      setMaintBannerDialogOpen(false);
      setMaintTotpToken("");
      setMaintSecurityError("");
    },
    onError: (error: Error) => toast.error("Failed to save maintenance banner: " + error.message),
  });

  const updateDefaultTrialDaysMutation = useMutation({
    mutationFn: async (days: number) => {
      const safeDays = Math.max(0, Math.floor(days));
      const { error } = await supabase
        .from("platform_settings")
        .upsert(
          {
            key: "default_trial_days",
            value: { days: safeDays } as Json,
            description: "Global default trial period in days",
            updated_by_id: backofficeUser?.user_id,
          },
          { onConflict: "key" }
        );
      if (error) throw error;

      // Propagate to plans.trial_days so the marketing site and salon-admin reflect the change.
      const { error: plansError } = await supabase
        .from("plans")
        .update({ trial_days: safeDays })
        .eq("is_active", true);
      if (plansError) throw plansError;

      // Extend all currently-trialing tenants: recalculate trial_ends_at from their created_at
      // so every active trial reflects the new global period.
      const { error: tenantsError } = await (supabase.rpc as any)(
        "extend_trialing_tenants_trial",
        { p_days: safeDays },
      );
      if (tenantsError) throw tenantsError;

      await writeAuditLog("default_trial_days_updated", backofficeUser?.user_id, { days: safeDays });
      return safeDays;
    },
    onSuccess: (days) => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "default_trial_days"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      setTrialDaysDraft(days);
      toast.success("Default trial period updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update default trial period"),
  });

  const createTrialOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!overrideTenantId || !overrideStartsAt || !overrideEndsAt) {
        throw new Error("Tenant ID, start, and end dates are required.");
      }

      const { error } = await supabase
        .from("tenant_trial_overrides")
        .insert({
          tenant_id: overrideTenantId.trim(),
          starts_at: new Date(overrideStartsAt).toISOString(),
          ends_at: new Date(overrideEndsAt).toISOString(),
          reason: overrideReason.trim() || "",
          status: "active",
          granted_by: backofficeUser?.user_id ?? null,
        });

      if (error) throw error;
      await writeAuditLog("tenant_trial_override_created", backofficeUser?.user_id, {
        tenant_id: overrideTenantId.trim(),
        starts_at: overrideStartsAt,
        ends_at: overrideEndsAt,
      });

      // Best-effort — the override is already live regardless of whether
      // this notification succeeds.
      supabase.functions
        .invoke("send-trial-extension-notice", {
          body: {
            tenantId: overrideTenantId.trim(),
            reason: "gifted_override",
            overrideStartsAt: new Date(overrideStartsAt).toISOString(),
            overrideEndsAt: new Date(overrideEndsAt).toISOString(),
            overrideReason: overrideReason.trim() || undefined,
          },
        })
        .catch((err) => console.error("Failed to send trial extension notice:", err));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-trial-overrides"] });
      toast.success("Tenant trial override created");
      setOverrideTenantId("");
      setOverrideReason("");
      setOverrideStartsAt("");
      setOverrideEndsAt("");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create trial override"),
  });

  const revokeTrialOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from("tenant_trial_overrides")
        .update({ status: "revoked" })
        .eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-trial-overrides"] });
      toast.success("Trial override revoked");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to revoke override"),
  });

  const updateCountryMutation = useMutation({
    mutationFn: async ({
      countryCode,
      isSelectable,
      legalStatus,
      notes,
    }: {
      countryCode: string;
      isSelectable: boolean;
      legalStatus: LegalStatus;
      notes: string;
    }) => {
      const goLiveAt = legalStatus === "active" && selectedCountry?.go_live_at == null ? new Date().toISOString() : selectedCountry?.go_live_at;
      const { error } = await supabase
        .from("market_countries")
        .update({
          is_selectable: isSelectable,
          legal_status: legalStatus,
          go_live_at: goLiveAt,
          notes: notes.trim() || null,
        })
        .eq("country_code", countryCode);
      if (error) throw error;

      await writeAuditLog("market_country_updated", backofficeUser?.user_id, {
        country_code: countryCode,
        is_selectable: isSelectable,
        legal_status: legalStatus,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-countries-admin"] });
      toast.success("Market updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update market"),
  });

  const upsertCurrencyMutation = useMutation({
    mutationFn: async ({ countryCode, currencyCode }: { countryCode: string; currencyCode: string }) => {
      const normalizedCode = currencyCode.trim().toUpperCase();
      if (!normalizedCode) throw new Error("Currency code is required");

      const { error } = await supabase
        .from("market_country_currency")
        .upsert(
          {
            country_code: countryCode,
            currency_code: normalizedCode,
            is_enabled: true,
            is_default: false,
          },
          { onConflict: "country_code,currency_code" }
        );

      if (error) throw error;

      await writeAuditLog("market_currency_upserted", backofficeUser?.user_id, {
        country_code: countryCode,
        currency_code: normalizedCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Currency added");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to add currency"),
  });

  const setDefaultCurrencyMutation = useMutation({
    mutationFn: async ({ countryCode, currencyCode }: { countryCode: string; currencyCode: string }) => {
      const { error: resetError } = await supabase
        .from("market_country_currency")
        .update({ is_default: false })
        .eq("country_code", countryCode);
      if (resetError) throw resetError;

      const { error: setError } = await supabase
        .from("market_country_currency")
        .update({ is_default: true, is_enabled: true })
        .eq("country_code", countryCode)
        .eq("currency_code", currencyCode);

      if (setError) throw setError;

      await writeAuditLog("market_default_currency_updated", backofficeUser?.user_id, {
        country_code: countryCode,
        currency_code: currencyCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Default currency updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to set default currency"),
  });

  const toggleCurrencyMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { data, error } = await supabase
        .from("market_country_currency")
        .update({ is_enabled: isEnabled })
        .eq("id", id)
        .select("country_code,currency_code")
        .single();

      if (error) throw error;

      await writeAuditLog("market_currency_toggled", backofficeUser?.user_id, {
        country_code: data.country_code,
        currency_code: data.currency_code,
        is_enabled: isEnabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-country-currencies-admin"] });
      toast.success("Currency updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update currency"),
  });

  const handleKillSwitchToggle = (checked: boolean) => {
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can control the kill switch");
      return;
    }
    setPendingKillSwitchState(checked);
    setKillSwitchReason("");
    setKillSwitchTotpToken("");
    setKillSwitchSecurityError("");
    setKillSwitchDialogOpen(true);
  };

  const confirmKillSwitch = async () => {
    if (pendingKillSwitchState && !killSwitchReason.trim()) {
      setKillSwitchSecurityError("A reason is required to enable the kill switch");
      return;
    }
    if (!session?.access_token) {
      setKillSwitchSecurityError("Session expired. Please sign in again.");
      return;
    }
    if (killSwitchTotpToken.trim().length !== 6) {
      setKillSwitchSecurityError("Enter your 6-digit 2FA code.");
      return;
    }
    const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
      body: {
        token: killSwitchTotpToken.trim(),
        action: "kill_switch_write",
        resourceId: "kill_switch",
        accessToken: session.access_token,
      },
    });
    if (verify.error || !verify.data?.valid) {
      setKillSwitchSecurityError(verify.data?.error || verify.error?.message || "2FA verification failed");
      return;
    }
    toggleKillSwitchMutation.mutate({
      enabled: pendingKillSwitchState,
      reason: killSwitchReason,
    });
  };

  const openMaintenanceBannerSaveDialog = () => {
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can update the maintenance banner");
      return;
    }
    setMaintTotpToken("");
    setMaintSecurityError("");
    setMaintBannerDialogOpen(true);
  };

  const confirmSaveMaintenanceBanner = async () => {
    if (!session?.access_token) {
      setMaintSecurityError("Session expired. Please sign in again.");
      return;
    }
    if (maintTotpToken.trim().length !== 6) {
      setMaintSecurityError("Enter your 6-digit 2FA code.");
      return;
    }
    const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
      body: {
        token: maintTotpToken.trim(),
        action: "maintenance_banner_write",
        resourceId: "maintenance_banner",
        accessToken: session.access_token,
      },
    });
    if (verify.error || !verify.data?.valid) {
      setMaintSecurityError(verify.data?.error || verify.error?.message || "2FA verification failed");
      return;
    }
    saveMaintenanceBannerMutation.mutate();
  };

  const saveMarketDetails = () => {
    if (!selectedCountry) return;
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can update markets");
      return;
    }
    updateCountryMutation.mutate({
      countryCode: selectedCountry.country_code,
      isSelectable: selectedCountry.is_selectable,
      legalStatus: selectedCountry.legal_status,
      notes: notesDraft,
    });
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Platform-wide controls, markets, and environment governance.</p>
        </div>

        <Tabs defaultValue="operations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="markets">Markets</TabsTrigger>
          </TabsList>

          <TabsContent value="operations" className="space-y-6">
            {killSwitch?.enabled && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Kill Switch Active</AlertTitle>
                <AlertDescription>
                  The platform is currently in read-only mode.
                  {killSwitch.reason && <span className="mt-1 block">Reason: {killSwitch.reason}</span>}
                  {killSwitch.enabled_at && (
                    <span className="mt-1 block text-xs">
                      Enabled on {new Date(killSwitch.enabled_at).toLocaleString()}
                      {killSwitch.enabled_by && ` by ${killSwitch.enabled_by}`}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Card className={killSwitch?.enabled ? "border-destructive" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${
                        killSwitch?.enabled ? "bg-destructive/10 text-destructive" : "bg-muted"
                      }`}
                    >
                      <Power className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>Kill Switch</CardTitle>
                      <CardDescription>Emergency read-only mode for the entire platform</CardDescription>
                    </div>
                  </div>
                  <Badge variant={killSwitch?.enabled ? "destructive" : "secondary"}>
                    {killSwitch?.enabled ? "ACTIVE" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Enable Kill Switch</p>
                    <p className="text-sm text-muted-foreground">
                      When enabled, all write operations are blocked platform-wide.
                    </p>
                  </div>
                  {isSuperAdmin ? (
                    <Switch
                      checked={killSwitch?.enabled || false}
                      onCheckedChange={handleKillSwitchToggle}
                      disabled={killSwitchLoading}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm">Super Admin only</span>
                    </div>
                  )}
                </div>

                {!isSuperAdmin && (
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertDescription>Only Super Admins can enable or disable the kill switch.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Maintenance Banner */}
            <Card className={maintEnabled ? "border-amber-400" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${maintEnabled ? "bg-amber-100 text-amber-600" : "bg-muted"}`}>
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>Maintenance Banner</CardTitle>
                      <CardDescription>
                        Show a dismissable banner on Salon Admin and/or Client Portal to inform users of maintenance.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={maintEnabled ? "default" : "secondary"} className={maintEnabled ? "bg-amber-500" : ""}>
                    {maintEnabled ? "ACTIVE" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Banner active</p>
                    <p className="text-sm text-muted-foreground">When enabled, the banner is shown on the selected platforms. Save requires 2FA.</p>
                  </div>
                  {isSuperAdmin ? (
                    <Switch
                      checked={maintEnabled}
                      onCheckedChange={setMaintEnabled}
                      disabled={saveMaintenanceBannerMutation.isPending}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm">Super Admin only</span>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-4">
                  {/* Platform targeting */}
                  <div className="space-y-2">
                    <Label>Target platforms</Label>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={maintPlatforms.includes("salon_admin")}
                          onCheckedChange={(checked) =>
                            setMaintPlatforms((prev) =>
                              checked
                                ? [...prev, "salon_admin"]
                                : prev.filter((p) => p !== "salon_admin")
                            )
                          }
                          disabled={!isSuperAdmin}
                        />
                        <span className="text-sm">Salon Admin</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={maintPlatforms.includes("client_portal")}
                          onCheckedChange={(checked) =>
                            setMaintPlatforms((prev) =>
                              checked
                                ? [...prev, "client_portal"]
                                : prev.filter((p) => p !== "client_portal")
                            )
                          }
                          disabled={!isSuperAdmin}
                        />
                        <span className="text-sm">Client Portal</span>
                      </label>
                    </div>
                  </div>

                  {/* Mode */}
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <RadioGroup
                      value={maintMode}
                      onValueChange={(v) => setMaintMode(v as "immediate" | "scheduled")}
                      className="flex gap-6"
                      disabled={!isSuperAdmin}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="immediate" />
                        <span className="text-sm">Immediate</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="scheduled" />
                        <span className="text-sm">Scheduled</span>
                      </label>
                    </RadioGroup>
                  </div>

                  {/* Scheduled date/time */}
                  {maintMode === "scheduled" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Maintenance date &amp; time
                      </Label>
                      <Input
                        type="datetime-local"
                        value={maintScheduledAt}
                        onChange={(e) => setMaintScheduledAt(e.target.value)}
                        className="w-64"
                        disabled={!isSuperAdmin}
                      />
                    </div>
                  )}

                  {/* Title */}
                  <div className="space-y-2">
                    <Label>Banner title</Label>
                    <Input
                      value={maintTitle}
                      onChange={(e) => setMaintTitle(e.target.value)}
                      placeholder="e.g. Scheduled Maintenance"
                      disabled={!isSuperAdmin}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={maintDescription}
                      onChange={(e) => setMaintDescription(e.target.value)}
                      placeholder="What maintenance is being performed?"
                      rows={3}
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Shown in the "Learn more" modal.</p>
                  </div>

                  {/* Guidance */}
                  <div className="space-y-2">
                    <Label>User guidance</Label>
                    <Textarea
                      value={maintGuidance}
                      onChange={(e) => setMaintGuidance(e.target.value)}
                      placeholder="What should users do or know during maintenance?"
                      rows={3}
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Shown below the description in the modal.</p>
                  </div>

                  {isSuperAdmin && (
                    <Button
                      onClick={openMaintenanceBannerSaveDialog}
                      disabled={saveMaintenanceBannerMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Save Banner Settings
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Access</CardTitle>
                <CardDescription>Your Backoffice role and permissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{profile?.full_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Role</Label>
                    <p className="font-medium capitalize">{backofficeUser?.role?.replace("_", " ") || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Domain</Label>
                    <p className="font-medium">{backofficeUser?.email_domain || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">2FA Status</Label>
                    <div className="font-medium">
                      {backofficeUser?.totp_enabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Global Trial Period</CardTitle>
                <CardDescription>
                  Controls the default trial period used when tenant-specific overrides are not set.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Default trial days</Label>
                  <Input
                    type="number"
                    min={0}
                    value={trialDaysDraft}
                    onChange={(event) => setTrialDaysDraft(Number(event.target.value || 0))}
                    className="w-40"
                    disabled={!isSuperAdmin}
                  />
                </div>
                <Button
                  onClick={() => updateDefaultTrialDaysMutation.mutate(trialDaysDraft)}
                  disabled={!isSuperAdmin || updateDefaultTrialDaysMutation.isPending}
                >
                  Save Trial Days
                </Button>
                <p className="text-sm text-muted-foreground">
                  Current: {defaultTrialDays ?? 14} day(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${!otpLimitEnabled ? "bg-amber-100 text-amber-600" : "bg-muted"}`}>
                    <ShieldOff className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>OTP Rate Limiting</CardTitle>
                    <CardDescription>
                      Controls how many OTP requests a single identifier — or a single sender IP, across all phone numbers — can make. Disable during testing to remove all limits.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {!otpLimitEnabled && (
                  <Alert className="border-amber-300 bg-amber-50 text-amber-800">
                    <ShieldOff className="h-4 w-4" />
                    <AlertTitle>Rate limiting is disabled</AlertTitle>
                    <AlertDescription>OTPs can be requested without restriction. Re-enable before going live.</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Enable rate limiting</p>
                    <p className="text-sm text-muted-foreground">Disable to allow unlimited OTP requests (for testing only)</p>
                  </div>
                  <Switch
                    checked={otpLimitEnabled}
                    onCheckedChange={setOtpLimitEnabled}
                    disabled={!isSuperAdmin}
                  />
                </div>

                <div className={`grid gap-4 md:grid-cols-2 transition-opacity ${!otpLimitEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                  <div className="space-y-2">
                    <Label>Max requests per hour</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={otpMaxPerHour}
                      onChange={(e) => setOtpMaxPerHour(Math.max(1, Number(e.target.value || 1)))}
                      className="w-36"
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Default: 3</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Cooldown between requests (seconds)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={3600}
                      value={otpCooldownSeconds}
                      onChange={(e) => setOtpCooldownSeconds(Math.max(0, Number(e.target.value || 0)))}
                      className="w-36"
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Default: 60</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max requests per hour, per sender IP</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={otpMaxPerHourPerIp}
                      onChange={(e) => setOtpMaxPerHourPerIp(Math.max(1, Number(e.target.value || 1)))}
                      className="w-36"
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Caps one IP rotating through many phone numbers. Default: 10</p>
                  </div>
                </div>

                <Button
                  onClick={() => updateOtpRateLimitMutation.mutate({ enabled: otpLimitEnabled, maxPerHour: otpMaxPerHour, cooldownSeconds: otpCooldownSeconds, maxPerHourPerIp: otpMaxPerHourPerIp })}
                  disabled={!isSuperAdmin || updateOtpRateLimitMutation.isPending}
                >
                  Save OTP Settings
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${!promoBonusEnabled ? "bg-muted" : "bg-amber-100 text-amber-600"}`}>
                    <Gift className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>Promo Code Trial Bonus</CardTitle>
                    <CardDescription>
                      Extra trial days when a new salon applies a promo code within N days of signing up. Read live by the
                      salon-admin app's upgrade nudges (banner + reminder modals) — turning this off here removes the offer
                      from that UI immediately, no code change needed.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {!promoBonusEnabled && (
                  <Alert className="border-amber-300 bg-amber-50 text-amber-800">
                    <Gift className="h-4 w-4" />
                    <AlertTitle>Promo trial bonus is off</AlertTitle>
                    <AlertDescription>
                      Applying a promo code no longer extends a tenant's trial, and the upgrade nudges won't mention the
                      offer. Use this to pause the incentive for a quarter without touching code.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Enable trial bonus</p>
                    <p className="text-sm text-muted-foreground">Turn the whole incentive on or off</p>
                  </div>
                  <Switch
                    checked={promoBonusEnabled}
                    onCheckedChange={setPromoBonusEnabled}
                    disabled={!isSuperAdmin}
                  />
                </div>

                <div className={`grid gap-4 md:grid-cols-2 transition-opacity ${!promoBonusEnabled ? "opacity-40 pointer-events-none" : ""}`}>
                  <div className="space-y-2">
                    <Label>Eligibility window (days since signup)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={promoBonusWindowDays}
                      onChange={(e) => setPromoBonusWindowDays(Math.max(1, Number(e.target.value || 1)))}
                      className="w-36"
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Default: 7</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Bonus trial days granted</Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={promoBonusDays}
                      onChange={(e) => setPromoBonusDays(Math.max(1, Number(e.target.value || 1)))}
                      className="w-36"
                      disabled={!isSuperAdmin}
                    />
                    <p className="text-xs text-muted-foreground">Default: 7</p>
                  </div>
                </div>

                <Button
                  onClick={() => updatePromoBonusMutation.mutate({ enabled: promoBonusEnabled, windowDays: promoBonusWindowDays, bonusDays: promoBonusDays })}
                  disabled={!isSuperAdmin || updatePromoBonusMutation.isPending}
                >
                  Save Promo Bonus Settings
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tenant Gifted Trials</CardTitle>
                <CardDescription>
                  Create temporary trial overrides for specific tenants independent of the global trial window.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Tenant ID</Label>
                    <Input
                      value={overrideTenantId}
                      onChange={(event) => setOverrideTenantId(event.target.value)}
                      placeholder="Tenant UUID"
                      disabled={!isSuperAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Starts</Label>
                    <Input
                      type="datetime-local"
                      value={overrideStartsAt}
                      onChange={(event) => setOverrideStartsAt(event.target.value)}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ends</Label>
                    <Input
                      type="datetime-local"
                      value={overrideEndsAt}
                      onChange={(event) => setOverrideEndsAt(event.target.value)}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder="Why this tenant is receiving a gifted trial"
                    disabled={!isSuperAdmin}
                  />
                </div>

                <Button
                  onClick={() => createTrialOverrideMutation.mutate()}
                  disabled={!isSuperAdmin || createTrialOverrideMutation.isPending}
                >
                  Create Trial Override
                </Button>

                <div className="space-y-2">
                  {(trialOverrides ?? []).map((override) => (
                    <div key={override.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{override.tenant_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(override.starts_at).toLocaleString()} - {new Date(override.ends_at).toLocaleString()}
                        </p>
                        {override.reason && (
                          <p className="text-xs text-muted-foreground">{override.reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={override.status === "active" ? "default" : "secondary"} className="cursor-default">
                              {override.status}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            {override.status === "active"
                              ? "Currently in effect — this tenant's trial window is extended."
                              : "No longer in effect, either because it expired naturally or was manually revoked."}
                          </TooltipContent>
                        </Tooltip>
                        {override.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeTrialOverrideMutation.mutate(override.id)}
                            disabled={!isSuperAdmin || revokeTrialOverrideMutation.isPending}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!(trialOverrides ?? []).length && (
                    <p className="text-sm text-muted-foreground">No tenant overrides created yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-1.5">
                      Arkesel SMS Balance
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          Live balance on our third-party SMS gateway (Arkesel), fetched in real time — not stored in our database. At zero, OTP and marketing SMS stop sending for that account until topped up.
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                    <CardDescription>Live credit balance for each country Arkesel account.</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchArkeselBalance()}
                    disabled={arkeselBalanceLoading || arkeselBalanceRefetching}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${arkeselBalanceRefetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {arkeselBalanceLoading ? (
                  <p className="text-sm text-muted-foreground">Fetching balances…</p>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {(
                      [
                        { key: "gh", label: "Ghana (GH)" },
                        { key: "ng_transactional", label: "Nigeria — Transactional" },
                        { key: "ng_promotional", label: "Nigeria — Promotional" },
                      ] as const
                    ).map(({ key, label }) => {
                      const entry = arkeselBalance?.[key];
                      return (
                        <div key={key} className="rounded-lg border p-4">
                          <p className="text-sm text-muted-foreground">{label}</p>
                          {entry?.error ? (
                            <p className="mt-1 text-sm text-destructive">{entry.error}</p>
                          ) : (
                            <>
                              <p className="mt-1 text-2xl font-semibold tabular-nums">
                                {entry?.sms_balance != null ? entry.sms_balance.toLocaleString() : "—"}
                                <span className="ml-1.5 text-sm font-normal text-muted-foreground">credits</span>
                              </p>
                              {entry?.main_balance && (
                                <p className="mt-0.5 text-xs text-muted-foreground">{entry.main_balance}</p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="markets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5" />
                  Market Activation
                </CardTitle>
                <CardDescription>
                  Control legal go-live, selectable countries, and currency policy. {selectableCountries} countries are selectable.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Select
                      value={selectedCountryCode}
                      onValueChange={(value) => {
                        setSelectedCountryCode(value);
                        const country = marketCountries.find((row) => row.country_code === value);
                        setNotesDraft(country?.notes || "");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {marketCountries.map((country) => (
                          <SelectItem key={country.country_code} value={country.country_code}>
                            {country.country_name} ({country.country_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCountry && (
                    <div className="space-y-4 rounded-md border p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Legal Status</Label>
                          <Select
                            value={selectedCountry.legal_status}
                            onValueChange={(value) => {
                              const legalStatus = value as LegalStatus;
                              queryClient.setQueryData(["market-countries-admin"], (current: MarketCountry[] | undefined) => {
                                if (!current) return current;
                                return current.map((row) =>
                                  row.country_code === selectedCountry.country_code ? { ...row, legal_status: legalStatus } : row
                                );
                              });
                            }}
                            disabled={!isSuperAdmin}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEGAL_STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div>
                            <Label>Selectable in product forms</Label>
                            <p className="text-xs text-muted-foreground">Country appears in onboarding/signup selectors.</p>
                          </div>
                          <Switch
                            checked={selectedCountry.is_selectable}
                            onCheckedChange={(checked) => {
                              queryClient.setQueryData(["market-countries-admin"], (current: MarketCountry[] | undefined) => {
                                if (!current) return current;
                                return current.map((row) =>
                                  row.country_code === selectedCountry.country_code ? { ...row, is_selectable: checked } : row
                                );
                              });
                            }}
                            disabled={!isSuperAdmin}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          value={notesDraft}
                          onChange={(event) => setNotesDraft(event.target.value)}
                          placeholder="Legal/compliance notes for this market"
                          disabled={!isSuperAdmin}
                        />
                      </div>

                      <Button
                        onClick={saveMarketDetails}
                        disabled={!isSuperAdmin || updateCountryMutation.isPending || marketsLoading}
                      >
                        Save Market Changes
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Country Currency Policy</CardTitle>
                <CardDescription>
                  Set one default currency per market and optional enabled overrides (USD fallback supported).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currenciesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading currencies...</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-2">
                        <Label>Add Currency</Label>
                        <Select value={newCurrencyCode} onValueChange={setNewCurrencyCode}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_CURRENCIES.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          upsertCurrencyMutation.mutate({
                            countryCode: selectedCountryCode,
                            currencyCode: newCurrencyCode,
                          })
                        }
                        disabled={!isSuperAdmin || upsertCurrencyMutation.isPending}
                      >
                        Add
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {selectedCountryCurrencies.length === 0 && (
                        <p className="text-sm text-muted-foreground">No currencies configured for this country yet.</p>
                      )}

                      {selectedCountryCurrencies.map((currency) => (
                        <div key={currency.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div>
                            <p className="font-medium">{currency.currency_code}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{currency.is_enabled ? "Enabled" : "Disabled"}</span>
                              {currency.is_default && <Badge variant="secondary">Default</Badge>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setDefaultCurrencyMutation.mutate({
                                  countryCode: currency.country_code,
                                  currencyCode: currency.currency_code,
                                })
                              }
                              disabled={!isSuperAdmin || setDefaultCurrencyMutation.isPending}
                            >
                              Set Default
                            </Button>
                            <Switch
                              checked={currency.is_enabled}
                              onCheckedChange={(checked) =>
                                toggleCurrencyMutation.mutate({ id: currency.id, isEnabled: checked })
                              }
                              disabled={!isSuperAdmin || toggleCurrencyMutation.isPending}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        <Dialog open={killSwitchDialogOpen} onOpenChange={setKillSwitchDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {pendingKillSwitchState ? "Enable Kill Switch" : "Disable Kill Switch"}
              </DialogTitle>
              <DialogDescription>
                {pendingKillSwitchState
                  ? "This will put the entire platform into read-only mode. All write operations will be blocked."
                  : "This will restore normal platform operations."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {pendingKillSwitchState && (
                <div className="space-y-2">
                  <Label>Reason (required)</Label>
                  <Textarea
                    value={killSwitchReason}
                    onChange={(event) => setKillSwitchReason(event.target.value)}
                    placeholder="e.g., Emergency maintenance, security incident..."
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  2FA code
                </Label>
                <input
                  value={killSwitchTotpToken}
                  onChange={(e) => setKillSwitchTotpToken(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
              </div>
              {killSwitchSecurityError && (
                <p className="text-sm text-destructive">{killSwitchSecurityError}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setKillSwitchDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={pendingKillSwitchState ? "destructive" : "default"}
                onClick={confirmKillSwitch}
                disabled={toggleKillSwitchMutation.isPending}
              >
                {toggleKillSwitchMutation.isPending
                  ? "Verifying..."
                  : pendingKillSwitchState
                  ? "Enable Kill Switch"
                  : "Disable Kill Switch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Maintenance Banner — 2FA confirm before save */}
        <Dialog open={maintBannerDialogOpen} onOpenChange={setMaintBannerDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-amber-500" />
                Save Maintenance Banner Settings
              </DialogTitle>
              <DialogDescription>
                Confirm with your 2FA code to apply changes
                {maintEnabled ? " and activate the banner" : ""}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  2FA code
                </Label>
                <input
                  value={maintTotpToken}
                  onChange={(e) => setMaintTotpToken(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
              </div>
              {maintSecurityError && (
                <p className="text-sm text-destructive">{maintSecurityError}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMaintBannerDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmSaveMaintenanceBanner}
                disabled={saveMaintenanceBannerMutation.isPending}
              >
                {saveMaintenanceBannerMutation.isPending ? "Saving..." : "Confirm & Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
