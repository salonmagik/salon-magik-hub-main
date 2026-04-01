import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClientAuth } from "@/hooks";
import { ClientInactivityGuard } from "./ClientInactivityGuard";
import { Button } from "@ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@ui/sheet";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { cn } from "@shared/utils";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  RefreshCcw,
  Bell,
  User,
  HelpCircle,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
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

interface ClientSidebarProps {
  children: React.ReactNode;
}

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Bookings", icon: Calendar, path: "/bookings" },
  { label: "History", icon: Clock, path: "/history" },
  { label: "Refunds & Credits", icon: RefreshCcw, path: "/refunds" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Profile & Security", icon: User, path: "/profile" },
  { label: "Help & Support", icon: HelpCircle, path: "/help" },
];

export function ClientSidebar({ children }: ClientSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, customers } = useClientAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  const NavContent = ({ onItemClick, forceExpanded = false }: { onItemClick?: () => void; forceExpanded?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <SalonMagikLogo variant="white" size="sm" showText={forceExpanded || !isCollapsed} />
        </Link>
      </div>

      <Separator className="bg-white/10" />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onItemClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.path)
                  ? "bg-white/15 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {(forceExpanded || !isCollapsed) && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
      </ScrollArea>

      <Separator className="bg-white/10" />

      {/* Logout */}
      <div className="p-3">
        <button
          onClick={() => setShowLogoutDialog(true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "text-white/80 hover:bg-white/10 hover:text-white"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {(forceExpanded || !isCollapsed) && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <ClientInactivityGuard>
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-white/10 bg-primary px-4 text-white lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-white/10 bg-primary p-0 text-white">
              <NavContent onItemClick={() => setMobileOpen(false)} forceExpanded />
            </SheetContent>
          </Sheet>
          <div className="flex-1">
            <Link to="/" className="flex items-center gap-2">
              <SalonMagikLogo variant="white" size="sm" />
            </Link>
          </div>
        </header>

        <div className="flex">
          {/* Desktop Sidebar */}
          <aside
            className={cn(
              "sticky top-0 hidden h-screen border-r border-white/10 bg-primary text-white lg:flex lg:flex-col transition-all duration-300",
              isCollapsed ? "w-16" : "w-64"
            )}
          >
            <NavContent />
            
            {/* Collapse Toggle */}
            <div className="absolute -right-3 top-20">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 rounded-full border-white/15 bg-primary text-white hover:bg-white/10 hover:text-white"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronLeft className="h-3 w-3" />
                )}
              </Button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-4 lg:p-6">
            {children}
          </main>
        </div>

        {/* Logout Confirmation Dialog */}
        <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
          <AlertDialogContent className="mx-4">
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to sign out of your account?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout}>
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ClientInactivityGuard>
  );
}
