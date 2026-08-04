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
          cta: { label: "Update Billing", path: "/salon/settings?tab=subscription" },
          dismissible: false,
          blocking: true,
        });
      }

      // Priority 3: Trial Expired
      if (currentTenant.subscription_status === "trialing" && currentTenant.trial_ends_at) {
        const trialEnd = new Date(currentTenant.trial_ends_at);
        const now = new Date();
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60));

        if (daysLeft <= 0) {
          result.push({
            id: "trial-expired",
            priority: 3,
            variant: "error",
            title: "Trial Expired",
            message: "Your trial has ended. Upgrade now to restore full access.",
            cta: { label: "Upgrade Now", path: "/salon/settings?tab=subscription" },
            dismissible: false,
            blocking: true,
          });
        } else if (daysLeft <= 7 && daysLeft > 0) {
          // Priority 7: Trial T-7 days
          result.push({
            id: "trial-7days",
            priority: 7,
            variant: "warning",
            title: "Trial Ending Soon",
            message: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Upgrade to continue.`,
            cta: { label: "Upgrade", path: "/salon/settings?tab=subscription" },
            dismissible: true,
            blocking: false,
          });
        } else if (hoursLeft <= 72 && hoursLeft > 0) {
          // Priority 8: Trial T-3 days/hours
          result.push({
            id: "trial-3days",
            priority: 8,
            variant: "warning",
            title: "Trial Ending Very Soon",
            message: `Your trial ends in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}. Upgrade now!`,
            cta: { label: "Upgrade Now", path: "/salon/settings?tab=subscription" },
            dismissible: true,
            blocking: false,
          });
        }
      }

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
