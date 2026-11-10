import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useBackofficeAuth, useBlockedRefundsCount } from "@/hooks";
import { InactivityGuard } from "@/components/session/InactivityGuard";
import { BackofficeOnboardingGate } from "@/components/BackofficeOnboardingGate";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarFooter,
  SidebarTrigger,
} from "@ui/sidebar";
import { Button } from "@ui/button";
import { Avatar, AvatarFallback } from "@ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
  LayoutDashboard,
  Flag,
  Settings,
  LogOut,
  Shield,
  ChevronDown,
  Coins,
  FileText,
  BriefcaseBusiness,
  MessageSquareText,
  Users2,
  Receipt,
  Wallet,
  ShieldAlert,
  ArrowLeftRight,
  Percent,
  BadgeCheck,
  Banknote,
  Building2,
  UserRound,
  RadioTower,
  type LucideIcon,
} from "lucide-react";
import { ProductAnnouncementCard } from "@shared/ProductAnnouncementCard";
import { supabase } from "@/lib/supabase";

interface BackofficeLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  pageKey?: string;
  /** Visible if the user has ANY of these page keys — for a nav entry that now points at one merged page backed by several gated routes. */
  anyPageKey?: string[];
  permissionKey?: string;
  badge?: "blockedRefunds";
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

// Grouped by job, not alphabetically — mirrors how the team actually thinks
// about the app (pricing config vs. what a tenant owes vs. payments risk),
// rather than one flat 16-item list. Renamed labels below are cosmetic only
// (disambiguating "Pricing catalog" from "Tenant billing", which used to be
// confusingly similar — "Plans" vs. "Subscriptions & Add-ons" — for two
// unrelated pages); routes and pageKeys are unchanged, so this carries no
// permission-model risk on its own.
const navSections: NavSection[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, pageKey: "dashboard" },
    ],
  },
  {
    label: "Pricing & billing",
    items: [
      { href: "/plans", label: "Pricing catalog", icon: Coins, pageKey: "plans" },
      { href: "/subscriptions", label: "Tenant billing", icon: Receipt, pageKey: "subscriptions" },
    ],
  },
  {
    label: "Tenants",
    items: [
      { href: "/customers/tenants", label: "Salons", icon: Building2, pageKey: "customers_tenants" },
      { href: "/customers/waitlists", label: "Waitlists", icon: Users2, pageKey: "customers_waitlists" },
      { href: "/customers/users", label: "Users", icon: UserRound, pageKey: "customers_users" },
      { href: "/customers/ops-monitor", label: "Ops monitor & support", icon: RadioTower, anyPageKey: ["customers_ops_monitor", "settings"] },
    ],
  },
  {
    label: "Payments",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, pageKey: "transactions", badge: "blockedRefunds" },
      // Withdrawals, the payout-setup queue, and fee settings are now tabs of one
      // page (MoneyOps.dc.html artifact board: "previously three separate nav
      // items, now one place with one filter bar") — visible if the admin has
      // access to any of the three underlying routes; the page itself only
      // shows the tabs they actually have access to.
      { href: "/withdrawals", label: "Withdrawals & fees", icon: Banknote, anyPageKey: ["withdrawals", "verification_queue", "payment_fee_settings"] },
    ],
  },
  {
    label: "Trust & risk",
    items: [
      { href: "/flagged-signups", label: "Flagged signups", icon: ShieldAlert, pageKey: "flagged_signups" },
    ],
  },
  {
    label: "Comms",
    items: [
      { href: "/comms-credits", label: "Credits & messages", icon: Wallet, pageKey: "comms_credits" },
      // Templates and Announcements are now tabs of one page (CommsTemplates.dc.html
      // artifact board shows a single "Templates & announcements" page), so this is
      // one nav item with no single pageKey/permissionKey gate — the page itself
      // shows only the tabs the signed-in admin actually has access to.
      { href: "/comms", label: "Templates & announcements", icon: MessageSquareText },
    ],
  },
  {
    label: "Sales ops",
    items: [
      // Campaigns, Capture client, and Conversions are now tabs of one page
      // (SalesOps.dc.html artifact board shows a single "Sales ops" page), so this
      // is one nav item — the page gates each tab internally per the signed-in
      // admin's actual permissions.
      { href: "/sales/campaigns", label: "Campaigns & conversions", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, pageKey: "settings" },
      { href: "/feature-flags", label: "Feature flags", icon: Flag, pageKey: "feature_flags" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/admins", label: "Admins & roles", icon: Shield, pageKey: "admins" },
      { href: "/audit-logs", label: "Audit logs", icon: FileText, pageKey: "audit_logs" },
    ],
  },
];

