 import { ReactNode } from "react";
 import { Link, useLocation, useNavigate } from "react-router-dom";
 import { useBackofficeAuth } from "@/hooks/backoffice";
 import { InactivityGuard } from "@/components/session/InactivityGuard";
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
 } from "@/components/ui/sidebar";
 import { Button } from "@/components/ui/button";
 import { Avatar, AvatarFallback } from "@/components/ui/avatar";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
 import {
   LayoutDashboard,
   Users,
   Building2,
   Flag,
   Settings,
   LogOut,
   Shield,
   ChevronDown,
 } from "lucide-react";
 
 interface BackofficeLayoutProps {
   children: ReactNode;
 }
 
 const navItems = [
   { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard },
   { href: "/backoffice/waitlist", label: "Waitlist", icon: Users },
   { href: "/backoffice/tenants", label: "Tenants", icon: Building2 },
   { href: "/backoffice/feature-flags", label: "Feature Flags", icon: Flag },
   { href: "/backoffice/settings", label: "Settings", icon: Settings },
 ];
 
 export function BackofficeLayout({ children }: BackofficeLayoutProps) {
   const location = useLocation();
   const navigate = useNavigate();
   const { profile, backofficeUser, signOut } = useBackofficeAuth();
 
   const handleSignOut = async () => {
     await signOut();
     navigate("/backoffice/login", { replace: true });
   };
 
   const initials = profile?.full_name
     ?.split(" ")
     .map((n) => n[0])
     .join("")
     .toUpperCase()
     .slice(0, 2) || "BO";
 
   const roleBadge = backofficeUser?.role === "super_admin" 
     ? "Super Admin" 
     : backofficeUser?.role === "admin" 
       ? "Admin" 
       : "Support";
 
   return (
     <InactivityGuard warningMinutes={22} logoutMinutes={30}>
       <SidebarProvider>
         <div className="flex min-h-screen w-full bg-background">
           <Sidebar className="border-r">
             <SidebarHeader className="border-b px-4 py-4">
               <div className="flex items-center gap-2">
                 <div className="rounded-lg bg-destructive/10 p-2">
                   <Shield className="h-5 w-5 text-destructive" />
                 </div>
                 <div>
                   <h1 className="font-semibold text-foreground">BackOffice</h1>
                   <p className="text-xs text-muted-foreground">Salon Magik Admin</p>
                 </div>
               </div>
             </SidebarHeader>
             
             <SidebarContent className="px-2 py-4">
               <SidebarMenu>
                 {navItems.map((item) => {
                   const isActive = location.pathname === item.href || 
                     (item.href !== "/backoffice" && location.pathname.startsWith(item.href));
                   return (
                     <SidebarMenuItem key={item.href}>
                       <SidebarMenuButton asChild isActive={isActive}>
                         <Link to={item.href} className="flex items-center gap-3">
                           <item.icon className="h-4 w-4" />
                           <span>{item.label}</span>
                         </Link>
                       </SidebarMenuButton>
                     </SidebarMenuItem>
                   );
                 })}
               </SidebarMenu>
             </SidebarContent>
 
             <SidebarFooter className="border-t p-4">
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" className="w-full justify-start gap-3 px-2">
                     <Avatar className="h-8 w-8">
                       <AvatarFallback className="bg-primary/10 text-primary text-xs">
                         {initials}
                       </AvatarFallback>
                     </Avatar>
                     <div className="flex flex-1 flex-col items-start text-left">
                       <span className="text-sm font-medium truncate max-w-[120px]">
                         {profile?.full_name || "Admin"}
                       </span>
                       <span className="text-xs text-muted-foreground">{roleBadge}</span>
                     </div>
                     <ChevronDown className="h-4 w-4 text-muted-foreground" />
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="start" className="w-56">
                   <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                     <LogOut className="mr-2 h-4 w-4" />
                     Sign out
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             </SidebarFooter>
           </Sidebar>
 
           <SidebarInset className="flex-1">
             <main className="flex-1 overflow-auto">
               {children}
             </main>
           </SidebarInset>
         </div>
       </SidebarProvider>
     </InactivityGuard>
   );
 }