import { useState, useEffect, createContext, useContext, ReactNode, useMemo, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  Scissors,
  Users,
  CreditCard,
  BarChart3,
  MessageSquare,
  UserCog,
  Settings,
  LogOut,
  HelpCircle,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Bell,
  Plus,
  FileText,
  Loader2,
  Palette,
  CalendarX2,
  Globe,
  Shield,
  Zap,
  User,
  Clock,
  PauseCircle,
  Wallet,
  Banknote,
} from "lucide-react";
import { MyProfileModal } from "@/components/profile/MyProfileModal";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { cn } from "@shared/utils";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { supabase } from "@/lib/supabase";
import { useToast } from "@ui/ui/use-toast";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { QuickCreateDialog } from "@/components/dialogs/QuickCreateDialog";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { InactivityGuard } from "@/components/session/InactivityGuard";
import { useNotifications } from "@/hooks/useNotifications";
import { BannerProvider, GlobalBanner, BlockingBannerOverlay, MaintenanceBannerModal } from "@/components/banners";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useStaffOperationsAddon } from "@/hooks/useStaffOperationsAddon";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { TrialReminderModals } from "@/components/billing/TrialReminderModals";
import { PromoTrialBonusBanner } from "@/components/billing/PromoTrialBonusBanner";
import { PlanChangeBanner } from "@/components/layout/PlanChangeBanner";
import { AnnualLockinBanner } from "@/components/layout/AnnualLockinBanner";
import { useStaffSessions } from "@/hooks/useStaffSessions";
import { NewDeviceReviewModal } from "@/components/session/NewDeviceReviewModal";
import { isModuleAllowedInContext, ROUTE_DEFINITIONS } from "@/lib/contextAccess";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ui/alert-dialog";

// User profile section component
function UserProfileSection({ isExpanded, isMobileOpen, onCloseMobile }: { isExpanded: boolean; isMobileOpen: boolean; onCloseMobile: () => void }) {
  const { user, profile } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <>
      <button
        type="button"
        onClick={() => { onCloseMobile(); setProfileOpen(true); }}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 mt-2 w-full rounded-lg transition-colors hover:bg-white/10 cursor-pointer",
          !isExpanded && !isMobileOpen && "justify-center"
        )}
      >
        <div className="relative w-8 h-8 flex-shrink-0">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 bg-white/20 text-white rounded-full flex items-center justify-center text-sm font-medium">
              {initials}
            </div>
          )}
        </div>
        {(isExpanded || isMobileOpen) && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate text-white">
              {displayName}
            </p>
            <p className="text-xs text-white/70 truncate">
              {displayEmail}
            </p>
          </div>
        )}
        {(isExpanded || isMobileOpen) && (
          <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0" />
        )}
      </button>
      <MyProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string | number;
  module?: string;
  children?: Omit<NavItem, "children">[];
}

const SIDEBAR_DRAG_THRESHOLD = 8;

function IntentionalSidebarLink({
  to,
  navigateTo,
  className,
  ariaLabel,
  children,
}: {
  to: string;
  navigateTo: (path: string) => void;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const pointerGesture = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    moved: false,
  });

  return (
    <Link
      to={to}
      onPointerDown={(event) => {
        pointerGesture.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const gesture = pointerGesture.current;
        if (gesture.pointerId !== event.pointerId || gesture.moved) return;
        if (
          Math.hypot(
            event.clientX - gesture.startX,
            event.clientY - gesture.startY,
          ) >= SIDEBAR_DRAG_THRESHOLD
        ) {
          gesture.moved = true;
        }
      }}
      onPointerCancel={() => {
        pointerGesture.current.moved = true;
      }}
      onClick={(event) => {
        const wasDragged = pointerGesture.current.moved;
        pointerGesture.current.pointerId = -1;
        pointerGesture.current.moved = false;

        if (wasDragged) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        // Navigate explicitly on click so dismissable-layer components cannot
        // swallow the link, while still allowing touch scrolling to cancel it.
        event.preventDefault();
        event.stopPropagation();
        navigateTo(to);
      }}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}

// These paths live on the mobile bottom nav — hide them from the drawer on mobile/tablet
const BOTTOM_NAV_PATHS = new Set([
  "/salon",
  "/salon/appointments",
  "/salon/services",
  "/salon/transactions",
  "/salon/customers",
]);

