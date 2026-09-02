import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useStaffInvitations } from "@/hooks/useStaffInvitations";
import { useLocation } from "react-router-dom";

export type BannerVariant = "error" | "warning" | "info" | "success" | "maintenance";
export type BannerPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface Banner {
  id: string;
  priority: BannerPriority;
  variant: BannerVariant;
  title: string;
  message: string;
  cta?: {
    label: string;
    path?: string;
    action?: () => void;
  };
  dismissible: boolean;
  blocking: boolean;
}

export interface MaintenanceBannerSetting {
  enabled: boolean;
  mode: "immediate" | "scheduled";
  platforms: string[];
  scheduled_at: string | null;
  title: string;
  description: string;
  guidance: string;
}

interface BannerContextType {
  banners: Banner[];
  activeBanner: Banner | null;
  currentIndex: number;
  totalBanners: number;
  dismissBanner: (id: string) => void;
  nextBanner: () => void;
  prevBanner: () => void;
  goToBanner: (index: number) => void;
  maintenanceBannerSetting: MaintenanceBannerSetting | null;
  maintenanceModalOpen: boolean;
  openMaintenanceModal: () => void;
  closeMaintenanceModal: () => void;
}

const BannerContext = createContext<BannerContextType | undefined>(undefined);

export function useBanners() {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error("useBanners must be used within a BannerProvider");
  }
  return context;
}

interface BannerProviderProps {
  children: ReactNode;
  platform: "salon" | "booking" | "client" | "backoffice";
}

