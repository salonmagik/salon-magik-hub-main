import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClientAuth } from "@/hooks";
import { useClientNotifications } from "@/hooks";
import { useConfirmDetailsPrompt } from "@/hooks";
import { ClientInactivityGuard } from "./ClientInactivityGuard";
import { Button } from "@ui/button";
import { Sheet, SheetContent, SheetTitle } from "@ui/sheet";
import { cn } from "@shared/utils";
import {
  LayoutDashboard,
  Calendar,
  ShoppingBag,
  Package,
  RefreshCcw,
  Clock,
  TicketCheck,
  Bell,
  User,
  HelpCircle,
  LogOut,
  MoreHorizontal,
} from "lucide-react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { ProductAnnouncementCard } from "@shared/ProductAnnouncementCard";
import { ClientNotificationsDrawer } from "@/components/ClientNotificationsDrawer";
import { supabase } from "@/lib/supabase";
import { ConfirmDetailsModal, needsDetailsConfirmation } from "@/components/ConfirmDetailsModal";
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

// Desktop's real left sidebar. Mobile's bottom bar below is a separate,
// deliberately shorter set: the busiest four destinations get a permanent
// tab, everything else lives behind "More" so nothing is ever listed in
// both places at once.
const DESKTOP_NAV_ITEMS = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Bookings", icon: Calendar, path: "/bookings" },
  { label: "Orders", icon: ShoppingBag, path: "/orders" },
  { label: "Packages", icon: Package, path: "/packages" },
  { label: "Vouchers", icon: TicketCheck, path: "/vouchers" },
  { label: "Store credit", icon: RefreshCcw, path: "/store-credit" },
  { label: "Transactions", icon: Clock, path: "/history" },
] as const;

const BOTTOM_TABS = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Bookings", icon: Calendar, path: "/bookings" },
  { label: "Packages", icon: Package, path: "/packages" },
  { label: "Store credit", icon: RefreshCcw, path: "/store-credit" },
] as const;

const MORE_ITEMS = [
  { label: "Orders", icon: ShoppingBag, path: "/orders" },
  { label: "Vouchers", icon: TicketCheck, path: "/vouchers" },
  { label: "Transactions", icon: Clock, path: "/history" },
  { label: "Help & Support", icon: HelpCircle, path: "/help" },
] as const;

// Kept in sync with MORE_ITEMS' paths (plus /refunds, which redirects into
// /store-credit): whatever "More" can navigate to, so the tab reads as
// active for the whole time you're browsing one of its destinations, not
// just while the sheet itself is open.
const MORE_PATHS = ["/orders", "/vouchers", "/history", "/help", "/refunds"];

// The one deliberate exception to "the bar is always there": a booking's own
// detail page has its own action menu and a Complete Payment button
// competing for the same thumb zone.
const BOOKING_DETAIL_PATTERN = /^\/bookings\/[^/]+/;

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