const mainNavItems: NavItem[] = [
	{
		label: "Dashboard",
		icon: LayoutDashboard,
		path: "/salon",
		module: "dashboard",
	},
	{
		label: "Business Overview",
		icon: Building2,
		path: "/salon/overview",
		module: "salons_overview",
	},
	{
		label: "Appointments",
		icon: Calendar,
		path: "/salon/appointments",
		module: "appointments",
	},
	{
		label: "Customers",
		icon: Users,
		path: "/salon/customers",
		module: "customers",
	},
	{
		label: "Services and Products",
		icon: Scissors,
		path: "/salon/services",
		module: "services",
	},
	{
		label: "Transactions",
		icon: CreditCard,
		path: "/salon/transactions",
		module: "payments",
	},
	{
		label: "Reports",
		icon: BarChart3,
		path: "/salon/reports",
		module: "reports",
	},
	{
		label: "Messaging",
		icon: MessageSquare,
		path: "/salon/messaging",
		module: "messaging",
	},
	{ label: "Staff", icon: UserCog, path: "/salon/staff-group" },
	{
		label: "All Notifications",
		icon: Bell,
		path: "/salon/all-notifications",
		module: "notifications",
	},
	{
		label: "Subscription",
		icon: Zap,
		path: "/salon/subscription",
		module: "billing",
	},
	{
		label: "Settings",
		icon: Settings,
		path: "/salon/settings",
		module: "settings",
	},
];

const utilityNavItems: NavItem[] = [
  { label: "Help", icon: HelpCircle, path: "/salon/help" }, // Help is always visible
];

