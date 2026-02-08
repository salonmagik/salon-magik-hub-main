 import { useState } from "react";
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth, useTenants } from "@/hooks";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
 import { Button } from "@ui/button";
 import { Input } from "@ui/input";
 import { Label } from "@ui/label";
 import { Badge } from "@ui/badge";
 import { Textarea } from "@ui/textarea";
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
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@ui/select";
 import { toast } from "sonner";
 import { Eye, Search, AlertTriangle, Clock } from "lucide-react";
 import type { Json } from "@/lib/supabase";
 import { format } from "date-fns";
 
 interface ImpersonationSession {
   id: string;
   backoffice_user_id: string;
   tenant_id: string;
   reason: string;
   started_at: string;
   ended_at: string | null;
 }
 
 export default function ImpersonationPage() {
   const queryClient = useQueryClient();
   const { backofficeUser } = useBackofficeAuth();
   const { data: tenants } = useTenants();
 
   const [searchQuery, setSearchQuery] = useState("");
   const [startDialogOpen, setStartDialogOpen] = useState(false);
   const [selectedTenantId, setSelectedTenantId] = useState<string>("");
   const [reason, setReason] = useState("");
   const [activeSession, setActiveSession] = useState<ImpersonationSession | null>(null);
 
   // Fetch impersonation sessions
   const { data: sessions } = useQuery({
     queryKey: ["impersonation-sessions"],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("impersonation_sessions")
         .select("*")
         .order("started_at", { ascending: false })
         .limit(50);
       if (error) throw error;
       return data as ImpersonationSession[];
     },
   });
 
   // Check for active session
   const currentActiveSession = sessions?.find(
     (s) =>
       s.backoffice_user_id === backofficeUser?.id &&
       s.ended_at === null
   );
 
   const startSessionMutation = useMutation({
     mutationFn: async ({ tenantId, reason }: { tenantId: string; reason: string }) => {
       const { data, error } = await supabase
         .from("impersonation_sessions")
         .insert({
           backoffice_user_id: backofficeUser!.id,
           tenant_id: tenantId,
           reason,
         })
         .select()
         .single();
       if (error) throw error;
       return data;
     },
     onSuccess: (data) => {
       queryClient.invalidateQueries({ queryKey: ["impersonation-sessions"] });
       setActiveSession(data);
       toast.success("Impersonation session started");
       setStartDialogOpen(false);
       setReason("");
       setSelectedTenantId("");
     },
     onError: (error) => {
       toast.error("Failed to start session: " + error.message);
     },
   });
 
   const endSessionMutation = useMutation({
     mutationFn: async (sessionId: string) => {
       const { error } = await supabase
         .from("impersonation_sessions")
         .update({ ended_at: new Date().toISOString() })
         .eq("id", sessionId);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["impersonation-sessions"] });
       setActiveSession(null);
       toast.success("Impersonation session ended");
     },
     onError: (error) => {
       toast.error("Failed to end session: " + error.message);
     },
   });
 
   const filteredTenants = tenants?.filter((t) =>
     t.name.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   const getTenantName = (tenantId: string) => {
     return tenants?.find((t) => t.id === tenantId)?.name || "Unknown";
   };
 
   const handleStartSession = () => {
     if (!selectedTenantId) {
       toast.error("Please select a tenant");
       return;
     }
     if (!reason.trim()) {
       toast.error("Please provide a reason");
       return;
     }
     startSessionMutation.mutate({ tenantId: selectedTenantId, reason });
   };
 
   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">Impersonation</h1>
           <p className="text-muted-foreground">
             View salons as their owners see them (read-only access)
           </p>
         </div>
 
         <Card className="border-amber-200 bg-amber-50/50">
           <CardContent className="py-4">
             <div className="flex items-start gap-3">
               <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
               <div className="text-sm text-amber-800">
                 <p className="font-medium">Read-Only Mode</p>
                 <p className="text-amber-700">
                   Impersonation provides view-only access. You cannot modify any data.
                   All sessions are logged and audited.
                 </p>
               </div>
             </div>
           </CardContent>
         </Card>
 
         {/* Active Session Banner */}
         {currentActiveSession && (
           <Card className="border-primary bg-primary/5">
             <CardContent className="py-4">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <Eye className="h-5 w-5 text-primary" />
                   <div>
                     <p className="font-medium">
                       Viewing: {getTenantName(currentActiveSession.tenant_id)}
                     </p>
                     <p className="text-sm text-muted-foreground">
                       Started {format(new Date(currentActiveSession.started_at), "MMM d, HH:mm")}
                     </p>
                   </div>
                 </div>
                 <Button
                   variant="outline"
                   onClick={() => endSessionMutation.mutate(currentActiveSession.id)}
                   disabled={endSessionMutation.isPending}
                 >
                   End Session
                 </Button>
               </div>
             </CardContent>
           </Card>
         )}
 
         {/* Start New Session */}
         {!currentActiveSession && (
           <Card>
             <CardHeader>
               <CardTitle>Start Impersonation</CardTitle>
               <CardDescription>
                 Select a salon to view their dashboard
               </CardDescription>
             </CardHeader>
             <CardContent>
               <div className="flex items-center gap-4">
                 <div className="relative flex-1">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                     placeholder="Search salons..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="pl-9"
                   />
                 </div>
                 <Button onClick={() => setStartDialogOpen(true)}>
                   <Eye className="mr-2 h-4 w-4" />
                   Start Session
                 </Button>
               </div>
 
               {searchQuery && filteredTenants && filteredTenants.length > 0 && (
                 <div className="mt-4 border rounded-lg divide-y max-h-60 overflow-auto">
                   {filteredTenants.slice(0, 10).map((tenant) => (
                     <div
                       key={tenant.id}
                       className="p-3 hover:bg-muted/50 cursor-pointer flex items-center justify-between"
                       onClick={() => {
                         setSelectedTenantId(tenant.id);
                         setStartDialogOpen(true);
                       }}
                     >
                       <div>
                        <p className="font-medium">{tenant.name}</p>
                         <p className="text-sm text-muted-foreground">
                           {tenant.staff_count} staff • {tenant.subscription_status}
                         </p>
                       </div>
                       <Button variant="ghost" size="sm">
                         <Eye className="h-4 w-4" />
                       </Button>
                     </div>
                   ))}
                 </div>
               )}
             </CardContent>
           </Card>
         )}
 
         {/* Session History */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Clock className="h-5 w-5" />
               Session History
             </CardTitle>
             <CardDescription>
               Recent impersonation sessions (last 50)
             </CardDescription>
           </CardHeader>
           <CardContent>
             {sessions?.length === 0 ? (
               <div className="text-center py-8 text-muted-foreground">
                 No impersonation sessions yet
               </div>
             ) : (
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Salon</TableHead>
                     <TableHead>Reason</TableHead>
                     <TableHead>Started</TableHead>
                     <TableHead>Ended</TableHead>
                     <TableHead>Status</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {sessions?.map((session) => (
                     <TableRow key={session.id}>
                       <TableCell className="font-medium">
                         {getTenantName(session.tenant_id)}
                       </TableCell>
                       <TableCell className="max-w-[200px] truncate">
                         {session.reason}
                       </TableCell>
                       <TableCell>
                         {format(new Date(session.started_at), "MMM d, HH:mm")}
                       </TableCell>
                       <TableCell>
                         {session.ended_at
                           ? format(new Date(session.ended_at), "MMM d, HH:mm")
                           : "-"}
                       </TableCell>
                       <TableCell>
                         {session.ended_at ? (
                           <Badge variant="secondary">Ended</Badge>
                         ) : (
                           <Badge variant="default">Active</Badge>
                         )}
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             )}
           </CardContent>
         </Card>
 
         {/* Start Session Dialog */}
         <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>Start Impersonation Session</DialogTitle>
               <DialogDescription>
                 A reason is required for audit purposes.
               </DialogDescription>
             </DialogHeader>
             <div className="space-y-4 py-4">
               <div>
                 <Label>Select Salon</Label>
                 <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                   <SelectTrigger className="mt-1">
                     <SelectValue placeholder="Choose a salon..." />
                   </SelectTrigger>
                   <SelectContent>
                     {tenants?.map((tenant) => (
                       <SelectItem key={tenant.id} value={tenant.id}>
                         {tenant.name}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
               <div>
                 <Label>Reason for access</Label>
                 <Textarea
                   value={reason}
                   onChange={(e) => setReason(e.target.value)}
                   placeholder="e.g., Customer support ticket #12345..."
                   className="mt-1"
                 />
               </div>
             </div>
             <DialogFooter>
               <Button variant="outline" onClick={() => setStartDialogOpen(false)}>
                 Cancel
               </Button>
               <Button
                 onClick={handleStartSession}
                 disabled={startSessionMutation.isPending}
               >
                 Start Session
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
       </div>
     </BackofficeLayout>
   );
 }
