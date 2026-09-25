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
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Bell,
  Plus,
  Check,
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
  MapPin,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { QuickCreateDialog } from "@/components/dialogs/QuickCreateDialog";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { InactivityGuard } from "@/components/session/InactivityGuard";
import { useNotifications } from "@/hooks/useNotifications";
import { GlobalBanner, BlockingBannerOverlay, MaintenanceBannerModal } from "@/components/banners";
import { ProductAnnouncementCard } from "@shared/ProductAnnouncementCard";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useStaffOperationsAddon } from "@/hooks/useStaffOperationsAddon";
import { useActiveTrialOverride } from "@/hooks/useActiveTrialOverride";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { BillingStateBanner } from "@/components/billing/BillingStateBanner";
import { TrialReminderModals } from "@/components/billing/TrialReminderModals";
import { PromoTrialBonusBanner } from "@/components/billing/PromoTrialBonusBanner";
import { PlanChangeBanner } from "@/components/layout/PlanChangeBanner";
import { AnnualLockinBanner } from "@/components/layout/AnnualLockinBanner";
import { useStaffSessions } from "@/hooks/useStaffSessions";
import { NewDeviceReviewModal } from "@/components/session/NewDeviceReviewModal";
import { isModuleAllowedInContext, ROUTE_DEFINITIONS } from "@/lib/contextAccess";
import { CUSTOM_DOMAINS_ENABLED } from "@/lib/customDomainFeature";
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
import { Sheet, SheetContent, SheetTitle } from "@ui/sheet";

