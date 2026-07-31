import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useBackofficeAuth } from "@/hooks";
import { InactivityGuard } from "@/components/session/InactivityGuard";
import { BackofficeOnboardingGate } from "@/components/BackofficeOnboardingGate";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarInset,
  SidebarFooter,
  SidebarTrigger,
} from "@ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@ui/collapsible";
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
  type LucideIcon,
} from "lucide-react";

interface BackofficeLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  pageKey?: string;
  permissionKey?: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, pageKey: "dashboard" },
  {
    href: "/customers/waitlists",
    label: "Customers",
    icon: Users2,
    pageKey: "customers_waitlists",
    children: [
      { href: "/customers/waitlists", label: "Waitlists", pageKey: "customers_waitlists" },
      { href: "/customers/tenants", label: "Tenants", pageKey: "customers_tenants" },
      { href: "/customers/users", label: "Users", pageKey: "customers_users" },
      { href: "/customers/ops-monitor", label: "Ops Monitor", pageKey: "customers_ops_monitor" },
      { href: "/customers/support", label: "Support", pageKey: "settings" },
    ],
  },
  { href: "/feature-flags", label: "Feature Flags", icon: Flag, pageKey: "feature_flags" },
  { href: "/plans", label: "Plans", icon: Coins, pageKey: "plans" },
  { href: "/comms", label: "Comms", icon: MessageSquareText, pageKey: "comms", permissionKey: "comms.view" },
  {
    href: "/sales/campaigns",
    label: "Sales Ops",
    icon: BriefcaseBusiness,
    pageKey: "sales_campaigns",
    children: [
      { href: "/sales/campaigns", label: "Campaigns", pageKey: "sales_campaigns", permissionKey: "sales.manage_campaigns" },
      { href: "/sales/capture-client", label: "Capture Client", pageKey: "sales_capture_client", permissionKey: "sales.capture_client" },
      { href: "/sales/conversions", label: "Conversions", pageKey: "sales_conversions", permissionKey: "sales.view_conversions" },
    ],
  },
  { href: "/audit-logs", label: "Audit Logs", icon: FileText, pageKey: "audit_logs" },
  { href: "/admins", label: "Admins", icon: Shield, pageKey: "admins" },
  { href: "/settings", label: "Settings", icon: Settings, pageKey: "settings" },
];

function isChildActive(child: NavItem, pathname: string) {
  return pathname === child.href || pathname.startsWith(`${child.href}/`);
}

export function BackofficeLayout({ children }: BackofficeLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, backofficeUser, signOut, hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();
  const canSeeItem = (item: NavItem) => {
    if (backofficeUser?.role === "super_admin") return true;
    if (item.pageKey && !hasBackofficePageAccess(item.pageKey)) return false;
    if (item.permissionKey && !hasBackofficePermission(item.permissionKey)) return false;
    return true;
  };

  const visibleNavItems = navItems
    .map((item) => ({
      ...item,
      children: item.children?.filter(canSeeItem),
    }))
    .filter((item) => {
      if (item.children?.length) return true;
      return canSeeItem(item);
    });

  // Groups with a currently-active child start expanded; everything else starts
  // collapsed, since a parent with children isn't itself a navigable page.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of visibleNavItems) {
      if (item.children?.length) {
        initial[item.href] = item.children.some((child) => isChildActive(child, location.pathname));
      }
    }
    return initial;
  });

  const toggleGroup = (href: string) => {
    setOpenGroups((prev) => ({ ...prev, [href]: !prev[href] }));
  };

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
			<SidebarProvider>
				<div className="flex min-h-screen w-full flex-col bg-[#f6f5f7]">
					<div className="flex min-h-0 flex-1">
						<Sidebar className=" border-r border-white/10">
							<SidebarHeader className="border-b border-white/10 px-4 py-4">
								<div className="flex items-center gap-2">
									<div className="rounded-lg bg-white/10 p-2">
										<Shield className="h-5 w-5 text-[#a9c9e8]" />
									</div>
									<div>
										<h1 className="text-sm font-medium text-white">
											Salon Magik Admin
										</h1>
										<p className="text-[11px] text-[#a9c9e8]">Backoffice</p>
									</div>
								</div>
							</SidebarHeader>

							<SidebarContent className="px-2 py-4 text-white/75">
								<SidebarMenu>
									{visibleNavItems.map((item) => {
										const hasChildren = Boolean(item.children?.length);

										if (!hasChildren) {
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
															{item.icon ? (
																<item.icon className="h-4 w-4" />
															) : null}
															<span>{item.label}</span>
														</Link>
													</SidebarMenuButton>
												</SidebarMenuItem>
											);
										}

										const isOpen = openGroups[item.href] ?? false;
										const isParentActive = item.children!.some((child) =>
											isChildActive(child, location.pathname),
										);

										return (
											<Collapsible
												key={item.href}
												open={isOpen}
												onOpenChange={() => toggleGroup(item.href)}
												asChild
											>
												<SidebarMenuItem>
													<CollapsibleTrigger asChild>
														<SidebarMenuButton isActive={isParentActive}>
															{item.icon ? (
																<item.icon className="h-4 w-4" />
															) : null}
															<span>{item.label}</span>
															<ChevronDown
																className={`ml-auto h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
															/>
														</SidebarMenuButton>
													</CollapsibleTrigger>
													<CollapsibleContent>
														<SidebarMenuSub>
															{item.children!.map((child) => {
																const childActive = isChildActive(
																	child,
																	location.pathname,
																);
																return (
																	<SidebarMenuSubItem key={child.href}>
																		<SidebarMenuSubButton
																			asChild
																			isActive={childActive}
																		>
																			<Link to={child.href}>{child.label}</Link>
																		</SidebarMenuSubButton>
																	</SidebarMenuSubItem>
																);
															})}
														</SidebarMenuSub>
													</CollapsibleContent>
												</SidebarMenuItem>
											</Collapsible>
										);
									})}
								</SidebarMenu>
							</SidebarContent>

							<SidebarFooter className="border-t border-white/10 p-3">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											className="w-full justify-start gap-3 px-2 text-white hover:bg-white/10 hover:text-white"
										>
											<Avatar className="h-8 w-8">
												<AvatarFallback className="rounded-md bg-[#2f6ba6] text-xs text-white">
													{initials}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-1 flex-col items-start text-left">
												<span className="max-w-[120px] truncate text-sm font-medium text-white">
													{profile?.full_name || "Admin"}
												</span>
												<span className="text-xs text-[#a9c9e8]">
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

						<SidebarInset className="min-w-0 flex-1 bg-[#f6f5f7]">
							<div className="flex items-center justify-between border-b px-4 py-3 md:hidden">
								<div className="flex items-center gap-2">
									<Shield className="h-4 w-4 text-primary" />
									<span className="text-sm font-medium">BackOffice</span>
								</div>
								<SidebarTrigger className="h-9 w-9" />
							</div>
							<BackofficeOnboardingGate />
							<main className="flex-1 overflow-auto">{children}</main>
						</SidebarInset>
					</div>
				</div>
			</SidebarProvider>
		</InactivityGuard>
	);
}