function initialsFor(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ClientSidebar({ children }: ClientSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, customers, isLoading: authLoading } = useClientAuth();
  const { unreadCount } = useClientNotifications();
  const { forceOpen: confirmDetailsForceOpen, setForceOpen: setConfirmDetailsForceOpen } = useConfirmDetailsPrompt();
  const [moreOpen, setMoreOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [announcementsGateOpen, setAnnouncementsGateOpen] = useState(false);
  const lastScrollYRef = useRef(0);

  // The confirm-details prompt gets first claim on the user's attention,
  // a just-signed-up customer shouldn't have a feature announcement stack
  // on top of (or under) it. Once it's genuinely out of the way (confirmed,
  // skipped, or was never needed), give it a few seconds of breathing room
  // before the announcement card is allowed to appear at all.
  useEffect(() => {
    if (authLoading || needsDetailsConfirmation(profile) || confirmDetailsForceOpen) {
      setAnnouncementsGateOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setAnnouncementsGateOpen(true), 5000);
    return () => window.clearTimeout(timer);
  }, [authLoading, profile, confirmDetailsForceOpen]);

  const isBookingDetailRoute = BOOKING_DETAIL_PATTERN.test(location.pathname);
  const isMoreActive = MORE_PATHS.some((path) => location.pathname.startsWith(path));

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Same corrected pattern as the salon-admin bottom nav: hide on scroll
  // down, reveal on scroll up or near the top. This app scrolls at the
  // window level (no bounded content pane here), so the listener lives on
  // window rather than a specific ref.
  useEffect(() => {
    const onScroll = () => {
      const nextY = Math.max(0, window.scrollY);
      const delta = nextY - lastScrollYRef.current;
      if (Math.abs(delta) < 4) return;

      if (nextY < 24 || delta < 0) {
        setBottomNavVisible(true);
      } else if (delta > 0) {
        setBottomNavVisible(false);
      }
      lastScrollYRef.current = nextY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setBottomNavVisible(true);
    lastScrollYRef.current = 0;
  }, [location.pathname]);

  const MoreSheetContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex flex-col">
      <SheetTitle className="px-1 pb-2 text-base font-semibold">More</SheetTitle>
      <nav className="space-y-1">
        {MORE_ITEMS.map((item) => (
          <IntentionalClientLink
            key={item.path}
            to={item.path}
            onActivate={onItemClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(item.path)
                ? "bg-primary/8 text-primary"
                : "text-foreground hover:bg-muted"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </IntentionalClientLink>
        ))}
      </nav>
      <div className="mt-2 border-t pt-2">
        <button
          onClick={() => {
            onItemClick?.();
            setShowLogoutDialog(true);
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            "text-destructive hover:bg-destructive/10"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  const firstSalonName = (customers ?? [])[0]?.tenant?.name;
  const profileInitials = initialsFor(profile?.full_name);

  return (
    <ClientInactivityGuard>
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-background">
        {/* Desktop left sidebar: fixed to the viewport, not sticky, so it
            never scrolls with page content (matches salon-admin/backoffice). */}
        <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[232px] shrink-0 flex-col border-r bg-white lg:flex">
          <div className="flex h-16 items-center border-b px-6">
            <Link to="/" className="shrink-0">
              <SalonMagikLogo size="sm" />
            </Link>
          </div>

          <nav className="flex flex-1 flex-col justify-between overflow-y-auto scrollbar-hide px-3 py-4">
            <div className="space-y-1">
              {DESKTOP_NAV_ITEMS.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-[#2E1F4E] text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="space-y-1 border-t pt-3">
                <Link
                  to="/help"
                  className={cn(
                    "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive("/help")
                      ? "bg-[#2E1F4E] text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <HelpCircle className="h-[18px] w-[18px] shrink-0" />
                  <span>Help</span>
                </Link>
                <Link
                  to="/profile"
                  className={cn(
                    "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive("/profile")
                      ? "bg-[#2E1F4E] text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <User className="h-[18px] w-[18px] shrink-0" />
                  <span>Profile</span>
                </Link>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2E1F4E] text-xs font-semibold text-white">
                  {profileInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {profile?.full_name || "Your account"}
                  </p>
                  {firstSalonName && (
                    <p className="truncate text-xs text-muted-foreground">{firstSalonName}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                  onClick={() => setShowLogoutDialog(true)}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Sign out</span>
                </Button>
              </div>
            </div>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:pl-[232px]">
          {/* Mobile Header: navigation itself lives on the bottom bar below;
              the bell opens the shared notifications drawer. */}
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-white/10 bg-primary px-4 text-white lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <SalonMagikLogo variant="white" transparentIcon size="sm" />
            </Link>
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </header>

          {/* Desktop slim top bar */}
          <header className="sticky top-0 z-40 hidden h-16 items-center justify-end gap-3 border-b bg-white/95 px-8 backdrop-blur lg:flex">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <Link
              to="/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E1F4E] text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              {profileInitials}
            </Link>
          </header>

          <main
            className={cn(
              "min-w-0 flex-1 overflow-x-hidden bg-[#fbfaf8]",
              !isBookingDetailRoute && "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0",
            )}
          >
            <MaintenanceBanner />
            <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-5 sm:px-7 lg:py-10">
              <div className="client-content w-full min-w-0 [&>*]:min-w-0">{children}</div>
            </div>
          </main>
        </div>

        {/* Mobile Bottom Navigation: hidden on a booking's own detail page,
            which has its own action menu and payment button in this same
            thumb zone. */}
        {!isBookingDetailRoute && (
          <nav
            aria-label="Primary mobile navigation"
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(0.75rem+env(safe-area-inset-bottom))] transition-all duration-300 motion-reduce:transition-none lg:hidden",
              bottomNavVisible
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0",
            )}
          >
            <div className="mx-3 flex w-[min(94vw,27rem)] items-center justify-around gap-1 rounded-[30px] border border-white/10 bg-primary px-2 py-2 shadow-[0_18px_42px_rgba(28,18,49,0.42)] backdrop-blur-xl">
              {BOTTOM_TABS.map((tab) => {
                const active = isActive(tab.path);
                return (
                  <IntentionalClientLink
                    key={tab.path}
                    to={tab.path}
                    className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[22px] border border-transparent px-1.5 py-1.5 transition-all hover:bg-white/10"
                  >
                    <span
                      className={cn(
                        "relative flex h-8 w-8 items-center justify-center rounded-full transition-all",
                        active ? "bg-accent text-primary shadow-[0_0_0_4px_hsl(var(--accent)/0.14)]" : "text-white/60 group-hover:text-white/90",
                      )}
                    >
                      <tab.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                    </span>
                    <span className={cn("max-w-full truncate text-[10px] font-semibold leading-none transition-colors", active ? "text-white" : "text-white/60 group-hover:text-white/90")}>
                      {tab.label}
                    </span>
                  </IntentionalClientLink>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[22px] border border-transparent px-1.5 py-1.5 transition-all hover:bg-white/10"
              >
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full transition-all", isMoreActive ? "bg-accent text-primary shadow-[0_0_0_4px_hsl(var(--accent)/0.14)]" : "text-white/60 group-hover:text-white/90")}>
                  <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={isMoreActive ? 2.2 : 1.8} />
                </span>
                <span className={cn("max-w-full truncate text-[10px] font-semibold leading-none transition-colors", isMoreActive ? "text-white" : "text-white/60 group-hover:text-white/90")}>
                  More
                </span>
              </button>
            </div>
          </nav>
        )}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:hidden">
            <MoreSheetContent onItemClick={() => setMoreOpen(false)} />
          </SheetContent>
        </Sheet>

        <ClientNotificationsDrawer open={notificationsOpen} onOpenChange={setNotificationsOpen} />

        {announcementsGateOpen && (
          <ProductAnnouncementCard
            client={supabase as any}
            platform="client_portal"
            onNavigate={(path) => navigate(path)}
          />
        )}

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

        <ConfirmDetailsModal forceOpen={confirmDetailsForceOpen} onForceOpenChange={setConfirmDetailsForceOpen} />
      </div>
    </ClientInactivityGuard>
  );
}
