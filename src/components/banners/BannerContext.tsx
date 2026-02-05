import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useStaffInvitations } from "@/hooks/useStaffInvitations";

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

interface BannerContextType {
  banners: Banner[];
  activeBanner: Banner | null;
  currentIndex: number;
  totalBanners: number;
  dismissBanner: (id: string) => void;
  nextBanner: () => void;
  prevBanner: () => void;
  goToBanner: (index: number) => void;
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
  const { currentTenant } = useAuth();
  const { pendingInvitations } = useStaffInvitations();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [maintenanceEvents, setMaintenanceEvents] = useState<any[]>([]);

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

  // Build banners based on platform and tenant status
  const banners = useMemo(() => {
    const result: Banner[] = [];

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

    // Priority 5 & 9: Maintenance (all platforms)
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

    // Sort by priority (lower = higher priority)
    result.sort((a, b) => a.priority - b.priority);

    // Filter out dismissed banners
    return result.filter((b) => !dismissedIds.includes(b.id));
  }, [currentTenant, platform, maintenanceEvents, pendingInvitations, dismissedIds]);

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

  const value: BannerContextType = {
    banners,
    activeBanner: banners[currentIndex] || null,
    currentIndex,
    totalBanners: banners.length,
    dismissBanner,
    nextBanner,
    prevBanner,
    goToBanner,
  };

  return (
    <BannerContext.Provider value={value}>
      {children}
    </BannerContext.Provider>
  );
}
