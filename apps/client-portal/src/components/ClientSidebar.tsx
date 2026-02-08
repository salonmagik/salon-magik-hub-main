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
  { label: "Dashboard", icon: LayoutDashboard, path: "/client" },
  { label: "Bookings", icon: Calendar, path: "/client/bookings" },
  { label: "History", icon: Clock, path: "/client/history" },
  { label: "Refunds & Credits", icon: RefreshCcw, path: "/client/refunds" },
  { label: "Notifications", icon: Bell, path: "/client/notifications" },
  { label: "Profile & Security", icon: User, path: "/client/profile" },
  { label: "Help & Support", icon: HelpCircle, path: "/client/help" },
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
    navigate("/client/login", { replace: true });
  };

  const isActive = (path: string) => {
    if (path === "/client") {
      return location.pathname === "/client";
    }
    return location.pathname.startsWith(path);
  };

  const NavContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <Link to="/client" className="flex items-center gap-2">
          <SalonMagikLogo className="h-8 w-8" />
          {!isCollapsed && (
            <span className="font-semibold text-foreground">My Account</span>
          )}
        </Link>
      </div>

      <Separator />

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
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
      </ScrollArea>

      <Separator />

      {/* Logout */}
      <div className="p-3">
        <button
          onClick={() => setShowLogoutDialog(true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <ClientInactivityGuard>
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <NavContent onItemClick={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex-1">
            <Link to="/client" className="flex items-center gap-2">
              <SalonMagikLogo className="h-6 w-6" />
              <span className="font-semibold">My Account</span>
            </Link>
          </div>
        </header>

        <div className="flex">
          {/* Desktop Sidebar */}
          <aside
            className={cn(
              "sticky top-0 hidden h-screen border-r bg-card lg:flex lg:flex-col transition-all duration-300",
              isCollapsed ? "w-16" : "w-64"
            )}
          >
            <NavContent />
            
            {/* Collapse Toggle */}
            <div className="absolute -right-3 top-20">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 rounded-full bg-background"
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
