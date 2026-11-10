import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/supabase";
import { getPlatformSettingId, parseKillSwitch, parseMaintBanner, writeAuditLog } from "../utils";
import type { ActorUser, AuthSession, MaintenanceBannerValue, MaintenancePlatform } from "../types";

/**
 * Kill switch, maintenance banner, and OTP rate limiting — the three
 * "Safety controls" widgets. Kept as one hook because the kill switch and
 * maintenance banner share the same 2FA step-up confirm flow (same edge
 * function, same resource-id lookup), so splitting them further would just
 * duplicate that flow twice.
 */
export function useSafetyControls(
  backofficeUser: ActorUser | null | undefined,
  session: AuthSession | null | undefined,
  profileFullName: string | null | undefined,
  isSuperAdmin: boolean,
) {
  const queryClient = useQueryClient();

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

  const [otpLimitEnabled, setOtpLimitEnabled] = useState(true);
  const [otpMaxPerHour, setOtpMaxPerHour] = useState(3);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(60);
  const [otpMaxPerHourPerIp, setOtpMaxPerHourPerIp] = useState(10);

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

  const toggleKillSwitchMutation = useMutation({
    mutationFn: async ({ enabled, reason }: { enabled: boolean; reason: string }) => {
      const newValue: Record<string, Json> = {
        enabled,
        reason: enabled ? reason : null,
        enabled_at: enabled ? new Date().toISOString() : null,
        enabled_by: enabled ? profileFullName || backofficeUser?.user_id || null : null,
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
      // Upsert instead of update-only: an older environment may not have run
      // the seed migration yet. Supabase can return a successful update with
      // zero affected rows in that case, which made the UI report success
      // while the salon and client apps had nothing to read.
      const { error } = await supabase
        .from("platform_settings")
        .upsert(
          {
            key: "maintenance_banner",
            value: newValue as unknown as Json,
            description: "Configurable maintenance banner shown on salon-admin and/or client-portal",
            updated_by_id: backofficeUser?.user_id,
          },
          { onConflict: "key" },
        );
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
    const resourceId = await getPlatformSettingId("kill_switch");
    if (!resourceId) {
      setKillSwitchSecurityError("Could not find the kill switch setting. Please refresh and try again.");
      return;
    }
    const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
      body: {
        token: killSwitchTotpToken.trim(),
        action: "kill_switch_write",
        resourceId,
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
    const resourceId = await getPlatformSettingId("maintenance_banner");
    if (!resourceId) {
      setMaintSecurityError("Could not find the maintenance banner setting. Please refresh and try again.");
      return;
    }
    const verify = await supabase.functions.invoke("backoffice-verify-step-up-totp", {
      body: {
        token: maintTotpToken.trim(),
        action: "maintenance_banner_write",
        resourceId,
        accessToken: session.access_token,
      },
    });
    if (verify.error || !verify.data?.valid) {
      setMaintSecurityError(verify.data?.error || verify.error?.message || "2FA verification failed");
      return;
    }
    saveMaintenanceBannerMutation.mutate();
  };

  return {
    killSwitch,
    killSwitchLoading,
    killSwitchDialogOpen,
    setKillSwitchDialogOpen,
    killSwitchReason,
    setKillSwitchReason,
    pendingKillSwitchState,
    killSwitchTotpToken,
    setKillSwitchTotpToken,
    killSwitchSecurityError,
    handleKillSwitchToggle,
    confirmKillSwitch,
    toggleKillSwitchMutation,

    maintBanner,
    maintEnabled,
    setMaintEnabled,
    maintMode,
    setMaintMode,
    maintPlatforms,
    setMaintPlatforms,
    maintScheduledAt,
    setMaintScheduledAt,
    maintTitle,
    setMaintTitle,
    maintDescription,
    setMaintDescription,
    maintGuidance,
    setMaintGuidance,
    maintBannerDialogOpen,
    setMaintBannerDialogOpen,
    maintTotpToken,
    setMaintTotpToken,
    maintSecurityError,
    openMaintenanceBannerSaveDialog,
    confirmSaveMaintenanceBanner,
    saveMaintenanceBannerMutation,

    otpLimitEnabled,
    setOtpLimitEnabled,
    otpMaxPerHour,
    setOtpMaxPerHour,
    otpCooldownSeconds,
    setOtpCooldownSeconds,
    otpMaxPerHourPerIp,
    setOtpMaxPerHourPerIp,
    updateOtpRateLimitMutation,
  };
}