export function BackofficeLayout({ children }: BackofficeLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, backofficeUser, signOut, hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();
  const { data: blockedRefundsCount } = useBlockedRefundsCount(Boolean(backofficeUser?.user_id));
  const canSeeItem = (item: NavItem) => {
    if (backofficeUser?.role === "super_admin") return true;
    if (item.pageKey && !hasBackofficePageAccess(item.pageKey)) return false;
    if (item.anyPageKey && !item.anyPageKey.some((key) => hasBackofficePageAccess(key))) return false;
    if (item.permissionKey && !hasBackofficePermission(item.permissionKey)) return false;
    return true;
  };

  const visibleNavSections = navSections
    .map((section) => ({ ...section, items: section.items.filter(canSeeItem) }))
    .filter((section) => section.items.length > 0);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "BO";

  const roleBadge = backofficeUser?.role === "super_admin"
    ? "Super Admin"
    : backofficeUser?.is_sales_agent
      ? "Sales Agent"
      : "Team Member";

  return (
		<InactivityGuard warningMinutes={22} logoutMinutes={30}>
			<SidebarProvider style={{ "--sidebar-width": "264px" } as React.CSSProperties}>
				<div className="flex min-h-screen w-full flex-col bg-background">
					<div className="flex min-h-0 flex-1">
						<Sidebar className="border-r border-border">
							<SidebarHeader className="border-b border-border px-[18px] pb-3.5 pt-5">
								<div className="flex items-center gap-2.5">
									<div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-primary">
										<Shield className="h-4 w-4 text-primary-foreground" />
									</div>
									<div>
										<h1 className="text-[13.5px] font-bold text-foreground">
											Salon Magik Admin
										</h1>
										<p className="text-[11px] text-muted-foreground">Backoffice</p>
									</div>
								</div>
							</SidebarHeader>

							<SidebarContent className="px-2.5 pb-5 pt-1.5">
								{visibleNavSections.map((section, sectionIndex) => (
									<SidebarMenu key={section.label ?? `section-${sectionIndex}`}>
										{section.label ? (
											<p className="px-3.5 pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
												{section.label}
											</p>
										) : null}
										{section.items.map((item) => {
											const isActive =
												location.pathname === item.href ||
												(item.href !== "/" &&
													location.pathname.startsWith(item.href));
											return (
												<SidebarMenuItem key={item.href}>
													<SidebarMenuButton asChild isActive={isActive}>
														<Link
															to={item.href}
															className="flex items-center gap-3"
														>
															<item.icon className="h-4 w-4" />
															<span>{item.label}</span>
															{item.badge === "blockedRefunds" && Boolean(blockedRefundsCount) && (
																<span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
																{blockedRefundsCount}
															</span>
															)}
														</Link>
													</SidebarMenuButton>
												</SidebarMenuItem>
											);
										})}
									</SidebarMenu>
								))}
							</SidebarContent>

							<SidebarFooter className="border-t border-border p-3.5">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											className="w-full justify-start gap-3 px-2 text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
										>
											<Avatar className="h-8 w-8">
												<AvatarFallback className="rounded-md bg-primary text-xs text-primary-foreground">
													{initials}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-1 flex-col items-start text-left">
												<span className="max-w-[120px] truncate text-sm font-medium text-foreground">
													{profile?.full_name || "Admin"}
												</span>
												<span className="text-xs text-muted-foreground">
													{roleBadge}
												</span>
											</div>
											<ChevronDown className="h-4 w-4 text-muted-foreground" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="w-56">
										<DropdownMenuItem
											onClick={handleSignOut}
											className="text-destructive"
										>
											<LogOut className="mr-2 h-4 w-4" />
											Sign out
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</SidebarFooter>
						</Sidebar>

						<SidebarInset className="min-w-0 flex-1 bg-background">
							<div className="flex items-center justify-between border-b px-4 py-3 md:hidden">
								<div className="flex items-center gap-2">
									<Shield className="h-4 w-4 text-primary" />
									<span className="text-sm font-medium">BackOffice</span>
								</div>
								<SidebarTrigger className="h-9 w-9" />
							</div>
							<BackofficeOnboardingGate />
							<ProductAnnouncementCard
								client={supabase as any}
								platform="backoffice"
								onNavigate={(path) => navigate(path)}
							/>
							<main className="flex-1 overflow-auto">{children}</main>
						</SidebarInset>
					</div>
				</div>
			</SidebarProvider>
		</InactivityGuard>
	);
}
