 import { ReactNode } from "react";
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
  Eye,
  FileText,
  BriefcaseBusiness,
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
      { href: "/customers/ops-monitor", label: "Ops Monitor", pageKey: "customers_ops_monitor" },
    ],
  },
  { href: "/feature-flags", label: "Feature Flags", icon: Flag, pageKey: "feature_flags" },
  { href: "/plans", label: "Plans", icon: Coins, pageKey: "plans" },
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
  { href: "/impersonation", label: "Impersonation", icon: Eye, pageKey: "impersonation" },
  { href: "/settings", label: "Settings", icon: Settings, pageKey: "settings" },
];

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
					<div className="flex min-h-screen w-full bg-background">
						<Sidebar className="border-r border-white/10 [&_[data-sidebar=sidebar]]:bg-zinc-950 [&_[data-sidebar=sidebar]]:text-white">
							<SidebarHeader className="border-b border-white/10 px-4 py-4">
								<div className="flex items-center gap-2">
									<div className="rounded-xl bg-red-600/20 p-2.5 ring-1 ring-red-500/60 shadow-[0_0_24px_rgba(239,68,68,0.25)]">
										<Shield className="h-6 w-6 text-red-400" />
									</div>
									<div>
										<h1 className="font-semibold text-white">BackOffice</h1>
										<p className="text-xs text-white/70">Salon Magik Admin</p>
									</div>
								</div>
							</SidebarHeader>

							<SidebarContent className="px-2 py-4">
								<SidebarMenu>
									{visibleNavItems.map((item) => {
                    const hasChildren = Boolean(item.children?.length);
                    const isParentActive = hasChildren
                      ? item.children!.some((child) => location.pathname === child.href || location.pathname.startsWith(`${child.href}/`))
                      : location.pathname === item.href ||
                        (item.href !== "/" && location.pathname.startsWith(item.href));

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild={!hasChildren}
                          isActive={isParentActive}
                          className="text-white/90 hover:text-white data-[active=true]:text-white"
                        >
                          {hasChildren ? (
                            <div className="flex items-center gap-3 px-2 py-1.5">
                              {item.icon ? <item.icon className="h-4 w-4" /> : null}
                              <span>{item.label}</span>
                            </div>
                          ) : (
                            <Link to={item.href} className="flex items-center gap-3">
                              {item.icon ? <item.icon className="h-4 w-4" /> : null}
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </SidebarMenuButton>
                        {hasChildren ? (
                          <SidebarMenuSub>
                            {item.children!.map((child) => {
                              const childActive =
                                location.pathname === child.href ||
                                location.pathname.startsWith(`${child.href}/`);
                              return (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton asChild isActive={childActive}>
                                    <Link to={child.href}>{child.label}</Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
								</SidebarMenu>
							</SidebarContent>

							<SidebarFooter className="border-t border-white/10 p-4">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											className="w-full justify-start gap-3 px-2 text-white hover:bg-white/10 hover:text-white"
										>
											<Avatar className="h-8 w-8">
												<AvatarFallback className="bg-red-600/20 text-red-300 text-xs">
													{initials}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-1 flex-col items-start text-left">
												<span className="text-sm font-medium truncate max-w-[120px]">
													{profile?.full_name || "Admin"}
												</span>
												<span className="text-xs text-white/70">
													{roleBadge}
												</span>
											</div>
											<ChevronDown className="h-4 w-4 text-white/70" />
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

						<SidebarInset className="flex-1">
							<div className="flex items-center justify-between border-b px-4 py-3 md:hidden">
								<div className="flex items-center gap-2">
									<Shield className="h-4 w-4 text-red-500" />
									<span className="text-sm font-medium">BackOffice</span>
								</div>
								<SidebarTrigger className="h-9 w-9" />
							</div>
							<BackofficeOnboardingGate />
							<main className="flex-1 overflow-auto">{children}</main>
						</SidebarInset>
					</div>
				</SidebarProvider>
			</InactivityGuard>
		);
 }
