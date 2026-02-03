import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickCreateDialog } from "@/components/dialogs/QuickCreateDialog";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { InactivityGuard } from "@/components/session/InactivityGuard";
import { useNotifications } from "@/hooks/useNotifications";
import { SubscriptionBanner } from "@/components/layout/SubscriptionBanner";
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
  roles?: string[];
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/salon" },
  { label: "Appointments", icon: Calendar, path: "/salon/appointments" },
  { label: "Calendar", icon: CalendarDays, path: "/salon/calendar" },
  { label: "Customers", icon: Users, path: "/salon/customers" },
  { label: "Products & Services", icon: Scissors, path: "/salon/services" },
  { label: "Payments", icon: CreditCard, path: "/salon/payments" },
  { label: "Reports", icon: BarChart3, path: "/salon/reports" },
  { label: "Messaging", icon: MessageSquare, path: "/salon/messaging" },
  { label: "Journal", icon: BookOpen, path: "/salon/journal" },
  { label: "Staff", icon: UserCog, path: "/salon/staff" },
  { label: "Settings", icon: Settings, path: "/salon/settings" },
];

const utilityNavItems: NavItem[] = [
  { label: "Help", icon: HelpCircle, path: "/salon/help" },
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
          <span>🎁</span>
          {(isExpanded || isMobileOpen) && <span>Free</span>}
        </div>
      </div>

      {/* Subscription Banner (only when expanded) */}
      {(isExpanded || isMobileOpen) && <SubscriptionBanner />}

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-1 relative z-10">
        {mainNavItems.map((item) => (
          <NavItemComponent key={item.path} item={item} />
        ))}
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
               "hidden lg:flex flex-col bg-primary relative z-[60] transition-all duration-300",
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
          <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
            {/* Top Bar */}
            <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6">
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
    </SidebarContext.Provider>
  );
}