interface SidebarContextType {
  isExpanded: boolean;
  isMobileOpen: boolean;
  toggleExpanded: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

interface SalonSidebarProps {
  children: ReactNode;
}

export function SalonSidebar({ children }: SalonSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [accessRefreshNoticeId, setAccessRefreshNoticeId] = useState<string | null>(null);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const [reviewSessionsOpen, setReviewSessionsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Open the new-device review modal when redirected from the security email CTA
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("review-sessions") === "true") {
      setReviewSessionsOpen(true);
      // Remove the param from the URL without a page reload
      const cleanUrl = location.pathname + location.search.replace(/[?&]review-sessions=true/, "").replace(/^\?$/, "");
      navigate(cleanUrl, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);
  const { toast } = useToast();
  const notificationsData = useNotifications();
  const { unreadCount } = notificationsData;
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const staffOperationsAddon = useStaffOperationsAddon();
  const {
    currentTenant,
    activeContextType,
    activeLocationId,
    availableContexts,
    isAssignmentPending,
    setActiveContext,
    getFirstAllowedRoute,
    refreshTenants,
    canUseOwnerHub,
  } = useAuth();

  // Start staff session on mount
  const { startSession } = useStaffSessions();
  useEffect(() => {
    startSession();
  }, [startSession]);

  // Filter nav items based on permissions - return empty during loading to prevent flash
  const filteredMainNavItems = useMemo(() => {
    if (permissionsLoading || isAssignmentPending) return []; // Return EMPTY to prevent flash
    const canSeeTeamMembers = hasPermission("staff");
    const canSeeMyShift = staffOperationsAddon.isEnabled;
    const visibleItems = mainNavItems.filter((item) => {
      if (item.path === "/salon/staff-group") {
        return canSeeTeamMembers || canSeeMyShift;
      }
      if (item.path === "/salon/all-notifications") {
        return activeContextType === "owner_hub";
      }
      if (item.path === "/salon/audit-log" && currentTenant?.plan === "chain" && activeContextType !== "owner_hub") {
        return false;
      }
      if (!item.module) return true; // No module = always visible
      if (item.module === "appointments") {
        const canAccessOwnAppointments = hasPermission("appointments:own");
        return (hasPermission("appointments") || canAccessOwnAppointments) &&
          isModuleAllowedInContext(item.module, activeContextType);
      }
      if (item.module === "salons_overview" && canUseOwnerHub && activeContextType === "owner_hub") {
        return true;
      }
      return hasPermission(item.module) && isModuleAllowedInContext(item.module, activeContextType);
    });
    const isChain = currentTenant?.plan === "chain";
    return visibleItems.map((item) => {
      if (item.path === "/salon/staff-group") {
        const teamMembersPath = activeContextType === "owner_hub" ? "/salon/overview/staff" : "/salon/staff";
        const children: Omit<NavItem, "children">[] = [];
        if (canSeeTeamMembers) {
          children.push({ label: "Team Members", icon: UserCog, path: teamMembersPath });
        }
        if (canSeeMyShift) {
          children.push({ label: "My Shift", icon: Clock, path: "/salon/my-shift" });
        }
        // Single-child case: skip the dropdown wrapper and link straight in.
        if (children.length === 1) {
          return { ...item, label: children[0].label, icon: children[0].icon, path: children[0].path };
        }
        return { ...item, children };
      }
      if (item.path === "/salon/settings") {
        if (activeContextType === "owner_hub") {
          if (isChain) {
            return {
              ...item,
              label: "Business Settings",
              path: "/salon/business-settings",
              children: [
                { label: "Business Profile", icon: Building2, path: "/salon/business-settings?tab=profile" },
                { label: "Manage Branches", icon: CalendarX2, path: "/salon/business-settings?tab=branches" },
                { label: "Booking Settings", icon: User, path: "/salon/business-settings?tab=booking" },
                { label: "Payout Destinations", icon: Banknote, path: "/salon/business-settings?tab=payout-destinations" },
                { label: "Notifications", icon: Bell, path: "/salon/business-settings?tab=notifications" },
                { label: "Custom Domain", icon: Globe, path: "/salon/business-settings?tab=custom-domain" },
                { label: "Active Sessions", icon: Shield, path: "/salon/business-settings?tab=sessions" },
                { label: "Themes Settings", icon: Palette, path: "/salon/themes-settings" },
                { label: "Audit Log", icon: FileText, path: "/salon/audit-log" },
              ],
            };
          }
          return {
            ...item,
            label: "Business Settings",
            path: "/salon/business-settings",
            children: [
              { label: "Salon Profile", icon: Building2, path: "/salon/business-settings?tab=profile" },
              { label: "Manage Branches", icon: CalendarX2, path: "/salon/business-settings?tab=branches" },
              { label: "Booking Settings", icon: User, path: "/salon/business-settings?tab=booking" },
              { label: "Payout Destinations", icon: Banknote, path: "/salon/business-settings?tab=payout-destinations" },
              { label: "Notifications", icon: Bell, path: "/salon/business-settings?tab=notifications" },
              { label: "Custom Domain", icon: Globe, path: "/salon/business-settings?tab=custom-domain" },
              { label: "Active Sessions", icon: Shield, path: "/salon/business-settings?tab=sessions" },
              { label: "Themes Settings", icon: Palette, path: "/salon/themes-settings" },
              { label: "Audit Log", icon: FileText, path: "/salon/audit-log" },
            ],
          };
        }
        return {
          ...item,
          label: "Branch Settings",
          path: "/salon/branch-settings",
          children: [
            { label: "Branch Profile", icon: Building2, path: "/salon/branch-settings?tab=profile" },
            { label: "Branch Hours", icon: CalendarX2, path: "/salon/branch-settings?tab=hours" },
            // Chain audit trail only makes sense rolled up at the business level.
            ...(isChain ? [] : [{ label: "Audit Log", icon: FileText, path: "/salon/audit-log" }]),
          ],
        };
      }
      if (item.path === "/salon/transactions" && activeContextType === "owner_hub") {
        return {
          ...item,
          label: "Cashflow & Payouts",
          children: [
            { label: "Cashflow", icon: CreditCard, path: "/salon/transactions" },
            { label: "Payouts", icon: Wallet, path: "/salon/payouts" },
          ],
        };
      }
      return item;
    });
  }, [activeContextType, availableContexts, canUseOwnerHub, currentTenant?.plan, hasPermission, isAssignmentPending, permissionsLoading, staffOperationsAddon.isEnabled]);

  const contextValue = useMemo(() => {
    if (activeContextType === "owner_hub") return "owner_hub";
    return activeLocationId || "";
  }, [activeContextType, activeLocationId]);

  // Get plan display info
  const getPlanDisplay = () => {
    if (!currentTenant) return { emoji: "🎁", label: "Free" };

    const isTrialing = currentTenant.subscription_status === "trialing";
    const isPastDue = currentTenant.subscription_status === "past_due";
    const isActive = currentTenant.subscription_status === "active";
    const planLabel = currentTenant.plan
      ? currentTenant.plan.charAt(0).toUpperCase() + currentTenant.plan.slice(1)
      : "Pro";

    if (isPastDue) {
      return { emoji: "⚠️", label: "Past Due" };
    }
    if (isTrialing) {
      // The countdown lives in the header chip only — this badge just shows
      // which tier they'd be upgrading to, same styling whether trialing or
      // already paying for it.
      return { emoji: "✨", label: `${planLabel} plan (trial)` };
    }
    if (isActive) {
      return { emoji: "✨", label: planLabel };
    }
    return { emoji: "🎁", label: "Free" };
  };

  const planDisplay = getPlanDisplay();
  const accessRefreshNotice = notificationsData.notifications.find(
    (notification) =>
      notification.id === accessRefreshNoticeId &&
      !notification.read &&
      (notification.entity_type === "user_role" || notification.entity_type === "staff_location")
  );

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Auto-switch to location context when navigating to a route that is not
  // available in owner_hub (e.g. Messaging, Appointments, Calendar).
  useEffect(() => {
    if (permissionsLoading || isAssignmentPending) return;
    if (activeContextType !== "owner_hub") return;
    const currentRoute = ROUTE_DEFINITIONS.find((r) => r.path === location.pathname);
    if (!currentRoute?.module) return;
    if (isModuleAllowedInContext(currentRoute.module, "owner_hub")) return;
    const targetLocationId = availableContexts.find((c) => c.type === "location")?.locationId ?? null;
    if (targetLocationId) {
      void setActiveContext("location", targetLocationId);
    }
  }, [location.pathname, activeContextType, availableContexts, permissionsLoading, isAssignmentPending, setActiveContext]);

  // Auto-expand any nav group whose child matches the current route
  useEffect(() => {
    for (const item of filteredMainNavItems) {
      if (!item.children) continue;
      const hasActiveChild = item.children.some((child) => {
        const [childPathname, childSearch] = child.path.split("?");
        if (location.pathname !== childPathname) return false;
        if (!childSearch) return true;
        const childParams = new URLSearchParams(childSearch);
        const currentParams = new URLSearchParams(location.search);
        for (const [key, val] of childParams) {
          if (currentParams.get(key) !== val) return false;
        }
        return true;
      });
      if (hasActiveChild) {
        setExpandedGroups((prev) => new Set([...prev, item.path]));
      }
    }
  }, [location.pathname, location.search, filteredMainNavItems]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Keyboard shortcut for Quick Create
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setQuickCreateOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const latestAccessNotice = notificationsData.notifications.find(
      (notification) =>
        !notification.read &&
        notification.type === "staff" &&
        (notification.entity_type === "user_role" || notification.entity_type === "staff_location")
    );

    if (!latestAccessNotice) {
      setAccessRefreshNoticeId(null);
      return;
    }

    if (latestAccessNotice.id !== accessRefreshNoticeId) {
      setAccessRefreshNoticeId(latestAccessNotice.id);
      toast({
        title: "Access updated",
        description: "Your role or assignment changed. Refresh to continue.",
      });
    }
  }, [accessRefreshNoticeId, notificationsData.notifications, toast]);

  const handleRefreshAccess = async () => {
    if (!accessRefreshNotice) return;
    const noticeId = accessRefreshNotice.id;
    setRefreshingAccess(true);
    // Close immediately so one click is enough even before network round-trips finish.
    setAccessRefreshNoticeId(null);
    try {
      await notificationsData.markAsRead(noticeId);
      if (!currentTenant?.id) {
        window.location.assign("/salon");
        return;
      }

      // Resolve fresh context + routes directly from server so role/location changes
      // are applied before choosing the redirect destination.
      const { data: resolvedContext } = await (supabase.rpc as any)("resolve_user_contexts", {
        p_tenant_id: currentTenant.id,
      });

      const nextContextType =
        resolvedContext?.default_context_type === "owner_hub" ? "owner_hub" : "location";
      const nextLocationId =
        nextContextType === "location" ? resolvedContext?.default_location_id ?? null : null;

      await (supabase.rpc as any)("set_active_context", {
        p_tenant_id: currentTenant.id,
        p_context_type: nextContextType,
        p_location_id: nextLocationId,
      });

      const { data: routesData } = await (supabase.rpc as any)("list_accessible_routes", {
        p_tenant_id: currentTenant.id,
        p_context_type: nextContextType,
        p_location_id: nextLocationId,
      });

      const routes = (Array.isArray(routesData) ? routesData : []).filter(
        (route: unknown): route is string => typeof route === "string" && route !== "/salon/access-denied"
      );
      const destination = routes[0] || "/salon/appointments";

      await refreshTenants();
      window.location.assign(destination);
    } finally {
      setRefreshingAccess(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    } else {
      navigate("/login");
    }
  };

  const handleContextChange = async (nextValue: string) => {
    if (!nextValue) return;

    const previousContextType = activeContextType;
    const previousLocationId = activeLocationId;

    const resolveContinuationRoute = async (
      contextType: "owner_hub" | "location",
      locationId: string | null,
    ) => {
      const { data } = await (supabase.rpc as any)("list_accessible_routes", {
        p_tenant_id: currentTenant?.id,
        p_context_type: contextType,
        p_location_id: locationId,
      });
      const routes = (Array.isArray(data) ? data : []).filter(
        (route: unknown): route is string => typeof route === "string" && route !== "/salon/access-denied",
      );
      const currentPath = location.pathname;
      if (routes.includes(currentPath)) {
        return currentPath;
      }
      // Preserve intent between old/new settings routes when switching context.
      if (currentPath === "/salon/settings" || currentPath === "/salon/branch-settings" || currentPath === "/salon/business-settings") {
        if (contextType === "owner_hub") {
          return "/salon/business-settings";
        }
        return "/salon/branch-settings";
      }
      return routes[0] || getFirstAllowedRoute(contextType, locationId);
    };

    if (nextValue === "owner_hub") {
      await setActiveContext("owner_hub", null);
      const route = await resolveContinuationRoute("owner_hub", null);
      navigate(route, { replace: true });
      return;
    }

    const targetContext = availableContexts.find(
      (context) => context.type === "location" && context.locationId === nextValue,
    );
    await setActiveContext("location", nextValue);
    if (
      previousContextType === "location" &&
      previousLocationId &&
      previousLocationId !== nextValue
    ) {
      toast({
        title: "Branch switched",
        description: `Successfully switched to ${targetContext?.label || "selected"} branch`,
      });
    }
    const route = await resolveContinuationRoute("location", nextValue);
    navigate(route, { replace: true });
  };

  const isActive = (path: string) => {
    if (path === "/salon" && location.pathname === "/salon") return true;
    // Keep the owner-hub overview root exact so /salon/overview/staff
    // does not highlight both "Business Overview" and "Staff".
    if (path === "/salon/overview") return location.pathname === "/salon/overview";
    if (path !== "/salon" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const isChildActive = (childPath: string) => {
    const [childPathname, childSearch] = childPath.split("?");
    if (location.pathname !== childPathname) return false;
    if (!childSearch) return true;
    const childParams = new URLSearchParams(childSearch);
    const currentParams = new URLSearchParams(location.search);
    for (const [key, val] of childParams) {
      if (currentParams.get(key) !== val) return false;
    }
    return true;
  };

  const ExpandableNavItemComponent = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const isOpen = expandedGroups.has(item.path);
    const anyChildActive = item.children?.some((c) => isChildActive(c.path)) ?? false;

    const toggle = () => {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(item.path)) next.delete(item.path);
        else next.add(item.path);
        return next;
      });
    };

    const trigger = (
			<button
				type="button"
				onClick={toggle}
				className={cn(
					"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
					anyChildActive
						? "bg-sidebar-primary/[0.14] text-sidebar-primary"
						: "text-white/80 hover:bg-white/10 hover:text-white",
				)}
			>
				<Icon className="w-5 h-5 flex-shrink-0" />
				{(isExpanded || isMobileOpen) && (
					<>
						<span className="flex-1 text-left">{item.label}</span>
						<ChevronDown
							className={cn(
								"w-4 h-4 shrink-0 transition-transform duration-200",
								isOpen ? "rotate-180" : "",
							)}
						/>
					</>
				)}
			</button>
		);

    return (
      <div>
        {!isExpanded && !isMobileOpen ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}

        {isOpen && (isExpanded || isMobileOpen) && item.children && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/15 pl-3">
            {item.children.map((child) => {
              const ChildIcon = child.icon;
              const active = isChildActive(child.path);
              return (
								<IntentionalSidebarLink
									key={child.path}
									to={child.path}
									navigateTo={(path) => navigate(path)}
									className={cn(
										"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 no-underline",
										active
											? "bg-sidebar-primary/[0.14] text-sidebar-primary"
											: "text-white/70 hover:bg-white/10 hover:text-white",
									)}
								>
									<ChildIcon className="w-4 h-4 flex-shrink-0" />
									<span>{child.label}</span>
								</IntentionalSidebarLink>
							);
            })}
          </div>
        )}
      </div>
    );
  };

  const NavItemComponent = ({ item }: { item: NavItem }) => {
    const active = isActive(item.path);
    const Icon = item.icon;

    const content = (
			<IntentionalSidebarLink
				to={item.path}
				navigateTo={(path) => navigate(path)}
				className={cn(
					"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 no-underline",
					active
						? "bg-sidebar-primary/[0.14] text-sidebar-primary"
						: "text-white/80 hover:bg-white/10 hover:text-white",
				)}
				aria-label={item.label}
			>
				<Icon className="w-5 h-5 flex-shrink-0" />
				{(isExpanded || isMobileOpen) && (
					<span className="flex-1 text-left">{item.label}</span>
				)}
				{item.badge && (isExpanded || isMobileOpen) && (
					<Badge variant="secondary" className="bg-white/20 text-white text-xs">
						{item.badge}
					</Badge>
				)}
			</IntentionalSidebarLink>
		);

    if (!isExpanded && !isMobileOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  const sidebarContent = (
		<>
			{/* Header */}
			<div className="p-4 flex items-center justify-between">
				{isExpanded || isMobileOpen ? (
					<SalonMagikLogo variant="white" size="sm" />
				) : (
					<div className="w-8 h-8 flex items-center justify-center mx-auto">
						<svg width="18" height="18" viewBox="0 0 32 32" fill="none">
							<path
								d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
								stroke="#F4C84E"
								strokeWidth="3"
								strokeLinecap="round"
							/>
							<circle cx="16" cy="16" r="2.1" fill="#ffffff" />
						</svg>
					</div>
				)}
				{isMobileOpen && (
					<button
						onClick={() => setIsMobileOpen(false)}
						className="p-2 hover:bg-white/10 rounded-lg lg:hidden text-white"
					>
						<X className="w-5 h-5" />
					</button>
				)}
			</div>

			{/* Plan Badge */}
			<div className="px-4 mb-2">
				<div
					className={cn(
						"bg-white/10 rounded-lg py-1.5 px-3 text-xs font-medium flex items-center gap-2 text-white",
						!isExpanded && !isMobileOpen && "justify-center",
					)}
				>
					<span>{planDisplay.emoji}</span>
					{(isExpanded || isMobileOpen) && <span>{planDisplay.label}</span>}
				</div>
			</div>

			{/* Context Switcher */}
			{(isExpanded || isMobileOpen) &&
				!isAssignmentPending &&
				availableContexts.length > 1 && (
					<div className="px-4 mb-2">
						<label
							htmlFor="context-switcher"
							className="mb-1 block text-[11px] font-medium text-white/70"
						>
							Switch
						</label>
						<select
							id="context-switcher"
							data-tour-id="tour-context-switcher"
							value={contextValue}
							onChange={(event) => {
								void handleContextChange(event.target.value);
							}}
							className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
						>
							{availableContexts.map((context) => (
								<option
									key={`${context.type}-${context.locationId || "owner_hub"}`}
									value={
										context.type === "owner_hub"
											? "owner_hub"
											: context.locationId || ""
									}
									className="text-ink"
								>
									{context.isPaused
										? `⏸ ${context.label} (Paused)`
										: context.label}
								</option>
							))}
						</select>
					</div>
				)}

			{/* Global Banner (only when expanded) */}
			{(isExpanded || isMobileOpen) && <GlobalBanner />}

			{/* Main Navigation */}
			<nav className="flex-1 overflow-y-auto overscroll-contain touch-pan-y scrollbar-hide px-3 space-y-1 relative z-10">
				{permissionsLoading ? (
					// Show skeleton during loading to prevent flash
					<div className="space-y-2">
						{[1, 2, 3, 4, 5, 6].map((i) => (
							<Skeleton
								key={i}
								className="h-10 w-full rounded-lg bg-white/10"
							/>
						))}
					</div>
				) : (
					filteredMainNavItems
						.filter((item) => !isMobileOpen || !BOTTOM_NAV_PATHS.has(item.path))
						.map((item) =>
							item.children ? (
								<ExpandableNavItemComponent key={item.path} item={item} />
							) : (
								<NavItemComponent key={item.path} item={item} />
							),
						)
				)}
			</nav>

			{/* Footer */}
			<div className="border-t border-white/10 p-3 space-y-1">
				{utilityNavItems.map((item) => (
					<NavItemComponent key={item.path} item={item} />
				))}

				{/* User Info */}
				<UserProfileSection
					isExpanded={isExpanded}
					isMobileOpen={isMobileOpen}
					onCloseMobile={() => setIsMobileOpen(false)}
				/>

				<button
					onClick={() => {
						setIsMobileOpen(false);
						setConfirmSignOutOpen(true);
					}}
					className={cn(
						"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
						"text-white/80 hover:text-white hover:bg-white/10",
					)}
				>
					<LogOut className="w-5 h-5 flex-shrink-0" />
					{(isExpanded || isMobileOpen) && <span>Sign out</span>}
				</button>
			</div>
		</>
	);

  return (
		<SidebarContext.Provider
			value={{
				isExpanded,
				isMobileOpen,
				toggleExpanded: () => setIsExpanded(!isExpanded),
				toggleMobile: () => setIsMobileOpen(!isMobileOpen),
				closeMobile: () => setIsMobileOpen(false),
			}}
		>
			<BannerProvider platform="salon">
				<InactivityGuard>
					<div className="min-h-screen flex bg-surface">
						{/* Mobile Overlay */}
						{isMobileOpen && (
							<div
								className="fixed inset-0 bg-black/50 z-40 lg:hidden"
								onClick={() => setIsMobileOpen(false)}
							/>
						)}

						{/* Sidebar - Mobile */}
						<aside
							className={cn(
								"fixed inset-y-0 left-0 z-[60] w-[min(18rem,calc(100vw-1.5rem))] bg-primary flex flex-col transform transition-transform duration-300 lg:hidden",
								isMobileOpen ? "translate-x-0" : "-translate-x-full",
							)}
						>
							{sidebarContent}
						</aside>

						{/* Sidebar - Desktop */}
						<aside
							className={cn(
								"hidden lg:flex flex-col bg-primary fixed top-0 left-0 z-[60] transition-all duration-300 h-screen overflow-hidden",
								isExpanded ? "w-64" : "w-[72px]",
							)}
						>
							{sidebarContent}

							{/* Collapse Toggle */}
							<button
								onClick={() => setIsExpanded(!isExpanded)}
								className="absolute -right-3 top-20 w-6 h-6 bg-white border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-muted transition-colors"
							>
								<ChevronLeft
									className={cn(
										"w-4 h-4 transition-transform text-primary",
										!isExpanded && "rotate-180",
									)}
								/>
							</button>
						</aside>

						{/* Main Content */}
						<main
							className={cn(
								"flex-1 min-w-0 flex flex-col min-h-screen overflow-hidden transition-all duration-300",
								isExpanded ? "lg:ml-64" : "lg:ml-[72px]",
							)}
						>
							{/* Top Bar */}
							<header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-50">
								<button
									onClick={() => setIsMobileOpen(true)}
									data-tour-id="tour-mobile-menu-toggle"
									className="p-2 hover:bg-muted rounded-lg lg:hidden"
								>
									<Menu className="w-5 h-5" />
								</button>

								{/* Tenant display / switcher */}
								<div className="flex-1 flex items-center gap-2.5 min-w-0 ml-1 lg:ml-0">
									<TenantSwitcher />
									{(() => {
										if (!currentTenant) return null;
										if (
											currentTenant.subscription_status === "trialing" &&
											currentTenant.trial_ends_at
										) {
											const daysLeft = Math.ceil(
												(new Date(currentTenant.trial_ends_at).getTime() -
													Date.now()) /
													86400000,
											);
											if (daysLeft > 0) {
												return (
													<span className="hidden sm:inline-flex text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap flex-shrink-0">
														Trial, {daysLeft} days left
													</span>
												);
											}
										}
										return null;
									})()}
								</div>

								<div className="flex items-center gap-2">
									{/* Quick Create Button */}
									<Button
										variant="outline"
										size="icon"
										className="sm:hidden"
										data-tour-id="tour-quick-create-mobile"
										onClick={() => setQuickCreateOpen(true)}
									>
										<Plus className="w-4 h-4" />
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="hidden sm:flex items-center gap-2"
										data-tour-id="tour-quick-create"
										onClick={() => setQuickCreateOpen(true)}
									>
										<Plus className="w-4 h-4" />
										<span className="hidden md:inline">Quick Create</span>
										<kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
											<span className="text-xs">⌘</span>N
										</kbd>
									</Button>

									{/* Notifications */}
									<Button
										variant="ghost"
										size="icon"
										className="relative"
										data-tour-id="tour-notifications"
										onClick={() => setNotificationsOpen(true)}
									>
										<Bell className="w-5 h-5" />
										{unreadCount > 0 && (
											<span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
												{unreadCount > 9 ? "9+" : unreadCount}
											</span>
										)}
									</Button>
								</div>
							</header>

							{/* Trial Banner */}
							<TrialBanner />
							<TrialReminderModals />
							<PlanChangeBanner />
							<AnnualLockinBanner />

							{/* Page Content */}
							<div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-6 lg:pt-6 lg:pb-6">
								<div className="w-full min-w-0 max-w-full [&>*]:min-w-0">
									<PromoTrialBonusBanner />
									{children}
								</div>
							</div>

							{/* Mobile Bottom Navigation */}
							<nav className="fixed bottom-0 inset-x-0 lg:hidden z-50 pb-[env(safe-area-inset-bottom)]">
								<div
									className="mx-2.5 mb-3 flex items-center justify-around rounded-[26px] px-1.5 py-2 shadow-[0_16px_32px_rgba(46,31,78,0.35)]"
									style={{ background: "white" }}
								>
									{[
										{
											label: "Home",
											icon: LayoutDashboard,
											path: "/salon",
										},
										{
											label: "Bookings",
											icon: Calendar,
											path: "/salon/appointments",
										},
										{
											label: "Services",
											icon: Scissors,
											path: "/salon/services",
										},
										{
											label: "Transactions",
											icon: CreditCard,
											path: "/salon/transactions",
										},
										{
											label: "Customers",
											icon: Users,
											path: "/salon/customers",
										},
									].map(({ label, icon: Icon, path }) => {
										const active = isActive(path);
										return (
											<button
												key={path}
												type="button"
												onClick={() => navigate(path)}
												className={cn(
													"flex flex-1 flex-col items-center gap-[3px] rounded-2xl px-2 py-[7px] transition-colors",
													active && "bg-[#F4C84E]",
												)}
											>
												<Icon
													strokeWidth={1.8}
													className={cn(
														"h-[19px] w-[19px]",
														active ? "text-[#2E1F4E]" : "text-[#2E1F4E]",
													)}
												/>
												<span
													className={cn(
														"text-[9.5px] font-semibold",
														active ? "text-[#2E1F4E]" : "text-[#2E1F4E]",
													)}
												>
													{label}
												</span>
											</button>
										);
									})}
								</div>
							</nav>
						</main>
					</div>

					{/* Blocking overlay — renders above everything when a blocking banner is active */}
					<BlockingBannerOverlay />

					{/* Maintenance banner "Learn more" modal */}
					<MaintenanceBannerModal />

					{/* Quick Create Dialog */}
					<QuickCreateDialog
						open={quickCreateOpen}
						onOpenChange={setQuickCreateOpen}
					/>

					{/* Notifications Panel */}
					<NotificationsPanel
						open={notificationsOpen}
						onOpenChange={setNotificationsOpen}
						notificationsData={notificationsData}
					/>

					<Dialog open={Boolean(accessRefreshNotice)} onOpenChange={() => {}}>
						<DialogContent
							className="sm:max-w-md"
							onEscapeKeyDown={(event) => event.preventDefault()}
							onInteractOutside={(event) => event.preventDefault()}
						>
							<DialogHeader>
								<DialogTitle>Access Updated</DialogTitle>
								<DialogDescription>
									{accessRefreshNotice?.entity_type === "user_role"
										? "Your role has been updated by an admin."
										: "Your location assignments have been updated by an admin."}{" "}
									Refresh to continue with your updated access.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									onClick={handleRefreshAccess}
									disabled={refreshingAccess}
								>
									{refreshingAccess ? (
										<>
											<Loader2 className="w-4 h-4 mr-2 animate-spin" />
											Refreshing...
										</>
									) : (
										"Refresh"
									)}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<AlertDialog
						open={confirmSignOutOpen}
						onOpenChange={setConfirmSignOutOpen}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Sign out?</AlertDialogTitle>
								<AlertDialogDescription>
									You are about to sign out of your account.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									onClick={async () => {
										setConfirmSignOutOpen(false);
										await handleLogout();
									}}
								>
									Sign out
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<NewDeviceReviewModal
						open={reviewSessionsOpen}
						onClose={() => setReviewSessionsOpen(false)}
					/>
				</InactivityGuard>
			</BannerProvider>
		</SidebarContext.Provider>
	);
}