export function BannerProvider({ children, platform }: BannerProviderProps) {
  const { currentTenant, isActiveContextPaused } = useAuth();
  const { pendingInvitations } = useStaffInvitations();
  const routerLocation = useLocation();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [maintenanceEvents, setMaintenanceEvents] = useState<any[]>([]);
  const [killSwitch, setKillSwitch] = useState<{ enabled: boolean; reason?: string | null } | null>(null);
  const [maintenanceBannerSetting, setMaintenanceBannerSetting] = useState<MaintenanceBannerSetting | null>(null);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);

  // Fetch active maintenance events
  useEffect(() => {
    const fetchMaintenance = async () => {
      const { data } = await supabase
        .from("maintenance_events")
        .select("*")
        .eq("is_active", true)
        .order("severity", { ascending: false });

      if (data) {
        setMaintenanceEvents(data);
      }
    };

    fetchMaintenance();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("maintenance_updates")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "maintenance_events"
      }, fetchMaintenance)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Fetch kill switch state and subscribe to changes
  useEffect(() => {
    const fetchKillSwitch = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "kill_switch")
        .maybeSingle();
      if (data?.value) {
        const v = data.value as Record<string, unknown>;
        setKillSwitch({ enabled: v.enabled === true, reason: v.reason as string | null });
      }
    };

    fetchKillSwitch();

    const channel = supabase
      .channel("kill_switch_updates")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "platform_settings",
        filter: "key=eq.kill_switch",
      }, fetchKillSwitch)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  // Fetch maintenance_banner setting and subscribe to changes
  useEffect(() => {
    const parseValue = (value: Record<string, unknown> | null): MaintenanceBannerSetting | null => {
      if (!value) return null;
      return {
        enabled: value.enabled === true,
        mode: value.mode === "scheduled" ? "scheduled" : "immediate",
        platforms: Array.isArray(value.platforms) ? (value.platforms as string[]) : [],
        scheduled_at: typeof value.scheduled_at === "string" ? value.scheduled_at : null,
        title: typeof value.title === "string" ? value.title : "Scheduled Maintenance",
        description: typeof value.description === "string" ? value.description : "",
        guidance: typeof value.guidance === "string" ? value.guidance : "",
      };
    };

    const fetchMaintBanner = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "maintenance_banner")
        .maybeSingle();
      setMaintenanceBannerSetting(parseValue(data?.value as Record<string, unknown> | null));
    };

    fetchMaintBanner();

    const channel = supabase
      .channel("maintenance_banner_updates")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "platform_settings",
        filter: "key=eq.maintenance_banner",
      }, fetchMaintBanner)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  // Build banners based on platform and tenant status
  const banners = useMemo(() => {
    const result: Banner[] = [];

    // Priority 1: Platform kill switch (overrides everything, non-dismissible)
    if (killSwitch?.enabled) {
      result.push({
        id: "kill-switch",
        priority: 1,
        variant: "error",
        title: "Platform Maintenance",
        message: killSwitch.reason?.trim() || "The platform is currently undergoing emergency maintenance. Please try again later.",
        dismissible: false,
        blocking: true,
      });
    }

    // Priority 4: Paused branch (salon platform, non-dismissible)
    if (platform === "salon" && isActiveContextPaused && !routerLocation.pathname.startsWith("/salon/overview")) {
      result.push({
        id: "paused-branch",
        priority: 4,
        variant: "error",
        title: "Branch Paused",
        message: "This branch is currently paused. All actions are disabled. Switch to an active branch or revive this one from Business Hub.",
        cta: { label: "Business Hub", path: "/salon/overview" },
        dismissible: false,
        blocking: true,
      });
    }

    if (!currentTenant && platform === "salon") return result;

    // Platform-specific banners
    if (platform === "salon" && currentTenant) {
      // Priority 2: Payment Failed
      if (currentTenant.subscription_status === "past_due") {
        result.push({
          id: "payment-failed",
          priority: 2,
          variant: "error",
          title: "Payment Failed",
          message: "Your payment has failed. Update your billing to avoid service interruption.",
          cta: { label: "Update Billing", path: "/salon/subscription" },
          dismissible: false,
          blocking: true,
        });
      }

      // Trial status (expired-block, T-7/T-3 warnings) is NOT handled here —
      // TrialBanner.tsx already owns the full lifecycle via useTrialEnforcement
      // (which is override-aware), rendering its own non-dismissable blocking
      // dialog when hard-expired and its own warning strip otherwise. This
      // banner system used to duplicate that logic independently, which meant
      // a hard-expired tenant got TWO blocking overlays stacked on top of each
      // other — the cruder one from here (no "Contact Admin" path, and until
      // recently no sign-out) painted over TrialBanner's better one underneath.

      // Priority 12: Owner Invite Expired
      const expiredOwnerInvite = pendingInvitations.find(
        (inv) => inv.role === "owner" && new Date(inv.expires_at) < new Date()
      );
      if (expiredOwnerInvite) {
        result.push({
          id: "owner-invite-expired",
          priority: 12,
          variant: "warning",
          title: "Owner Invitation Expired",
          message: "The owner invitation has expired. Please resend it.",
          cta: { label: "View Staff", path: "/salon/staff" },
          dismissible: true,
          blocking: false,
        });
      }
    }

    // Priority 5 & 9: Maintenance events (all platforms)
    maintenanceEvents.forEach((event) => {
      const isHighSeverity = event.severity === "high" || event.severity === "critical";
      result.push({
        id: `maintenance-${event.id}`,
        priority: isHighSeverity ? 5 : 9,
        variant: isHighSeverity ? "error" : "maintenance",
        title: event.title,
        message: event.description || "System maintenance in progress.",
        dismissible: !isHighSeverity,
        blocking: isHighSeverity,
      });
    });

    // Priority 6: Platform maintenance banner (from BO settings)
    if (
      maintenanceBannerSetting?.enabled &&
      maintenanceBannerSetting.platforms.includes("salon_admin")
    ) {
      const isScheduled = maintenanceBannerSetting.mode === "scheduled";
      const scheduledAt = maintenanceBannerSetting.scheduled_at
        ? new Date(maintenanceBannerSetting.scheduled_at)
        : null;
      const isUpcoming = scheduledAt && scheduledAt > new Date();

      let message = maintenanceBannerSetting.title;
      if (isScheduled && isUpcoming) {
        message = `Maintenance scheduled for ${scheduledAt.toLocaleString()}`;
      }

      result.push({
        id: "platform-maintenance-banner",
        priority: 6,
        variant: "maintenance",
        title: isScheduled && isUpcoming ? "Upcoming Maintenance" : maintenanceBannerSetting.title,
        message,
        cta: { label: "Learn more", action: () => setMaintenanceModalOpen(true) },
        dismissible: true,
        blocking: false,
      });
    }

    // Sort by priority (lower = higher priority)
    result.sort((a, b) => a.priority - b.priority);

    // Filter out dismissed banners
    return result.filter((b) => !dismissedIds.includes(b.id));
  }, [currentTenant, platform, maintenanceEvents, pendingInvitations, dismissedIds, killSwitch, isActiveContextPaused, routerLocation.pathname, maintenanceBannerSetting, setMaintenanceModalOpen]);

  const dismissBanner = useCallback((id: string) => {
    setDismissedIds((prev) => [...prev, id]);
    // Store in session to persist dismissal
    const stored = JSON.parse(sessionStorage.getItem("dismissedBanners") || "[]");
    sessionStorage.setItem("dismissedBanners", JSON.stringify([...stored, id]));
  }, []);

  // Load dismissed banners from session storage
  useEffect(() => {
    const stored = JSON.parse(sessionStorage.getItem("dismissedBanners") || "[]");
    setDismissedIds(stored);
  }, []);

  // Auto-rotate every 30 minutes if multiple banners
  useEffect(() => {
    if (banners.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [banners.length]);

  // Reset index if it exceeds banner count
  useEffect(() => {
    if (currentIndex >= banners.length && banners.length > 0) {
      setCurrentIndex(0);
    }
  }, [banners.length, currentIndex]);

  const nextBanner = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const prevBanner = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  const goToBanner = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const openMaintenanceModal = useCallback(() => setMaintenanceModalOpen(true), []);
  const closeMaintenanceModal = useCallback(() => setMaintenanceModalOpen(false), []);

  const value: BannerContextType = {
    banners,
    activeBanner: banners[currentIndex] || null,
    currentIndex,
    totalBanners: banners.length,
    dismissBanner,
    nextBanner,
    prevBanner,
    goToBanner,
    maintenanceBannerSetting,
    maintenanceModalOpen,
    openMaintenanceModal,
    closeMaintenanceModal,
  };

  return (
    <BannerContext.Provider value={value}>
      {children}
    </BannerContext.Provider>
  );
}
