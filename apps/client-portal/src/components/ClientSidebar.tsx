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
  Clock,
  RefreshCcw,
  Bell,
  User,
  HelpCircle,
  LogOut,
  MoreHorizontal,
} from "lucide-react";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { ProductAnnouncementCard } from "@shared/ProductAnnouncementCard";
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

// Desktop keeps its own top nav (unchanged). Mobile's bottom bar below is a
// separate, deliberately shorter set — the busiest four destinations get a
// permanent tab, everything else lives behind "More" so nothing is ever
// listed in both places at once.
const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Bookings", icon: Calendar, path: "/bookings" },
  { label: "History", icon: Clock, path: "/history" },
  { label: "Store Credit", icon: RefreshCcw, path: "/balance" },
  { label: "Notifications", icon: Bell, path: "/notifications", showBadge: true },
  { label: "Profile & Security", icon: User, path: "/profile" },
  { label: "Help & Support", icon: HelpCircle, path: "/help" },
];

const BOTTOM_TABS = [
  { label: "Home", icon: LayoutDashboard, path: "/", showBadge: false },
  { label: "Bookings", icon: Calendar, path: "/bookings", showBadge: false },
  { label: "Alerts", icon: Bell, path: "/notifications", showBadge: true },
  { label: "Profile", icon: User, path: "/profile", showBadge: false },
] as const;

const MORE_ITEMS = [
  { label: "History", icon: Clock, path: "/history" },
  { label: "Store Credit", icon: RefreshCcw, path: "/balance" },
  { label: "Help & Support", icon: HelpCircle, path: "/help" },
] as const;

// Kept in sync with MORE_ITEMS' paths (plus /refunds, which redirects into
// /balance) — whatever "More" can navigate to, so the tab reads as active
// for the whole time you're browsing one of its destinations, not just while
// the sheet itself is open.
const MORE_PATHS = ["/history", "/balance", "/refunds", "/help"];

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

export function ClientSidebar({ children }: ClientSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isLoading: authLoading } = useClientAuth();
  const { unreadCount } = useClientNotifications();
  const { forceOpen: confirmDetailsForceOpen, setForceOpen: setConfirmDetailsForceOpen } = useConfirmDetailsPrompt();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [announcementsGateOpen, setAnnouncementsGateOpen] = useState(false);
  const lastScrollYRef = useRef(0);

  // The confirm-details prompt gets first claim on the user's attention —
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

  return (
    <ClientInactivityGuard>
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-background">
        {/* Mobile Header — navigation itself lives on the bottom bar below;
            this is chrome (brand) only, no duplicate nav entry point. */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-white/10 bg-primary px-4 text-white lg:hidden">
          <Link to="/" className="flex items-center gap-2">
            <SalonMagikLogo variant="white" transparentIcon size="sm" />
          </Link>
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
                  {isActive(item.path) && (
                    <span className="absolute bottom-0.5 left-1/2 h-[2px] w-1/2 -translate-x-1/2 rounded-full bg-accent" />
                  )}
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

        <main
          className={cn(
            "min-w-0 overflow-x-hidden bg-[#fbfaf8]",
            !isBookingDetailRoute && "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0",
          )}
        >
          <MaintenanceBanner />
          <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-5 sm:px-7 lg:py-10">
            <div className="client-content w-full min-w-0 [&>*]:min-w-0">{children}</div>
          </div>
        </main>

        {/* Mobile Bottom Navigation — hidden on a booking's own detail page,
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
                const badgeCount = tab.showBadge ? unreadCount : 0;
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
                      {badgeCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                          {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                      )}
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
