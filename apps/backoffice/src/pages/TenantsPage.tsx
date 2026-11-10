 import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useTenants, TenantWithStats } from "@/hooks";
import { supabase } from "@/lib/supabase";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
 import { Button } from "@ui/button";
 import { Badge } from "@ui/badge";
 import { Input } from "@ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Label } from "@ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  Dialog,
  DialogDescription,
  DialogTrigger,
} from "@ui/dialog";
import {
  ArtifactDialogContent,
  ArtifactDialogHeader,
  ArtifactDialogFooter,
  ArtifactDialogTitle,
  ARTIFACT_DIALOG_BODY_PADDING,
} from "@/components/dialogs/ArtifactDialogChrome";
import { cn } from "@shared/utils";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@ui/table";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@ui/dropdown-menu";
 import { Loader2, MoreHorizontal, Search, Eye, Building2, Users, Crown, Info, RefreshCcw, Plus } from "lucide-react";
 import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
 import { format } from "date-fns";
import { toast } from "sonner";
import { EmptyState } from "@ui/empty-state";
import { AddTenantOwnerDialog } from "@/components/AddTenantOwnerDialog";
import { MigrateTenantBillingDialog } from "@/components/MigrateTenantBillingDialog";

interface ChainUnlockRequestRow {
  id: string;
  tenant_id: string;
  requested_locations: number;
  allowed_locations: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  tenant?: { id: string; name: string; plan: string | null } | null;
}
 
