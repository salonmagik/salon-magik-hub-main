import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClientAuth } from "@/hooks";
import { useClientNotifications } from "@/hooks";
import { ClientInactivityGuard } from "./ClientInactivityGuard";
import { Button } from "@ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@ui/sheet";
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
} from "lucide-react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
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
  { label: "Store Credit", icon: RefreshCcw, path: "/balance" },
  { label: "Notifications", icon: Bell, path: "/notifications", showBadge: true },
  { label: "Profile & Security", icon: User, path: "/profile" },
  { label: "Help & Support", icon: HelpCircle, path: "/help" },
];

const NAV_DRAG_THRESHOLD = 8;

function IntentionalClientLink({
  to,
  onActivate,
  className,
  children,
}: {
  to: string;
  onActivate?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const gesture = useRef({ pointerId: -1, startX: 0, startY: 0, moved: false });

  return (
    <Link
      to={to}
      className={className}
      onPointerDown={(event) => {
        gesture.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        if (
          gesture.current.pointerId !== event.pointerId ||
          gesture.current.moved
        ) {
          return;
        }
        if (
          Math.hypot(
            event.clientX - gesture.current.startX,
            event.clientY - gesture.current.startY,
          ) >= NAV_DRAG_THRESHOLD
        ) {
          gesture.current.moved = true;
        }
      }}
      onPointerCancel={() => {
        gesture.current.moved = true;
      }}
      onClick={(event) => {
        const wasDragged = gesture.current.moved;
        gesture.current.pointerId = -1;
        gesture.current.moved = false;
        if (wasDragged) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onActivate?.();
      }}
    >
      {children}
    </Link>
  );
}

export function ClientSidebar({ children }: ClientSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useClientAuth();
  const { unreadCount } = useClientNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const NavContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <SalonMagikLogo variant="white" size="sm" />
        </Link>
      </div>

      <Separator className="bg-white/10" />

      <ScrollArea className="flex-1 touch-pan-y overscroll-contain px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const badgeCount = item.showBadge ? unreadCount : 0;
            return (
              <IntentionalClientLink
                key={item.path}
                to={item.path}
                onActivate={onItemClick}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item.path)
                    ? "bg-white/15 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                <div className="relative shrink-0">
                  <item.icon className="h-5 w-5" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </IntentionalClientLink>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-white/10" />

      <div className="p-3">
        <button
          onClick={() => setShowLogoutDialog(true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "text-white/80 hover:bg-white/10 hover:text-white"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <ClientInactivityGuard>
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-background">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-white/10 bg-primary px-4 text-white lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(18rem,calc(100vw-1.5rem))] max-w-none overscroll-contain border-white/10 bg-primary p-0 text-white"
            >
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <NavContent onItemClick={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex-1">
            <Link to="/" className="flex items-center gap-2">
              <SalonMagikLogo variant="white" size="sm" />
            </Link>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="sticky top-0 z-40 hidden h-20 items-center border-b bg-white/95 px-10 backdrop-blur lg:flex xl:px-16 2xl:px-24">
          <Link to="/" className="shrink-0">
            <SalonMagikLogo size="sm" />
          </Link>
          <nav className="mx-auto flex items-center gap-1">
            {navItems.slice(0, 5).map((item) => {
              const badgeCount = item.showBadge ? unreadCount : 0;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm transition-colors",
                    isActive(item.path)
                      ? "bg-primary/8 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                  {badgeCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/profile">
                <User className="h-5 w-5" />
                <span className="sr-only">Profile</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setShowLogoutDialog(true)}
            >
              <LogOut className="h-5 w-5" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="min-w-0 overflow-x-hidden bg-[#fbfaf8]">
          <MaintenanceBanner />
          <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-5 sm:px-7 lg:py-10">
            <div className="client-content w-full min-w-0 [&>*]:min-w-0">{children}</div>
          </div>
        </main>

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
              <AlertDialogAction onClick={handleLogout}>Sign out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ClientInactivityGuard>
  );
}