// User profile section component
function UserProfileSection({ isExpanded }: { isExpanded: boolean }) {
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
        onClick={() => setProfileOpen(true)}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 mt-2 w-full rounded-lg transition-colors hover:bg-white/10 cursor-pointer",
          !isExpanded && "justify-center"
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
        {isExpanded && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate text-white">
              {displayName}
            </p>
            <p className="text-xs text-white/70 truncate">
              {displayEmail}
            </p>
          </div>
        )}
        {isExpanded && (
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
  "/salon/transactions",
  // Customers and Services both live in "More" now — Home/Bookings/[+]/
  // Transactions/More keeps the branch bar at 5 slots instead of 6, room
  // for the "+" the bar notches in at the middle.
  // Business Hub context's bottom nav (see the mobile nav render block) —
  // harmless to list unconditionally, since these paths don't exist in the
  // branch-context nav tree the filter also runs against.
  "/salon/overview",
  "/salon/overview/staff",
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
		label: "Cashflow",
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
		label: "Marketing",
		icon: MessageSquare,
		path: "/salon/marketing",
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

// A page-level replacement for the "+" that used to float above the mobile
// bottom nav on some pages (Appointments, Customers, Staff, Services,
// Cashflow, Messaging, the Business Hub overview) while every page also
// carried a second, unrelated "+" in the mobile header for the global
// Quick Create dialog. Both are gone now — a page registers what its "+"
// should do via useSidebar().setMobileQuickAction, and the single FAB
// SalonSidebar renders reads it; a page that registers nothing falls back
// to the same Quick Create dialog the header button used to open.
export interface MobileQuickActionOption {
  key: string;
  label: string;
  icon: React.ElementType;
  onSelect: () => void;
  disabled?: boolean;
  badge?: string;
  destructive?: boolean;
  separatorBefore?: boolean;
}

export type MobileQuickAction =
  | { kind: "single"; ariaLabel: string; onSelect: () => void }
  | { kind: "menu"; ariaLabel: string; options: MobileQuickActionOption[] };

interface SidebarContextType {
  isExpanded: boolean;
  toggleExpanded: () => void;
  setMobileQuickAction: (action: MobileQuickAction | null) => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

// A page calls `<SalonSidebar>{children}</SalonSidebar>` itself, so the
// page's own top-level render runs BEFORE that provider exists — useSidebar()
// can't be called there directly. This registers a page's quick action from
// inside the tree instead: render it as a child anywhere inside
// <SalonSidebar>, and it reads/writes the real context.
export function MobileQuickActionEffect({ action }: { action: MobileQuickAction | null }) {
  const { setMobileQuickAction } = useSidebar();
  useEffect(() => {
    setMobileQuickAction(action);
    return () => setMobileQuickAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, setMobileQuickAction]);
  return null;
}

interface SalonSidebarProps {
  children: ReactNode;
}

export function SalonSidebar({ children }: SalonSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [mobileQuickAction, setMobileQuickAction] = useState<MobileQuickAction | null>(null);
  const [quickActionMenuOpen, setQuickActionMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [accessRefreshNoticeId, setAccessRefreshNoticeId] = useState<string | null>(null);
  const [refreshingAccess, setRefreshingAccess] = useState(false);
  const [reviewSessionsOpen, setReviewSessionsOpen] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const mobileContentRef = useRef<HTMLDivElement | null>(null);
  const lastMobileScrollTopRef = useRef(0);
  // "More" on the bottom nav — a dedicated bottom sheet, distinct from the
  // full-height side drawer the top-header hamburger still opens. Only ever
  // holds what isn't already on the bar: the context switcher (folded to
  // the current context by default) and the same BOTTOM_NAV_PATHS-filtered
  // overflow items the side drawer already computes.
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [expandedOverflowPath, setExpandedOverflowPath] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Keep the mobile dock out of the way while reading, then reveal it as soon
  // as the user scrolls back up. The content pane is the scroll owner on the
  // salon shell, so this remains reliable even when the browser chrome moves.
  useEffect(() => {
    setMobileNavVisible(true);
    lastMobileScrollTopRef.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    const scrollContainer = mobileContentRef.current;
    if (!scrollContainer) return;

    const onScroll = () => {
      const nextTop = Math.max(0, scrollContainer.scrollTop);
      const delta = nextTop - lastMobileScrollTopRef.current;
      if (Math.abs(delta) < 4) return;

      if (nextTop < 24 || delta < 0) {
        setMobileNavVisible(true);
      } else if (delta > 0) {
        setMobileNavVisible(false);
      }
      lastMobileScrollTopRef.current = nextTop;
    };

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", onScroll);
  }, []);

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
  const { data: activeTrialOverride } = useActiveTrialOverride(currentTenant?.id);

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
              label: "Advanced Settings",
              path: "/salon/business-settings",
              children: [
                { label: "Business Profile", icon: Building2, path: "/salon/business-settings?tab=profile" },
                { label: "Manage Branches", icon: CalendarX2, path: "/salon/business-settings?tab=branches" },
                { label: "Booking Settings", icon: User, path: "/salon/business-settings?tab=booking" },
                { label: "Notifications", icon: Bell, path: "/salon/business-settings?tab=notifications" },
                ...(CUSTOM_DOMAINS_ENABLED ? [{ label: "Custom Domain", icon: Globe, path: "/salon/business-settings?tab=custom-domain" }] : []),
                { label: "Active Sessions", icon: Shield, path: "/salon/business-settings?tab=sessions" },
                { label: "Website Themes", icon: Palette, path: "/salon/themes-settings" },
                { label: "Audit Log", icon: FileText, path: "/salon/audit-log" },
              ],
            };
          }
          return {
            ...item,
            label: "Advanced Settings",
            path: "/salon/business-settings",
            children: [
              { label: "Salon Profile", icon: Building2, path: "/salon/business-settings?tab=profile" },
              { label: "Manage Branches", icon: CalendarX2, path: "/salon/business-settings?tab=branches" },
              { label: "Booking Settings", icon: User, path: "/salon/business-settings?tab=booking" },
              { label: "Notifications", icon: Bell, path: "/salon/business-settings?tab=notifications" },
              ...(CUSTOM_DOMAINS_ENABLED ? [{ label: "Custom Domain", icon: Globe, path: "/salon/business-settings?tab=custom-domain" }] : []),
              { label: "Active Sessions", icon: Shield, path: "/salon/business-settings?tab=sessions" },
              { label: "Website Themes", icon: Palette, path: "/salon/themes-settings" },
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

  // Whether the current route is one of the items living behind "More"
  // rather than on the bar itself — so the bottom nav's More tab stays
  // highlighted while browsing its pages, the same way any other tab does,
  // not just while its sheet happens to be open. Children are query-string
  // routes (?tab=...), so this must use isChildActive, not isActive.
  const isOnOverflowPage = filteredMainNavItems.some((item) => {
    // A group's own path being on the bar (e.g. "Cashflow & Payouts" keyed by
    // /salon/transactions, same as the "Cashflow" tab) doesn't mean every one
    // of its children is too — Payouts lives under that same group but isn't
    // on the bar, so it still needs to light up "More". Check children
    // regardless of whether the parent itself is skipped.
    const parentOnBar = BOTTOM_NAV_PATHS.has(item.path);
    if (!parentOnBar && item.path && isActive(item.path)) return true;
    return (item.children || []).some((child) => isChildActive(child.path));
  });

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
				{isExpanded && (
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
        {!isExpanded ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}

        {isOpen && isExpanded && item.children && (
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
				{isExpanded && (
					<span className="flex-1 text-left">{item.label}</span>
				)}
				{item.badge && isExpanded && (
					<Badge variant="secondary" className="bg-white/20 text-white text-xs">
						{item.badge}
					</Badge>
				)}
			</IntentionalSidebarLink>
		);

    if (!isExpanded) {
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
				{isExpanded ? (
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
			</div>

			{/* Plan Badge */}
			<div className="px-4 mb-2">
				<div
					className={cn(
						"bg-white/10 rounded-lg py-1.5 px-3 text-xs font-medium flex items-center gap-2 text-white",
						!isExpanded && "justify-center",
					)}
				>
					<span>{planDisplay.emoji}</span>
					{isExpanded && <span>{planDisplay.label}</span>}
				</div>
			</div>

			{/* Context Switcher */}
			{isExpanded &&
				!isAssignmentPending &&
				availableContexts.length > 1 && (() => {
					const hubContext = availableContexts.find((c) => c.type === "owner_hub");
					const branchContexts = availableContexts.filter((c) => c.type === "location");
					const currentContext = availableContexts.find((c) =>
						c.type === "owner_hub" ? contextValue === "owner_hub" : c.locationId === contextValue,
					);
					return (
						<div className="px-4 mb-2">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										id="context-switcher"
										data-tour-id="tour-context-switcher"
										type="button"
										className="flex w-full items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left outline-none transition-colors hover:bg-white/[0.14] focus:border-white/30"
									>
										<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4C84E] text-[#2E1F4E]">
											{currentContext?.type === "owner_hub" ? (
												<Building2 className="h-3.5 w-3.5" strokeWidth={2.5} />
											) : (
												<MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
											)}
										</span>
										<span className="min-w-0 flex-1">
											<span className="block text-[10px] uppercase tracking-wide text-white/60">Viewing</span>
											<span className="block truncate text-sm font-semibold text-white">
												{currentContext?.isPaused ? `⏸ ${currentContext.label}` : currentContext?.label || "Select"}
											</span>
										</span>
										<ChevronDown className="h-4 w-4 shrink-0 text-white/60" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-64">
									{hubContext && (
										<>
											<DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
												Business
											</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => void handleContextChange("owner_hub")}
								aria-current={contextValue === "owner_hub" ? "page" : undefined}
								className={cn(
									"gap-2",
									contextValue === "owner_hub" && "bg-[#F4C84E]/20 font-semibold text-[#2E1F4E] focus:bg-[#F4C84E]/25",
								)}
							>
								<span className={cn(
									"flex h-5 w-5 items-center justify-center rounded-md",
									contextValue === "owner_hub" ? "bg-[#F4C84E] text-[#2E1F4E]" : "bg-muted",
								)}>
									<Building2 className="h-3 w-3" />
								</span>
								<span className="flex-1 truncate">{hubContext.label}</span>
								{contextValue === "owner_hub" && <Check className="h-4 w-4 text-[#8A6512]" />}
							</DropdownMenuItem>
										</>
									)}
									{branchContexts.length > 0 && (
										<>
											{hubContext && <DropdownMenuSeparator />}
											<DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
												Branches
											</DropdownMenuLabel>
											{branchContexts.map((context) => (
								<DropdownMenuItem
									key={`location-${context.locationId}`}
									onClick={() => void handleContextChange(context.locationId || "")}
									aria-current={contextValue === context.locationId ? "page" : undefined}
									className={cn(
										"gap-2",
										contextValue === context.locationId && "bg-[#F4C84E]/20 font-semibold text-[#2E1F4E] focus:bg-[#F4C84E]/25",
									)}
								>
									<span className={cn(
										"flex h-5 w-5 items-center justify-center rounded-md",
										contextValue === context.locationId ? "bg-[#F4C84E] text-[#2E1F4E]" : "bg-muted",
									)}>
										<MapPin className="h-3 w-3" />
									</span>
									<span className="flex-1 truncate">{context.label}</span>
													{context.isPaused && (
										<span className="text-xs text-muted-foreground">Paused</span>
									)}
									{contextValue === context.locationId && <Check className="h-4 w-4 text-[#8A6512]" />}
								</DropdownMenuItem>
											))}
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				})()}

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
					filteredMainNavItems.map((item) =>
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
				<UserProfileSection isExpanded={isExpanded} />

				<button
					onClick={() => setConfirmSignOutOpen(true)}
					className={cn(
						"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
						"text-white/80 hover:text-white hover:bg-white/10",
					)}
				>
					<LogOut className="w-5 h-5 flex-shrink-0" />
					{isExpanded && <span>Sign out</span>}
				</button>
			</div>
		</>
	);

  return (
		<SidebarContext.Provider
			value={{
				isExpanded,
				toggleExpanded: () => setIsExpanded(!isExpanded),
				setMobileQuickAction,
			}}
		>
			<InactivityGuard>
					<div className="min-h-screen flex bg-surface">
						{/* Sidebar — desktop and up only. Mobile uses the bottom nav and its
							"More" sheet exclusively; there is no side drawer to duplicate it. */}
						<aside
							className={cn(
								"hidden lg:flex flex-col bg-primary fixed top-0 left-0 z-[60] transition-all duration-300 h-screen overflow-visible",
								isExpanded ? "w-64" : "w-[72px]",
							)}
						>
							{sidebarContent}

							{/* Collapse Toggle */}
							<button
								onClick={() => setIsExpanded(!isExpanded)}
								className="absolute -right-3 top-20 z-[70] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-colors hover:bg-muted"
								aria-label={isExpanded ? "Collapse navigation" : "Expand navigation"}
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
								// h-dvh + overflow-hidden makes this the scroll boundary on mobile, so
								// the pb-adjacent content pane below (mobileContentRef) becomes its own
								// scroll container — the auto-hide bottom nav's scroll listener is
								// attached there and never fires if the whole page scrolls instead.
								// Reverts to natural page-height flow on desktop, where there's no
								// bottom nav to hide.
								"flex-1 min-w-0 flex flex-col h-dvh overflow-hidden transition-all duration-300 lg:h-auto lg:min-h-screen",
								isExpanded ? "lg:ml-64" : "lg:ml-[72px]",
							)}
						>
							{/* Global notices sit above the app header so they remain visible on desktop and mobile. */}
							<GlobalBanner />

							{/* Top Bar */}
							<header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-50">
								{/* Tenant display / switcher */}
								<div className="flex-1 flex items-center gap-2.5 min-w-0 ml-1 lg:ml-0">
									<TenantSwitcher />
									{(() => {
										if (!currentTenant) return null;
										// An active gifted-trial override (Backoffice → Tenant
										// Gifted Trials) takes precedence over the tenant's own
										// trial dates — see useActiveTrialOverride's doc comment.
										const effectiveTrialEndsAt = activeTrialOverride?.ends_at ?? currentTenant.trial_ends_at;
										if (
											(activeTrialOverride || currentTenant.subscription_status === "trialing") &&
											effectiveTrialEndsAt
										) {
											const daysLeft = Math.ceil(
												(new Date(effectiveTrialEndsAt).getTime() -
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
									{/* Quick Create Button — desktop only below lg the bottom nav's
										own "+" covers this, reading whatever the current page
										registered via useSidebar().setMobileQuickAction, with this
										same dialog as its fallback when a page registers nothing. */}
									<Button
										variant="outline"
										size="sm"
										className="hidden lg:flex items-center gap-2"
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
							<BillingStateBanner />

							{/* Page Content */}
							<div ref={mobileContentRef} className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-6 lg:pt-6 lg:pb-6">
								<div className="w-full min-w-0 max-w-full [&>*]:min-w-0">
									<PromoTrialBonusBanner />
									{children}
								</div>
							</div>

							{/* Mobile Bottom Navigation */}
							<nav
								aria-label="Primary mobile navigation"
								className={cn(
									"fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)] transition-all duration-300 motion-reduce:transition-none lg:hidden",
									mobileNavVisible
										? "translate-y-0 opacity-100"
										: "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0",
								)}
							>
								<div
									className="mx-auto mb-3 flex w-[min(94vw,27rem)] items-center justify-around gap-1 rounded-[30px] border border-white/10 bg-[#211a32]/95 px-2 py-2 shadow-[0_18px_42px_rgba(28,18,49,0.42)] backdrop-blur-xl"
								>
									{(activeContextType === "owner_hub"
										? [
											{
												label: "Overview",
												icon: Building2,
												path: "/salon/overview",
											},
											{
												label: "Cashflow",
												icon: CreditCard,
												path: "/salon/transactions",
											},
											{
												label: "Quick",
												icon: Plus,
												path: "__quick__",
											},
											{
												label: "Team",
												icon: UserCog,
												path: "/salon/overview/staff",
											},
											{
												label: "More",
												icon: MoreHorizontal,
												path: "__more__",
											},
										]
										: [
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
												label: "Quick",
												icon: Plus,
												path: "__quick__",
											},
											{
												label: "Cashflow",
												icon: CreditCard,
												path: "/salon/transactions",
											},
											{
												label: "More",
												icon: MoreHorizontal,
												path: "__more__",
											},
										]
									).map(({ label, icon: Icon, path }) => {
										if (path === "__quick__") {
											return (
												<div key={path} className="flex min-w-0 flex-1 justify-center">
													<button
														type="button"
														aria-label={mobileQuickAction?.ariaLabel ?? "Quick create"}
														data-tour-id="tour-quick-create-mobile"
														onClick={() => {
															if (!mobileQuickAction) {
																setQuickCreateOpen(true);
															} else if (mobileQuickAction.kind === "single") {
																mobileQuickAction.onSelect();
															} else {
																setQuickActionMenuOpen(true);
															}
														}}
														className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-[#211a32] bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_8px_18px_-6px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform active:scale-95"
													>
														<Plus className="h-6 w-6" />
													</button>
												</div>
											);
										}
										const active = path === "__more__" ? moreSheetOpen || isOnOverflowPage : isActive(path);
										return (
											<button
												key={path}
												type="button"
												data-tour-id={path === "__more__" ? "tour-mobile-more" : undefined}
												onClick={() => (path === "__more__" ? setMoreSheetOpen(true) : navigate(path))}
														className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[22px] border border-transparent px-1.5 py-1.5 transition-all duration-200 hover:bg-white/10 motion-reduce:transition-none"
												>
														<span
															className={cn(
																"flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
																active ? "text-[#F4C84E]" : "text-white/60 group-hover:text-white/90",
															)}
														>
															<Icon strokeWidth={active ? 2.2 : 1.8} className="h-[18px] w-[18px]" />
														</span>
														<span
															className={cn(
																"max-w-full truncate text-[10px] font-semibold leading-none transition-colors motion-reduce:transition-none",
																active ? "text-white" : "text-white/60 group-hover:text-white/90",
															)}
												>
													{label}
												</span>
											</button>
										);
									})}
								</div>
							</nav>

							{/* Quick-action bottom sheet — the drawer a page's registered "menu"
								action opens from the "+" notch, styled like the "More" sheet next
								to it. A single-action page skips this and runs its action directly
								on tap; a page with no action at all falls back to the global
								QuickCreateDialog, which is itself a bottom sheet below lg (see that
								component). Options defer their onSelect by a tick after this sheet
								closes — opening another dialog synchronously from inside a Radix
								primitive's own close callback is what caused the "opens multiple
								modals" bug this replaces. */}
							<Sheet open={quickActionMenuOpen} onOpenChange={setQuickActionMenuOpen}>
								<SheetContent
									side="bottom"
									className="flex max-h-[60vh] flex-col gap-0 rounded-t-3xl border-t-0 p-0 pb-[env(safe-area-inset-bottom)]"
								>
									<SheetTitle className="sr-only">{mobileQuickAction?.kind === "menu" ? mobileQuickAction.ariaLabel : "Quick actions"}</SheetTitle>
									<div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-border" />
									<div className="flex-1 overflow-y-auto px-4 pb-3 pt-3">
										<p className="mb-1 px-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
											{mobileQuickAction?.kind === "menu" ? mobileQuickAction.ariaLabel : "Quick actions"}
										</p>
										{mobileQuickAction?.kind === "menu"
											? mobileQuickAction.options.map((option) => (
													<div key={option.key}>
														{option.separatorBefore ? <div className="my-2 border-t border-border" /> : null}
														<button
															type="button"
															disabled={option.disabled}
															onClick={() => {
																setQuickActionMenuOpen(false);
																window.setTimeout(() => option.onSelect(), 120);
															}}
															className={cn(
																"flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors",
																option.disabled
																	? "cursor-not-allowed text-muted-foreground/50"
																	: option.destructive
																		? "text-destructive hover:bg-destructive/10"
																		: "text-foreground hover:bg-surface",
															)}
														>
															<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">
																<option.icon className="h-4 w-4" />
															</span>
															<span className="flex-1 truncate">{option.label}</span>
															{option.badge ? (
																<span className="shrink-0 text-xs text-muted-foreground">{option.badge}</span>
															) : null}
														</button>
													</div>
												))
											: null}
									</div>
								</SheetContent>
							</Sheet>

							{/* "More" bottom sheet — mobile only. Same context switcher and the
								same BOTTOM_NAV_PATHS-filtered overflow items as the side drawer,
								just in a sheet that matches how the rest of the bottom bar behaves. */}
							<Sheet
								open={moreSheetOpen}
								onOpenChange={(open) => {
									setMoreSheetOpen(open);
									if (!open) {
										setContextPickerOpen(false);
										setExpandedOverflowPath(null);
									}
								}}
							>
								<SheetContent
									side="bottom"
									className="lg:hidden flex max-h-[60vh] flex-col gap-0 rounded-t-3xl border-t-0 p-0 pb-[env(safe-area-inset-bottom)]"
								>
									<SheetTitle className="sr-only">More</SheetTitle>
									<div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-border" />

									<div className="flex-1 overflow-y-auto px-4 pb-3 pt-3">
										{availableContexts.length > 1 && !isAssignmentPending && (() => {
											const hubContext = availableContexts.find((c) => c.type === "owner_hub");
											const branchContexts = availableContexts.filter((c) => c.type === "location");
											const currentContext = availableContexts.find((c) =>
												c.type === "owner_hub" ? contextValue === "owner_hub" : c.locationId === contextValue,
											);
											return (
												// Shaded as one card — the same surface tone as the "Viewing" row
												// itself — so this whole switcher reads as its own section,
												// distinct from the plain overflow list below it.
												<div className="mb-3 rounded-2xl bg-surface p-2">
													<p className="mb-1 px-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
														Switch to
													</p>
													<button
														type="button"
														onClick={() => setContextPickerOpen((current) => !current)}
														className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left"
													>
														<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
															{currentContext?.type === "owner_hub" ? (
																<Building2 className="h-3.5 w-3.5" strokeWidth={2.5} />
															) : (
																<MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
															)}
														</span>
														<span className="min-w-0 flex-1">
															<span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Viewing</span>
															<span className="block truncate text-sm font-semibold text-foreground">
																{currentContext?.isPaused ? `⏸ ${currentContext.label}` : currentContext?.label || "Select"}
															</span>
														</span>
														<ChevronDown
															className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", contextPickerOpen && "rotate-180")}
														/>
													</button>

													{contextPickerOpen && (
														<div className="mt-0.5 space-y-0.5 border-t border-border/60 pt-1.5">
															{hubContext && (
																<button
																	type="button"
																	onClick={() => {
																		if (hubContext !== currentContext) void handleContextChange("owner_hub");
																		setMoreSheetOpen(false);
																	}}
																	className={cn(
																		"flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm",
																		hubContext === currentContext
																			? "bg-primary/10 font-semibold text-primary"
																			: "text-foreground hover:bg-white/60",
																	)}
																>
																	<Building2 className={cn("h-3.5 w-3.5", hubContext === currentContext ? "text-primary" : "text-muted-foreground")} />
																	<span className="flex-1 truncate">{hubContext.label}</span>
																	{hubContext === currentContext && <Check className="h-3.5 w-3.5 text-primary" />}
																</button>
															)}
															{branchContexts.map((context) => (
																<button
																	key={`sheet-location-${context.locationId}`}
																	type="button"
																	onClick={() => {
																		if (context !== currentContext) void handleContextChange(context.locationId || "");
																		setMoreSheetOpen(false);
																	}}
																	className={cn(
																		"flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm",
																		context === currentContext
																			? "bg-primary/10 font-semibold text-primary"
																			: "text-foreground hover:bg-white/60",
																	)}
																>
																	<MapPin className={cn("h-3.5 w-3.5", context === currentContext ? "text-primary" : "text-muted-foreground")} />
																	<span className="flex-1 truncate">{context.label}</span>
																	{context.isPaused && <span className="text-xs text-muted-foreground">Paused</span>}
																	{context === currentContext && <Check className="h-3.5 w-3.5 text-primary" />}
																</button>
															))}
														</div>
													)}
												</div>
											);
										})()}

										<nav className="space-y-0.5">
											{activeContextType === "owner_hub" && (
												<button
													type="button"
													onClick={() => {
														navigate("/salon/payouts");
														setMoreSheetOpen(false);
													}}
													className={cn(
														"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
														isActive("/salon/payouts")
															? "bg-primary/10 font-semibold text-primary"
															: "font-medium text-foreground hover:bg-surface",
													)}
												>
													<Wallet className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
													<span className="flex-1 truncate">Payouts</span>
													{isActive("/salon/payouts") && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
												</button>
											)}
											{filteredMainNavItems
												.filter((item) => !BOTTOM_NAV_PATHS.has(item.path))
												.map((item) => {
													const hasChildren = Boolean(item.children?.length);
													const anyChildActive = (item.children || []).some((child) => isChildActive(child.path));
													const selfActive = isActive(item.path) && !hasChildren;
													const isOpen = expandedOverflowPath === item.path;
													// While collapsed, the parent row carries the highlight for
													// whichever of its pages is current. Once expanded, that same
													// child row shows its own highlight below — showing both at
													// once would read as two different "active" answers.
													const parentHighlighted = selfActive || (hasChildren && anyChildActive && !isOpen);
													return (
														<div key={item.path}>
															<button
																type="button"
																onClick={() => {
																	if (hasChildren) {
																		setExpandedOverflowPath(isOpen ? null : item.path);
																	} else {
																		navigate(item.path);
																		setMoreSheetOpen(false);
																	}
																}}
																className={cn(
																	"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
																	parentHighlighted
																		? "bg-primary/10 font-semibold text-primary"
																		: "font-medium text-foreground hover:bg-surface",
																)}
															>
																<item.icon
																	className={cn(
																		"h-[18px] w-[18px] shrink-0",
																		parentHighlighted ? "text-primary" : "text-muted-foreground",
																	)}
																/>
																<span className="flex-1 truncate">{item.label}</span>
																{hasChildren ? (
																	<ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
																) : (
																	selfActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
																)}
															</button>
															{hasChildren && isOpen && (
																<div className="ml-[1.375rem] space-y-0.5 border-l border-border pl-3">
																	{item.children!.map((child) => (
																		<button
																			key={child.path}
																			type="button"
																			onClick={() => {
																				navigate(child.path);
																				setMoreSheetOpen(false);
																			}}
																			className={cn(
																				"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
																				isChildActive(child.path)
																					? "bg-primary/10 font-semibold text-primary"
																					: "font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
																			)}
																		>
																			<span className="flex-1 truncate">{child.label}</span>
																			{isChildActive(child.path) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
																		</button>
																	))}
																</div>
															)}
														</div>
													);
												})}
										</nav>
									</div>

									{/* Fixed footer — stays put while the overflow list above scrolls,
										so "Sign out" is always reachable without hunting for it. */}
									<div className="shrink-0 border-t border-border px-4 py-2">
										<button
											type="button"
											onClick={() => {
												setMoreSheetOpen(false);
												setConfirmSignOutOpen(true);
											}}
											className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
										>
											<LogOut className="h-[18px] w-[18px] shrink-0" />
											Sign out
										</button>
									</div>
								</SheetContent>
							</Sheet>
						</main>
					</div>

					{/* Blocking overlay — renders above everything when a blocking banner is active */}
					<BlockingBannerOverlay />

					<ProductAnnouncementCard
						client={supabase as any}
						platform="salon_admin"
						onNavigate={(path) => navigate(path)}
					/>

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
		</SidebarContext.Provider>
	);
}