export default function TenantsPage() {
   const queryClient = useQueryClient();
   const { backofficeUser } = useBackofficeAuth();
   const { data: tenants, isLoading } = useTenants();
   const [searchQuery, setSearchQuery] = useState("");
   const [planFilter, setPlanFilter] = useState("all");
   const [statusFilter, setStatusFilter] = useState("all");
   const [approveDialogOpen, setApproveDialogOpen] = useState(false);
   const [selectedRequest, setSelectedRequest] = useState<ChainUnlockRequestRow | null>(null);
   const [allowedLocations, setAllowedLocations] = useState(1);
   const [amount, setAmount] = useState("0");
   const [currency, setCurrency] = useState("USD");
   const [reason, setReason] = useState("");
   const [addOwnerTenant, setAddOwnerTenant] = useState<TenantWithStats | null>(null);
   const [migrateBillingTenant, setMigrateBillingTenant] = useState<TenantWithStats | null>(null);
   const [addSalonDialogOpen, setAddSalonDialogOpen] = useState(false);
   const [newSalonName, setNewSalonName] = useState("");
   const [newSalonCountry, setNewSalonCountry] = useState("");
   const [newSalonPlan, setNewSalonPlan] = useState("solo");
   const [newSalonOwnerEmail, setNewSalonOwnerEmail] = useState("");

   // No backend path exists yet for backoffice-initiated salon creation
   // (verified: no create-tenant RPC/edge function in the codebase — salons
   // are currently only created via the public self-signup flow). This
   // mutation is a real, clearly-labeled stub rather than a silently fake
   // success, per the redesign's "don't fabricate working submits" rule —
   // flagged in the implementation report for backend follow-up.
   const createSalonMutation = useMutation({
     mutationFn: async () => {
       throw new Error(
         "Creating salons from the backoffice isn't wired up to a backend yet — this needs a create-tenant RPC/edge function (none currently exists; today salons are only created via public self-signup). Flagged for implementation.",
       );
     },
     onError: (error: Error) => toast.error(error.message),
   });

   const { data: marketCountries = [] } = useQuery({
     queryKey: ["backoffice-tenants-market-countries"],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("market_countries")
         .select("country_code,country_name")
         .order("country_name", { ascending: true });
       if (error) throw error;
       return data || [];
     },
   });
   const COUNTRY_FLAG: Record<string, string> = { NG: "🇳🇬", GH: "🇬🇭" };
   const countryNameByCode = new Map(marketCountries.map((c) => [c.country_code, c.country_name]));
   const countryLabel = (code: string | null) =>
     code ? `${COUNTRY_FLAG[code] || ""} ${countryNameByCode.get(code) || code}`.trim() : "—";

   const { data: chainUnlockRequests = [], isLoading: loadingUnlockRequests } = useQuery({
     queryKey: ["chain-unlock-requests"],
     queryFn: async () => {
       const { data, error } = await (supabase
         .from("tenant_chain_unlock_requests" as any)
         .select("id, tenant_id, requested_locations, allowed_locations, status, created_at, tenant:tenants(id,name,plan)")
         .eq("status", "pending")
         .order("created_at", { ascending: false }) as any);
       if (error) throw error;
       return (data || []) as ChainUnlockRequestRow[];
     },
   });

   const approveUnlockMutation = useMutation({
     mutationFn: async () => {
       if (!selectedRequest) return;
       const { error } = await (supabase.rpc as any)("approve_chain_custom_unlock", {
         p_tenant_id: selectedRequest.tenant_id,
         p_allowed_locations: Math.max(1, Number(allowedLocations || 1)),
         p_amount: Number(amount || 0),
         p_currency: currency,
         p_reason: reason || "Custom unlock approved in backoffice.",
       });
       if (error) throw error;
     },
     onSuccess: () => {
       toast.success("Chain unlock approved");
       queryClient.invalidateQueries({ queryKey: ["chain-unlock-requests"] });
       queryClient.invalidateQueries({ queryKey: ["backoffice-tenants"] });
       setApproveDialogOpen(false);
       setSelectedRequest(null);
     },
     onError: (error: any) => toast.error(error.message || "Failed to approve unlock"),
   });
 
   const filteredTenants = tenants?.filter((tenant) => {
     const matchesSearch =
       tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       tenant.owner_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       tenant.id.toLowerCase().includes(searchQuery.toLowerCase());
     const matchesPlan = planFilter === "all" || tenant.plan === planFilter;
     const matchesStatus =
       statusFilter === "all" || tenant.subscription_status === statusFilter;
     return matchesSearch && matchesPlan && matchesStatus;
   });
   const availablePlans = Array.from(
     new Set((tenants || []).map((tenant) => tenant.plan).filter(Boolean)),
   ) as string[];
   const activeCount = (tenants || []).filter(
     (tenant) => tenant.subscription_status === "active",
   ).length;
   const trialCount = (tenants || []).filter(
     (tenant) => tenant.subscription_status === "trialing",
   ).length;
   const pastDueCount = (tenants || []).filter(
     (tenant) => tenant.subscription_status === "past_due",
   ).length;
 
  const STATUS_BADGE_TOOLTIPS: Record<string, string> = {
    active: "Paying subscriber in good standing.",
    trialing: "In their free trial, hasn't been charged yet.",
    past_due: "A charge failed; still active but at risk of losing access.",
    canceled: "Subscription was canceled, can typically resubscribe.",
    permanently_deactivated: "Manually deactivated by the platform team, cannot resubscribe without intervention.",
    inactive: "No active or trialing subscription, and not explicitly canceled or deactivated.",
  };

  const getStatusBadge = (status: string) => {
    const badge = (() => {
      switch (status) {
        case "active":
          return <Badge variant="success" className="cursor-default">Active</Badge>;
        case "trialing":
          return <Badge variant="info" className="cursor-default">Trial</Badge>;
        case "past_due":
          return <Badge variant="warning" className="cursor-default">Past Due</Badge>;
        case "canceled":
          return <Badge variant="destructive" className="cursor-default">Canceled</Badge>;
        case "permanently_deactivated":
          return <Badge variant="neutral" className="cursor-default">Deactivated</Badge>;
        case "inactive":
          return <Badge variant="secondary" className="cursor-default">Inactive</Badge>;
        default:
          return <Badge variant="secondary" className="cursor-default">{status}</Badge>;
      }
    })();
    const tooltip = STATUS_BADGE_TOOLTIPS[status];
    if (!tooltip) return badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    );
  };
 
   return (
     <BackofficeLayout>
       <div className="backoffice-page">
         <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
           <div>
             <h1 className="text-[20px] font-bold tracking-tight">Salons</h1>
             <p className="mt-[3px] text-[12.5px] text-muted-foreground">
               Every tenant on the platform. Click a row to open its workspace.
             </p>
           </div>
           <Dialog open={addSalonDialogOpen} onOpenChange={setAddSalonDialogOpen}>
             <DialogTrigger asChild>
               <Button size="sm">
                 <Plus className="mr-1.5 h-4 w-4" />
                 Add salon
               </Button>
             </DialogTrigger>
             <ArtifactDialogContent>
               <ArtifactDialogHeader>
                 <ArtifactDialogTitle>Add salon</ArtifactDialogTitle>
               </ArtifactDialogHeader>
               <div className={cn(ARTIFACT_DIALOG_BODY_PADDING)}>
                 <div className="space-y-1.5">
                   <Label className="text-[11.5px] font-semibold text-muted-foreground">Salon name</Label>
                   <Input value={newSalonName} onChange={(e) => setNewSalonName(e.target.value)} placeholder="e.g. Glow Studio" />
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1.5">
                     <Label className="text-[11.5px] font-semibold text-muted-foreground">Country</Label>
                     <Select value={newSalonCountry} onValueChange={setNewSalonCountry}>
                       <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                       <SelectContent>
                         {marketCountries.map((c: any) => (
                           <SelectItem key={c.country_code} value={c.country_code}>{c.country_name}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-1.5">
                     <Label className="text-[11.5px] font-semibold text-muted-foreground">Plan</Label>
                     <Select value={newSalonPlan} onValueChange={setNewSalonPlan}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="solo">Solo</SelectItem>
                         <SelectItem value="studio">Studio</SelectItem>
                         <SelectItem value="chain">Chain</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
                 <div className="space-y-1.5">
                   <Label className="text-[11.5px] font-semibold text-muted-foreground">
                     Owner email <span className="font-normal text-muted-foreground/70">(optional — can add later)</span>
                   </Label>
                   <Input value={newSalonOwnerEmail} onChange={(e) => setNewSalonOwnerEmail(e.target.value)} placeholder="owner@email.com" />
                 </div>
               </div>
               <ArtifactDialogFooter>
                 <Button variant="outline" onClick={() => setAddSalonDialogOpen(false)}>Cancel</Button>
                 <Button onClick={() => createSalonMutation.mutate()} disabled={createSalonMutation.isPending || !newSalonName.trim()}>
                   {createSalonMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                   Create salon
                 </Button>
               </ArtifactDialogFooter>
             </ArtifactDialogContent>
           </Dialog>
         </div>

         <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
           {[
             { label: "Active", value: activeCount, valueTone: undefined, description: "Subscription status is exactly \"active\": trialing salons aren't counted here." },
             { label: "Trialing", value: trialCount, valueTone: undefined, description: "Subscription status is \"trialing\"." },
             { label: "Past due", value: pastDueCount, valueTone: "text-destructive", description: "A charge failed, still active but at risk of losing access." },
             { label: "Open unlock requests", value: chainUnlockRequests.length, valueTone: "text-warning", description: "Chain-plan salons asking to exceed their default location cap, awaiting your approval." },
           ].map((metric) => (
             <div key={metric.label} className="backoffice-panel p-4">
               <div className="flex items-center gap-1">
                 <p className="text-[11.5px] font-semibold text-muted-foreground">{metric.label}</p>
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                   </TooltipTrigger>
                   <TooltipContent side="top" className="max-w-56 text-xs">
                     {metric.description}
                   </TooltipContent>
                 </Tooltip>
               </div>
               <p className={`mt-1 text-[22px] font-bold tabular-nums ${metric.valueTone || ""}`}>{metric.value.toLocaleString()}</p>
             </div>
           ))}
         </div>

         <Tabs defaultValue="all-tenants" className="space-y-4">
           <TabsList className="h-auto max-w-full justify-start gap-[22px] overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
             <TabsTrigger
               value="all-tenants"
               className="shrink-0 rounded-none border-b-2 border-transparent px-1 py-[9px] text-[13.5px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
             >
               All salons
             </TabsTrigger>
             <TabsTrigger
               value="unlock-requests"
               className="shrink-0 rounded-none border-b-2 border-transparent px-1 py-[9px] text-[13.5px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
             >
               Unlock requests
               {chainUnlockRequests.length > 0 && (
                 <Badge variant="warning" className="ml-1.5 rounded-full">{chainUnlockRequests.length}</Badge>
               )}
             </TabsTrigger>
           </TabsList>

           <TabsContent value="all-tenants" className="space-y-4">
             <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_190px]">
                   <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <Input
                       placeholder="Search by salon name, owner, or ID"
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="h-11 rounded-xl bg-background pl-9"
                     />
                   </div>
                   <Select value={planFilter} onValueChange={setPlanFilter}>
                     <SelectTrigger className="h-11 rounded-xl bg-background">
                       <SelectValue placeholder="All plans" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All plans</SelectItem>
                       {availablePlans.map((plan) => (
                         <SelectItem key={plan} value={plan}>{plan}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                   <Select value={statusFilter} onValueChange={setStatusFilter}>
                     <SelectTrigger className="h-11 rounded-xl bg-background">
                       <SelectValue placeholder="All statuses" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All statuses</SelectItem>
                       <SelectItem value="active">Active</SelectItem>
                       <SelectItem value="trialing">Trial</SelectItem>
                       <SelectItem value="past_due">Past due</SelectItem>
                       <SelectItem value="inactive">Inactive</SelectItem>
                       <SelectItem value="canceled">Canceled</SelectItem>
                     </SelectContent>
                   </Select>
             </div>
             <Card className="backoffice-panel overflow-hidden">
               <CardContent className="p-0">
                 {isLoading ? (
                   <div className="flex justify-center py-12">
                     <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                   </div>
                 ) : filteredTenants?.length === 0 ? (
                   <EmptyState
                     icon={Building2}
                     title="No tenants found"
                     description="Salons will appear here once they sign up or are added to the platform."
                   />
                 ) : (
                   <div className="overflow-x-auto">
                     <Table className="min-w-[1000px]">
                   <TableHeader>
                     <TableRow>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Salon</TableHead>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Owner</TableHead>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Country</TableHead>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Plan</TableHead>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Status</TableHead>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Staff</TableHead>
                       <TableHead className="h-auto px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-muted-foreground">Created</TableHead>
                       <TableHead className="h-auto w-[50px] px-4 py-2.5"></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {filteredTenants?.map((tenant) => (
                       <TableRow key={tenant.id}>
                         <TableCell className="px-4 py-3 text-[13px] font-medium">
                           <Link to={`/customers/tenants/${tenant.id}`} className="flex items-center gap-2.5">
                             {tenant.logo_url ? (
                               <img
                                 src={tenant.logo_url}
                                 alt=""
                                 className="h-7 w-7 rounded-[9px] object-cover"
                               />
                             ) : (
                               <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent/20 text-accent">
                                 <Building2 className="h-3.5 w-3.5" />
                               </div>
                             )}
                             <div>
                               <div className="font-semibold text-primary">{tenant.name}</div>
                               {tenant.slug && (
                                 <div className="text-xs text-muted-foreground">
                                   /{tenant.slug}
                                 </div>
                               )}
                             </div>
                           </Link>
                         </TableCell>
                         <TableCell className="px-4 py-3 text-[13px]">{tenant.owner_email || "-"}</TableCell>
                         <TableCell className="px-4 py-3 text-[13px]">{countryLabel(tenant.country)}</TableCell>
                         <TableCell className="px-4 py-3 text-[13px]">
                           <Badge variant="outline">
                             {tenant.plan || "No Plan"}
                           </Badge>
                         </TableCell>
                         <TableCell className="px-4 py-3 text-[13px]">{getStatusBadge(tenant.subscription_status)}</TableCell>
                         <TableCell className="px-4 py-3 text-[13px]">
                           <div className="flex items-center gap-1">
                             <Users className="h-3 w-3 text-muted-foreground" />
                             {tenant.staff_count}
                           </div>
                         </TableCell>
                         <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                           {format(new Date(tenant.created_at), "MMM d, yyyy")}
                         </TableCell>
                         <TableCell className="px-4 py-3 text-[13px]">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-8 w-8">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem asChild>
                                 <Link to={`/customers/tenants/${tenant.id}`}>
                                   <Eye className="mr-2 h-4 w-4" />
                                   View Details
                                 </Link>
                               </DropdownMenuItem>
                               {!tenant.owner_email && backofficeUser?.role === "super_admin" && (
                                 <DropdownMenuItem onClick={() => setAddOwnerTenant(tenant)}>
                                   <Crown className="mr-2 h-4 w-4" />
                                   Add owner
                                 </DropdownMenuItem>
                               )}
                               {backofficeUser?.role === "super_admin" &&
                                 tenant.subscription_status === "active" &&
                                 !tenant.next_billing_at && (
                                   <DropdownMenuItem onClick={() => setMigrateBillingTenant(tenant)}>
                                     <RefreshCcw className="mr-2 h-4 w-4" />
                                     Migrate to self-managed billing
                                   </DropdownMenuItem>
                               )}
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                     </Table>
                   </div>
                 )}
               </CardContent>
             </Card>
           </TabsContent>

           <TabsContent value="unlock-requests">
             <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
               <CardHeader>
                 <CardTitle>Pending Chain Unlock Requests</CardTitle>
                 <CardDescription>
                   Approve custom pricing for Chain tenants whose requested locations are not covered by configured market tiers.
                 </CardDescription>
               </CardHeader>
               <CardContent>
                 {loadingUnlockRequests ? (
                   <div className="flex justify-center py-8">
                     <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                   </div>
                 ) : chainUnlockRequests.length === 0 ? (
                   <p className="text-sm text-muted-foreground">No pending requests.</p>
                 ) : (
                   <div className="overflow-x-auto rounded-xl border">
                     <Table className="min-w-[760px]">
                       <TableHeader>
                         <TableRow>
                           <TableHead>Tenant</TableHead>
                           <TableHead>Requested</TableHead>
                           <TableHead>Active</TableHead>
                           <TableHead>Requested At</TableHead>
                           <TableHead className="w-[120px]">Action</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {chainUnlockRequests.map((request) => (
                           <TableRow key={request.id}>
                             <TableCell>{request.tenant?.name || request.tenant_id}</TableCell>
                             <TableCell>{request.requested_locations}</TableCell>
                             <TableCell>{request.allowed_locations}</TableCell>
                             <TableCell>{format(new Date(request.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                             <TableCell>
                               <Button
                                 size="sm"
                                 disabled={backofficeUser?.role !== "super_admin"}
                                 onClick={() => {
                                   setSelectedRequest(request);
                                   setAllowedLocations(Math.max(request.requested_locations, 1));
                                   setAmount("0");
                                   setCurrency("USD");
                                   setReason("Approving chain unlock request from Backoffice.");
                                   setApproveDialogOpen(true);
                                 }}
                               >
                                 Approve
                               </Button>
                             </TableCell>
                           </TableRow>
                         ))}
                       </TableBody>
                     </Table>
                   </div>
                 )}
               </CardContent>
             </Card>
           </TabsContent>
         </Tabs>
       </div>

       <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
         <ArtifactDialogContent>
           <ArtifactDialogHeader>
             <ArtifactDialogTitle>Approve location unlock</ArtifactDialogTitle>
           </ArtifactDialogHeader>
           <div className={cn(ARTIFACT_DIALOG_BODY_PADDING)}>
             <div className="flex items-center gap-2.5">
               <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-warning-bg text-[12px] font-bold text-warning">
                 {(selectedRequest?.tenant?.name || "?").charAt(0).toUpperCase()}
               </div>
               <div>
                 <div className="text-[13.5px] font-bold">{selectedRequest?.tenant?.name || "Tenant"}</div>
                 <div className="text-[11.5px] text-muted-foreground">
                   Currently capped at {selectedRequest?.allowed_locations ?? "—"} locations
                 </div>
               </div>
             </div>
             <div className="space-y-1.5">
               <Label className="text-[11.5px] font-semibold text-muted-foreground">Allowed locations</Label>
               <Input
                 type="number"
                 min={1}
                 value={allowedLocations}
                 onChange={(event) => setAllowedLocations(Number(event.target.value || 1))}
                 className="tabular-nums"
               />
             </div>
             <div className="space-y-1.5">
               <Label className="text-[11.5px] font-semibold text-muted-foreground">Pricing</Label>
               <div className="grid grid-cols-2 gap-3">
                 <Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="Currency" />
                 <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Custom amount" className="tabular-nums" />
               </div>
             </div>
             <div className="space-y-1.5">
               <Label className="text-[11.5px] font-semibold text-muted-foreground">
                 Note to salon <span className="font-normal text-muted-foreground/70">(optional)</span>
               </Label>
               <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Shown in their billing history" />
             </div>
           </div>
           <ArtifactDialogFooter>
             <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
               Cancel
             </Button>
             <Button
               onClick={() => approveUnlockMutation.mutate()}
               disabled={approveUnlockMutation.isPending || !selectedRequest}
             >
               {approveUnlockMutation.isPending ? "Approving..." : "Approve"}
             </Button>
           </ArtifactDialogFooter>
         </ArtifactDialogContent>
       </Dialog>

       <AddTenantOwnerDialog
         tenant={addOwnerTenant ? { id: addOwnerTenant.id, name: addOwnerTenant.name } : null}
         onOpenChange={(open) => !open && setAddOwnerTenant(null)}
         onSuccess={() => queryClient.invalidateQueries({ queryKey: ["backoffice-tenants"] })}
       />

       <MigrateTenantBillingDialog
         tenant={migrateBillingTenant ? { id: migrateBillingTenant.id, name: migrateBillingTenant.name } : null}
         onOpenChange={(open) => !open && setMigrateBillingTenant(null)}
         onSuccess={() => queryClient.invalidateQueries({ queryKey: ["backoffice-tenants"] })}
       />
     </BackofficeLayout>
   );
 }
