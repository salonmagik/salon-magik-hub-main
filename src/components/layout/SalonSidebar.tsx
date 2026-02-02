import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

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

    return (
      <button
        onClick={() => navigate(item.path)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
          !active && "text-sidebar-foreground"
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className={cn(
          "transition-opacity duration-200",
          !isExpanded && !isMobileOpen ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
        )}>
          {item.label}
        </span>
        {item.badge && (isExpanded || isMobileOpen) && (
          <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <SalonMagikLogo size="sm" showText={isExpanded || isMobileOpen} />
        {isMobileOpen && (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-2 hover:bg-sidebar-accent rounded-md lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Plan Badge */}
      {(isExpanded || isMobileOpen) && (
        <div className="p-4 bg-primary/5">
          <span className="inline-flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-md text-sm font-medium border border-border">
            <span className="text-lg">👑</span>
            Free Trial
          </span>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {mainNavItems.map((item) => (
          <NavItemComponent key={item.path} item={item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        {utilityNavItems.map((item) => (
          <NavItemComponent key={item.path} item={item} />
        ))}
        
        {/* User Info */}
        {(isExpanded || isMobileOpen) && (
          <div className="flex items-center gap-3 px-3 py-2.5 mt-2 border-t border-sidebar-border pt-4">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
              U
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">User</p>
              <p className="text-xs text-muted-foreground truncate">user@email.com</p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
            "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className={cn(
            "transition-opacity duration-200",
            !isExpanded && !isMobileOpen ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          )}>
            Sign out
          </span>
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
      <div className="min-h-screen flex bg-surface">
        {/* Mobile Overlay */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-40 lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Sidebar - Mobile */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col border-r border-sidebar-border transform transition-transform duration-300 lg:hidden",
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </aside>

        {/* Sidebar - Desktop */}
        <aside
          className={cn(
            "hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300",
            isExpanded ? "w-64" : "w-16"
          )}
        >
          {sidebarContent}
          
          {/* Collapse Toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute -right-3 top-20 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center shadow-sm hover:bg-sidebar-accent transition-colors"
          >
            <ChevronLeft className={cn(
              "w-4 h-4 transition-transform",
              !isExpanded && "rotate-180"
            )} />
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Top Bar */}
          <header className="h-16 bg-background border-b border-border flex items-center px-4 lg:px-6">
            <button
              onClick={() => setIsMobileOpen(true)}
              className="p-2 hover:bg-muted rounded-md lg:hidden mr-2"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
          </header>

          {/* Page Content */}
          <div className="flex-1 overflow-auto p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
