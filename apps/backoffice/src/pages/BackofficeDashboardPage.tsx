import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useWaitlist, useTenants } from "@/hooks";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
 import { Button } from "@ui/button";
 import { Link, Navigate } from "react-router-dom";
 import { Users, Building2, Clock, TrendingUp, ArrowRight } from "lucide-react";

 export default function BackofficeDashboardPage() {
   const { backofficeUser, hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();
   const { data: pendingLeads } = useWaitlist("pending");
   const { data: tenants } = useTenants();

   if (backofficeUser?.role !== "super_admin") {
     const routeCandidates: Array<{ route: string; pageKey: string; permissionKey?: string }> = [
       { route: "/customers/waitlists", pageKey: "customers_waitlists", permissionKey: "customers.view_waitlists" },
       { route: "/customers/tenants", pageKey: "customers_tenants", permissionKey: "customers.view_tenants" },
       { route: "/customers/ops-monitor", pageKey: "customers_ops_monitor", permissionKey: "customers.view_ops_monitor" },
       { route: "/sales/campaigns", pageKey: "sales_campaigns", permissionKey: "sales.manage_campaigns" },
       { route: "/sales/capture-client", pageKey: "sales_capture_client", permissionKey: "sales.capture_client" },
       { route: "/sales/conversions", pageKey: "sales_conversions", permissionKey: "sales.view_conversions" },
       { route: "/settings", pageKey: "settings", permissionKey: "settings.view" },
     ];
     const firstAllowed = routeCandidates.find(
       (candidate) =>
         hasBackofficePageAccess(candidate.pageKey) &&
         (!candidate.permissionKey || hasBackofficePermission(candidate.permissionKey)),
     );
     if (firstAllowed) {
       return <Navigate to={firstAllowed.route} replace />;
     }
   }

   const activeCount = tenants?.filter(t => t.subscription_status === "active" || t.subscription_status === "trialing").length || 0;
   const pendingCount = pendingLeads?.length || 0;

   const stats = [
     {
       title: "Pending Leads",
       value: pendingCount,
       description: "Awaiting review",
       icon: Clock,
       href: "/customers/waitlists",
       color: "text-amber-500",
       bgColor: "bg-amber-500/10",
     },
     {
       title: "Active Tenants",
       value: activeCount,
       description: "Active or trialing",
       icon: Building2,
       href: "/customers/tenants",
       color: "text-emerald-500",
       bgColor: "bg-emerald-500/10",
     },
     {
       title: "Total Tenants",
       value: tenants?.length || 0,
       description: "All salons",
       icon: Users,
       href: "/customers/tenants",
       color: "text-blue-500",
       bgColor: "bg-blue-500/10",
     },
   ];

   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
           <p className="text-muted-foreground">
             Platform overview and quick actions
           </p>
         </div>

         <div className="grid gap-4 md:grid-cols-3">
           {stats.map((stat) => (
             <Card key={stat.title}>
               <CardHeader className="flex flex-row items-center justify-between pb-2">
                 <CardTitle className="text-sm font-medium text-muted-foreground">
                   {stat.title}
                 </CardTitle>
                 <div className={`rounded-full p-2 ${stat.bgColor}`}>
                   <stat.icon className={`h-4 w-4 ${stat.color}`} />
                 </div>
               </CardHeader>
               <CardContent>
                 <div className="text-3xl font-bold">{stat.value}</div>
                 <p className="text-xs text-muted-foreground mt-1">
                   {stat.description}
                 </p>
                 <Button asChild variant="link" className="px-0 mt-2 h-auto">
                   <Link to={stat.href} className="flex items-center gap-1 text-sm">
                     View all <ArrowRight className="h-3 w-3" />
                   </Link>
                 </Button>
               </CardContent>
             </Card>
           ))}
         </div>

         {pendingCount > 0 && (
           <Card className="border-amber-200 bg-amber-50/50">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-amber-700">
                 <Clock className="h-5 w-5" />
                 Action Required
               </CardTitle>
               <CardDescription className="text-amber-600">
                 You have {pendingCount} waitlist {pendingCount === 1 ? "lead" : "leads"} awaiting review.
               </CardDescription>
             </CardHeader>
             <CardContent>
               <Button asChild>
                 <Link to="/customers/waitlists">Review Waitlist</Link>
               </Button>
             </CardContent>
           </Card>
         )}
       </div>
     </BackofficeLayout>
   );
 }
