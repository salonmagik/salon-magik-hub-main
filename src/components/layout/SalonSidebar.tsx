import { useState, useEffect, createContext, useContext, ReactNode, useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  CalendarDays,
  Scissors,
  Users,
  CreditCard,
  BarChart3,
  MessageSquare,
  BookOpen,
  UserCog,
  Settings,
  LogOut,
  HelpCircle,
  Menu,
  X,
  ChevronLeft,
  Bell,
  Plus,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickCreateDialog } from "@/components/dialogs/QuickCreateDialog";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { InactivityGuard } from "@/components/session/InactivityGuard";
import { useNotifications } from "@/hooks/useNotifications";
import { BannerProvider, GlobalBanner } from "@/components/banners";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { useStaffSessions } from "@/hooks/useStaffSessions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string | number;
  module?: string; // Permission module key
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/salon", module: "dashboard" },
  { label: "Salons Overview", icon: Building2, path: "/salon/overview", module: "salons_overview" },
  { label: "Appointments", icon: Calendar, path: "/salon/appointments", module: "appointments" },
  { label: "Calendar", icon: CalendarDays, path: "/salon/calendar", module: "calendar" },
  { label: "Customers", icon: Users, path: "/salon/customers", module: "customers" },
  { label: "Services and Products", icon: Scissors, path: "/salon/services", module: "services" },
  { label: "Payments", icon: CreditCard, path: "/salon/payments", module: "payments" },
  { label: "Reports", icon: BarChart3, path: "/salon/reports", module: "reports" },
  { label: "Messaging", icon: MessageSquare, path: "/salon/messaging", module: "messaging" },
  { label: "Journal", icon: BookOpen, path: "/salon/journal", module: "journal" },
  { label: "Staff", icon: UserCog, path: "/salon/staff", module: "staff" },
  { label: "Audit Log", icon: FileText, path: "/salon/audit-log", module: "audit_log" },
  { label: "Settings", icon: Settings, path: "/salon/settings", module: "settings" },
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { unreadCount } = useNotifications();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { currentTenant } = useAuth();
  
  // Start staff session on mount
  const { startSession } = useStaffSessions();
  useEffect(() => {
    startSession();
  }, [startSession]);

  // Filter nav items based on permissions - return empty during loading to prevent flash
  const filteredMainNavItems = useMemo(() => {
    if (permissionsLoading) return []; // Return EMPTY to prevent flash
    return mainNavItems.filter((item) => {
      if (!item.module) return true; // No module = always visible
      return hasPermission(item.module);
    });
  }, [hasPermission, permissionsLoading]);

  // Get plan display info
  const getPlanDisplay = () => {
    if (!currentTenant) return { emoji: "🎁", label: "Free" };
    
    const isTrialing = currentTenant.subscription_status === "trialing";
    const isPastDue = currentTenant.subscription_status === "past_due";
    const isActive = currentTenant.subscription_status === "active";
    
    if (isPastDue) {
      return { emoji: "⚠️", label: "Past Due" };
    }
    if (isTrialing && currentTenant.trial_ends_at) {
      const daysLeft = Math.ceil(
        (new Date(currentTenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft > 0) {
        return { emoji: "⏰", label: `Trial (${daysLeft}d)` };
      }
      return { emoji: "⚠️", label: "Trial Ended" };
    }
    if (isActive) {
      return { emoji: "✨", label: "Pro" };
    }
    return { emoji: "🎁", label: "Free" };
  };

  const planDisplay = getPlanDisplay();

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

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
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setQuickCreateOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const isActive = (path: string) => {
    if (path === "/salon" && location.pathname === "/salon") return true;
    if (path !== "/salon" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const NavItemComponent = ({ item }: { item: NavItem }) => {
    const active = isActive(item.path);
    const Icon = item.icon;

    const content = (
      <Link
        to={item.path}
        // Some components used on /salon/settings (e.g. Radix “dismissable layer” patterns)
        // can call preventDefault() on click events, which blocks react-router navigation.
        // Navigating on pointer down makes the sidebar links resilient without impacting
        // modifier-click (new tab) behavior.
        onPointerDown={(e) => {
          // Only handle plain left-click / tap
          if (e.button !== 0) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

          e.preventDefault();
          e.stopPropagation();
          navigate(item.path);
        }}
        onClick={(e) => {
          // Keep parent click handlers from interfering with link navigation.
          e.stopPropagation();
        }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 no-underline",
          active
            ? "bg-white/15 text-white"
            : "text-white/80 hover:bg-white/10 hover:text-white"
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
      </Link>
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
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center mx-auto">
            <Scissors className="w-5 h-5 text-white" />
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
            !isExpanded && !isMobileOpen && "justify-center"
          )}
        >
          <span>{planDisplay.emoji}</span>
          {(isExpanded || isMobileOpen) && <span>{planDisplay.label}</span>}
        </div>
      </div>

      {/* Global Banner (only when expanded) */}
      {(isExpanded || isMobileOpen) && <GlobalBanner />}

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-1 relative z-10">
        {permissionsLoading ? (
          // Show skeleton during loading to prevent flash
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg bg-white/10" />
            ))}
          </div>
        ) : (
          filteredMainNavItems.map((item) => (
            <NavItemComponent key={item.path} item={item} />
          ))
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-3 space-y-1">
        {utilityNavItems.map((item) => (
          <NavItemComponent key={item.path} item={item} />
        ))}

        {/* User Info */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 mt-2",
            !isExpanded && !isMobileOpen && "justify-center"
          )}
        >
          <div className="w-8 h-8 bg-white/20 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
            A
          </div>
          {(isExpanded || isMobileOpen) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">
                Agatha Ambrose
              </p>
              <p className="text-xs text-white/70 truncate">
                agathambrose@gmail.com
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            "text-white/80 hover:text-white hover:bg-white/10"
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
               "fixed inset-y-0 left-0 z-[60] w-64 bg-primary flex flex-col transform transition-transform duration-300 lg:hidden",
              isMobileOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            {sidebarContent}
          </aside>

          {/* Sidebar - Desktop */}
          <aside
            className={cn(
               "hidden lg:flex flex-col bg-primary fixed top-0 left-0 z-[60] transition-all duration-300 h-screen overflow-hidden",
              isExpanded ? "w-64" : "w-[72px]"
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
                  !isExpanded && "rotate-180"
                )}
              />
            </button>
          </aside>

          {/* Main Content */}
          <main className={cn(
            "flex-1 flex flex-col min-h-screen overflow-hidden transition-all duration-300",
            isExpanded ? "lg:ml-64" : "lg:ml-[72px]"
          )}>
            {/* Top Bar */}
            <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-50">
              <button
                onClick={() => setIsMobileOpen(true)}
                className="p-2 hover:bg-muted rounded-lg lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex-1" />

              <div className="flex items-center gap-2">
                {/* Quick Create Button */}
                <Button
                  variant="outline"
                  size="icon"
                  className="sm:hidden"
                  onClick={() => setQuickCreateOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex items-center gap-2"
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

            {/* Page Content */}
            <div className="flex-1 overflow-auto p-4 lg:p-6">{children}</div>
          </main>
        </div>

        {/* Quick Create Dialog */}
        <QuickCreateDialog
          open={quickCreateOpen}
          onOpenChange={setQuickCreateOpen}
        />

        {/* Notifications Panel */}
        <NotificationsPanel
          open={notificationsOpen}
          onOpenChange={setNotificationsOpen}
        />
      </InactivityGuard>
    </BannerProvider>
    </SidebarContext.Provider>
  );
}
