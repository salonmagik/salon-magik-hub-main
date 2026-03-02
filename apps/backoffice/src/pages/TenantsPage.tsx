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
 import { Loader2, MoreHorizontal, Search, Eye, Building2, Users } from "lucide-react";
 import { format } from "date-fns";
import { toast } from "sonner";

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
   const [approveDialogOpen, setApproveDialogOpen] = useState(false);
   const [selectedRequest, setSelectedRequest] = useState<ChainUnlockRequestRow | null>(null);
   const [allowedLocations, setAllowedLocations] = useState(11);
   const [amount, setAmount] = useState("0");
   const [currency, setCurrency] = useState("USD");
   const [reason, setReason] = useState("");

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
 
   const filteredTenants = tenants?.filter((t) =>
     t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.owner_email?.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>;
      case "trialing":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Trial</Badge>;
      case "past_due":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Past Due</Badge>;
      case "canceled":
        return <Badge className="bg-red-100 text-red-700 border-red-200">Canceled</Badge>;
      case "permanently_deactivated":
        return <Badge className="bg-zinc-100 text-zinc-500 border-zinc-200">Deactivated</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
 
   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">Customer Tenants</h1>
           <p className="text-muted-foreground">
             View and manage all salons on the platform
           </p>
         </div>

         <Tabs defaultValue="all-tenants">
           <TabsList>
             <TabsTrigger value="all-tenants">All Tenants</TabsTrigger>
             <TabsTrigger value="unlock-requests">Unlock Requests</TabsTrigger>
           </TabsList>

           <TabsContent value="all-tenants" className="mt-4">
             <Card>
               <CardHeader>
                 <div className="flex items-center justify-between">
                   <div>
                     <CardTitle className="flex items-center gap-2">
                       <Building2 className="h-5 w-5" />
                       All Tenants
                     </CardTitle>
                     <CardDescription>
                       {filteredTenants?.length || 0} salons
                     </CardDescription>
                   </div>
                   <div className="relative w-64">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <Input
                       placeholder="Search by name or owner..."
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="pl-9"
                     />
                   </div>
                 </div>
               </CardHeader>
               <CardContent>
                 {isLoading ? (
                   <div className="flex justify-center py-12">
                     <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                   </div>
                 ) : filteredTenants?.length === 0 ? (
                   <div className="text-center py-12 text-muted-foreground">
                     No tenants found.
                   </div>
                 ) : (
                   <div className="rounded-md border">
                     <Table>
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
                       <TableRow key={tenant.id}>
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
                               <DropdownMenuItem disabled>
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

           <TabsContent value="unlock-requests" className="mt-4">
             <Card>
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
                   <div className="rounded-md border">
                     <Table>
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
     </BackofficeLayout>
   );
 }
