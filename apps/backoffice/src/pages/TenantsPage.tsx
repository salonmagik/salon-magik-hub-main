 import { useState } from "react";
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
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
 import { Loader2, MoreHorizontal, Search, Eye, Building2, Users, CircleDollarSign, TriangleAlert } from "lucide-react";
 import { format } from "date-fns";
import { toast } from "sonner";
import { EmptyState } from "@ui/empty-state";

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
   const [allowedLocations, setAllowedLocations] = useState(11);
   const [amount, setAmount] = useState("0");
   const [currency, setCurrency] = useState("USD");
   const [reason, setReason] = useState("");
   const [selectedTenant, setSelectedTenant] = useState<TenantWithStats | null>(null);

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
         p_allowed_locations: Math.max(11, Number(allowedLocations || 11)),
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
 
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "trialing":
        return <Badge variant="info">Trial</Badge>;
      case "past_due":
        return <Badge variant="warning">Past Due</Badge>;
      case "canceled":
        return <Badge variant="destructive">Canceled</Badge>;
      case "permanently_deactivated":
        return <Badge variant="neutral">Deactivated</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
 
   return (
     <BackofficeLayout>
       <div className="backoffice-page">
         <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
           <div>
             <h1 className="text-[22px] font-medium tracking-tight">Salons</h1>
             <p className="mt-1 text-muted-foreground">
               {(tenants || []).length.toLocaleString()} total · {activeCount.toLocaleString()} active ·{" "}
               {trialCount.toLocaleString()} trial · {pastDueCount.toLocaleString()} past due
             </p>
           </div>
         </div>

         <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
           {[
             { label: "Active salons", value: activeCount, icon: Building2, tone: "text-emerald-700 bg-emerald-50" },
             { label: "Trial accounts", value: trialCount, icon: Users, tone: "text-violet-700 bg-violet-50" },
             { label: "Past due accounts", value: pastDueCount, icon: TriangleAlert, tone: "text-red-700 bg-red-50" },
             { label: "Open unlock requests", value: chainUnlockRequests.length, icon: CircleDollarSign, tone: "text-amber-700 bg-amber-50" },
           ].map((metric) => (
             <Card key={metric.label} className="backoffice-panel">
               <CardContent className="flex items-start justify-between p-5">
                 <div>
                   <p className="text-sm uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                   <p className="mt-2 text-2xl font-medium">{metric.value.toLocaleString()}</p>
                 </div>
                 <div className={`rounded-xl p-3 ${metric.tone}`}>
                   <metric.icon className="h-5 w-5" />
                 </div>
               </CardContent>
             </Card>
           ))}
         </div>

         <Tabs defaultValue="all-tenants" className="space-y-4">
           <TabsList className="h-auto max-w-full justify-start overflow-x-auto rounded-full bg-muted/70 p-1">
             <TabsTrigger value="all-tenants" className="shrink-0 rounded-full px-5">All salons</TabsTrigger>
             <TabsTrigger value="unlock-requests" className="shrink-0 rounded-full px-5">
               Unlock requests
               {chainUnlockRequests.length > 0 && (
                 <Badge variant="warning" className="ml-2 rounded-full">{chainUnlockRequests.length}</Badge>
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
                       className="h-11 rounded-xl bg-white pl-9"
                     />
                   </div>
                   <Select value={planFilter} onValueChange={setPlanFilter}>
                     <SelectTrigger className="h-11 rounded-xl bg-white">
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
                     <SelectTrigger className="h-11 rounded-xl bg-white">
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
               <CardHeader className="border-b">
                 <CardTitle className="text-lg">Salon accounts</CardTitle>
                 <CardDescription>{filteredTenants?.length || 0} matching salons</CardDescription>
               </CardHeader>
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
                       <TableHead>Salon Name</TableHead>
                       <TableHead>Owner</TableHead>
                       <TableHead>Country</TableHead>
                       <TableHead>Plan</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Staff</TableHead>
                       <TableHead>Created</TableHead>
                       <TableHead className="w-[50px]"></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {filteredTenants?.map((tenant) => (
                       <TableRow key={tenant.id} className="h-20">
                         <TableCell className="font-medium">
                           <div className="flex items-center gap-2">
                             {tenant.logo_url ? (
                               <img 
                                 src={tenant.logo_url} 
                                 alt="" 
                                 className="h-8 w-8 rounded object-cover"
                               />
                             ) : (
                               <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                 <Building2 className="h-4 w-4 text-muted-foreground" />
                               </div>
                             )}
                             <div>
                               <div>{tenant.name}</div>
                               {tenant.slug && (
                                 <div className="text-xs text-muted-foreground">
                                   /{tenant.slug}
                                 </div>
                               )}
                             </div>
                           </div>
                         </TableCell>
                         <TableCell>{tenant.owner_email || "-"}</TableCell>
                         <TableCell>{tenant.country}</TableCell>
                         <TableCell>
                           <Badge variant="outline">
                             {tenant.plan || "No Plan"}
                           </Badge>
                         </TableCell>
                         <TableCell>{getStatusBadge(tenant.subscription_status)}</TableCell>
                         <TableCell>
                           <div className="flex items-center gap-1">
                             <Users className="h-3 w-3 text-muted-foreground" />
                             {tenant.staff_count}
                           </div>
                         </TableCell>
                         <TableCell className="text-muted-foreground text-sm">
                           {format(new Date(tenant.created_at), "MMM d, yyyy")}
                         </TableCell>
                         <TableCell>
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-8 w-8">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => setSelectedTenant(tenant)}>
                                 <Eye className="mr-2 h-4 w-4" />
                                 View Details
                               </DropdownMenuItem>
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
             <Card className="overflow-hidden rounded-2xl border bg-white shadow-sm">
               <CardHeader>
                 <CardTitle>Pending Chain Unlock Requests</CardTitle>
                 <CardDescription>Approve custom unlock for tenants requesting more than 10 stores.</CardDescription>
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
                                   setAllowedLocations(Math.max(request.requested_locations, 11));
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
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Approve Chain Unlock</DialogTitle>
             <DialogDescription>
               Set allowed locations and custom amount for {selectedRequest?.tenant?.name || "tenant"}.
             </DialogDescription>
           </DialogHeader>
           <div className="space-y-3">
             <div className="space-y-2">
               <Label>Allowed locations</Label>
               <Input
                 type="number"
                 min={11}
                 value={allowedLocations}
                 onChange={(event) => setAllowedLocations(Number(event.target.value || 11))}
               />
             </div>
             <div className="grid grid-cols-2 gap-3">
               <div className="space-y-2">
                 <Label>Currency</Label>
                 <Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} />
               </div>
               <div className="space-y-2">
                 <Label>Custom amount</Label>
                 <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
               </div>
             </div>
             <div className="space-y-2">
               <Label>Reason</Label>
               <Input value={reason} onChange={(event) => setReason(event.target.value)} />
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
               Cancel
             </Button>
             <Button
               onClick={() => approveUnlockMutation.mutate()}
               disabled={approveUnlockMutation.isPending || !selectedRequest}
             >
               {approveUnlockMutation.isPending ? "Approving..." : "Approve unlock"}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       <Dialog
         open={Boolean(selectedTenant)}
         onOpenChange={(open) => {
           if (!open) setSelectedTenant(null);
         }}
       >
         <DialogContent className="rounded-3xl sm:max-w-[640px]">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-3 text-2xl">
               <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-muted">
                 {selectedTenant?.logo_url ? (
                   <img
                     src={selectedTenant.logo_url}
                     alt=""
                     className="h-full w-full object-cover"
                   />
                 ) : (
                   <Building2 className="h-5 w-5 text-muted-foreground" />
                 )}
               </span>
               <span>{selectedTenant?.name || "Salon details"}</span>
             </DialogTitle>
             <DialogDescription>
               Account, subscription, and operating details for this salon.
             </DialogDescription>
           </DialogHeader>

           {selectedTenant && (
             <div className="space-y-4">
               <div className="flex flex-wrap items-center gap-2">
                 {getStatusBadge(selectedTenant.subscription_status)}
                 <Badge variant="outline">{selectedTenant.plan}</Badge>
                 <Badge variant="outline">
                   {selectedTenant.country} · {selectedTenant.currency}
                 </Badge>
               </div>

               <div className="grid gap-3 sm:grid-cols-2">
                 {[
                   { label: "Owner", value: selectedTenant.owner_email || "Not available" },
                   { label: "Team members", value: selectedTenant.staff_count.toLocaleString() },
                   {
                     label: "Created",
                     value: format(new Date(selectedTenant.created_at), "MMM d, yyyy 'at' h:mm a"),
                   },
                   {
                     label: "Online booking",
                     value: selectedTenant.online_booking_enabled ? "Enabled" : "Disabled",
                   },
                   {
                     label: "Payment setup",
                     value: selectedTenant.payment_setup_status.replaceAll("_", " "),
                   },
                   {
                     label: "Next billing",
                     value: selectedTenant.next_billing_at
                       ? format(new Date(selectedTenant.next_billing_at), "MMM d, yyyy")
                       : "Not scheduled",
                   },
                 ].map((item) => (
                   <div key={item.label} className="rounded-2xl border bg-muted/20 p-4">
                     <p className="text-xs uppercase tracking-wide text-muted-foreground">
                       {item.label}
                     </p>
                     <p className="mt-1.5 capitalize">{item.value}</p>
                   </div>
                 ))}
               </div>

               <div className="rounded-2xl border p-4">
                 <p className="text-xs uppercase tracking-wide text-muted-foreground">
                   Tenant ID
                 </p>
                 <p className="mt-1.5 break-all font-mono text-xs">
                   {selectedTenant.id}
                 </p>
               </div>
             </div>
           )}

           <DialogFooter>
             <Button variant="outline" onClick={() => setSelectedTenant(null)}>
               Close
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </BackofficeLayout>
   );
 }
