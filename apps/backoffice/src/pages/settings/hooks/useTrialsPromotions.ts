import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/supabase";
import { writeAuditLog } from "../utils";
import type { ActorUser, TenantTrialOverride } from "../types";

/** Global trial period, promo-code trial bonus, and per-tenant gifted trials. */
export function useTrialsPromotions(backofficeUser: ActorUser | null | undefined) {
  const queryClient = useQueryClient();

  const [trialDaysDraft, setTrialDaysDraft] = useState(14);
  const [promoBonusEnabled, setPromoBonusEnabled] = useState(true);
  const [promoBonusWindowDays, setPromoBonusWindowDays] = useState(7);
  const [promoBonusDays, setPromoBonusDays] = useState(7);
  const [overrideTenantId, setOverrideTenantId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStartsAt, setOverrideStartsAt] = useState("");
  const [overrideEndsAt, setOverrideEndsAt] = useState("");

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

      // Best-effort: the override is already live regardless of whether
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

  return {
    trialDaysDraft,
    setTrialDaysDraft,
    defaultTrialDays,
    updateDefaultTrialDaysMutation,

    promoBonusEnabled,
    setPromoBonusEnabled,
    promoBonusWindowDays,
    setPromoBonusWindowDays,
    promoBonusDays,
    setPromoBonusDays,
    updatePromoBonusMutation,

    overrideTenantId,
    setOverrideTenantId,
    overrideReason,
    setOverrideReason,
    overrideStartsAt,
    setOverrideStartsAt,
    overrideEndsAt,
    setOverrideEndsAt,
    trialOverrides,
    createTrialOverrideMutation,
    revokeTrialOverrideMutation,
  };
}
