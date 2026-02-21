import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import {
  useMarketInterest,
  useMarketInterestActions,
  useWaitlist,
  useWaitlistActions,
  WaitlistLead,
  WaitlistStatus,
  type MarketInterestStatus,
} from "@/hooks";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
 import { Button } from "@ui/button";
 import { Badge } from "@ui/badge";
 import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
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
import { Textarea } from "@ui/textarea";
import { Label } from "@ui/label";
import { supabase } from "@/lib/supabase";
 import { Loader2, MoreHorizontal, Check, X, Mail, Clock, Users, RefreshCw, Globe } from "lucide-react";
 import { format } from "date-fns";

type OpsView = "imports" | "assistance" | "reactivation";
 
 export default function WaitlistPage() {
   const [activeTab, setActiveTab] = useState<WaitlistStatus | "all">("pending");
   const [interestStatusFilter, setInterestStatusFilter] = useState<MarketInterestStatus | "all">("all");
   const { data: leads, isLoading } = useWaitlist(activeTab === "all" ? undefined : activeTab);
   const { data: marketInterestLeads, isLoading: isMarketInterestLoading } = useMarketInterest({
     status: interestStatusFilter,
   });
   const { approveLead, rejectLead, resendInvite } = useWaitlistActions();
   const { updateStatus: updateMarketInterestStatus } = useMarketInterestActions();
 
   const [selectedLead, setSelectedLead] = useState<WaitlistLead | null>(null);
   const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
   const [showResendDialog, setShowResendDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [opsView, setOpsView] = useState<OpsView>("imports");

  const { data: importJobs = [], isLoading: isImportJobsLoading } = useQuery({
    queryKey: ["ops-catalog-import-jobs"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("catalog_import_jobs" as any)
        .select("id, tenant_id, import_type, status, created_at, finished_at, summary_json")
        .order("created_at", { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: assistanceRequests = [], isLoading: isAssistanceLoading } = useQuery({
    queryKey: ["ops-setup-assistance-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("setup_assistance_requests" as any)
        .select("id, tenant_id, request_type, status, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reactivationCampaigns = [], isLoading: isReactivationLoading } = useQuery({
    queryKey: ["ops-reactivation-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("customer_reactivation_campaigns" as any)
        .select("id, tenant_id, channel, status, name, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(50) as any);
      if (error) throw error;
      return data || [];
    },
  });
 
   const handleApprove = () => {
     if (!selectedLead) return;
     approveLead.mutate(selectedLead.id);
     setShowApproveDialog(false);
     setSelectedLead(null);
   };
 
  const handleReject = () => {
    if (!selectedLead) return;
    rejectLead.mutate({ leadId: selectedLead.id, reason: rejectReason || undefined });
    setShowRejectDialog(false);
    setSelectedLead(null);
    setRejectReason("");
  };

  const handleResend = () => {
    if (!selectedLead) return;
    resendInvite.mutate(selectedLead.id);
    setShowResendDialog(false);
    setSelectedLead(null);
  };
 
   const getStatusBadge = (status: WaitlistStatus) => {
     switch (status) {
       case "pending":
         return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
       case "invited":
         return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Invited</Badge>;
       case "rejected":
         return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
       case "converted":
         return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Converted</Badge>;
       default:
         return <Badge variant="secondary">{status}</Badge>;
     }
   };
 
   const getPlanBadge = (plan: string | null) => {
     if (!plan) return null;
     const colors: Record<string, string> = {
       solo: "bg-gray-100 text-gray-700",
       studio: "bg-purple-100 text-purple-700",
       chain: "bg-indigo-100 text-indigo-700",
     };
     return (
       <Badge variant="secondary" className={colors[plan] || ""}>
         {plan.charAt(0).toUpperCase() + plan.slice(1)}
       </Badge>
     );
   };

   const getMarketInterestStatusBadge = (status: MarketInterestStatus) => {
     const styles: Record<MarketInterestStatus, string> = {
       new: "bg-blue-50 text-blue-700 border-blue-200",
       reviewing: "bg-amber-50 text-amber-700 border-amber-200",
       contacted: "bg-violet-50 text-violet-700 border-violet-200",
       qualified: "bg-emerald-50 text-emerald-700 border-emerald-200",
       closed: "bg-slate-100 text-slate-700 border-slate-200",
     };

     return (
       <Badge variant="outline" className={styles[status]}>
         {status.charAt(0).toUpperCase() + status.slice(1)}
       </Badge>
     );
   };
 
   return (
     <BackofficeLayout>
       <div className="p-6 space-y-6">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">Waitlist</h1>
           <p className="text-muted-foreground">
             Review and manage waitlist applications
           </p>
         </div>
 
         <Card>
           <CardHeader>
             <div className="flex items-center justify-between">
               <div>
                 <CardTitle>Applications</CardTitle>
                 <CardDescription>
                   {leads?.length || 0} {activeTab === "all" ? "total" : activeTab} leads
                 </CardDescription>
               </div>
             </div>
           </CardHeader>
           <CardContent>
             <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WaitlistStatus | "all")}>
               <TabsList>
                 <TabsTrigger value="pending" className="gap-2">
                   <Clock className="h-4 w-4" />
                   Pending
                 </TabsTrigger>
                 <TabsTrigger value="invited" className="gap-2">
                   <Mail className="h-4 w-4" />
                   Invited
                 </TabsTrigger>
                 <TabsTrigger value="converted" className="gap-2">
                   <Check className="h-4 w-4" />
                   Converted
                 </TabsTrigger>
                 <TabsTrigger value="rejected" className="gap-2">
                   <X className="h-4 w-4" />
                   Rejected
                 </TabsTrigger>
                 <TabsTrigger value="all" className="gap-2">
                   <Users className="h-4 w-4" />
                   All
                 </TabsTrigger>
               </TabsList>
 
               <TabsContent value={activeTab} className="mt-4">
                 {isLoading ? (
                   <div className="flex justify-center py-12">
                     <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                   </div>
                 ) : leads?.length === 0 ? (
                   <div className="text-center py-12 text-muted-foreground">
                     No {activeTab === "all" ? "" : activeTab} leads found.
                   </div>
                 ) : (
                   <div className="rounded-md border">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead className="w-[50px]">#</TableHead>
                           <TableHead>Name</TableHead>
                           <TableHead>Email</TableHead>
                           <TableHead>Country</TableHead>
                           <TableHead>Plan</TableHead>
                           <TableHead>Team Size</TableHead>
                           <TableHead>Status</TableHead>
                           <TableHead>Applied</TableHead>
                           <TableHead className="w-[50px]"></TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {leads?.map((lead) => (
                           <TableRow key={lead.id}>
                             <TableCell className="font-medium text-muted-foreground">
                               {lead.position || "-"}
                             </TableCell>
                             <TableCell className="font-medium">{lead.name}</TableCell>
                             <TableCell>{lead.email}</TableCell>
                             <TableCell>{lead.country}</TableCell>
                             <TableCell>{getPlanBadge(lead.plan_interest)}</TableCell>
                             <TableCell>{lead.team_size || "-"}</TableCell>
                             <TableCell>{getStatusBadge(lead.status)}</TableCell>
                             <TableCell className="text-muted-foreground text-sm">
                               {format(new Date(lead.created_at), "MMM d, yyyy")}
                             </TableCell>
                              <TableCell>
                                {lead.status === "pending" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedLead(lead);
                                          setShowApproveDialog(true);
                                        }}
                                        className="text-emerald-600"
                                      >
                                        <Check className="mr-2 h-4 w-4" />
                                        Approve
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedLead(lead);
                                          setShowRejectDialog(true);
                                        }}
                                        className="text-destructive"
                                      >
                                        <X className="mr-2 h-4 w-4" />
                                        Reject
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                {lead.status === "invited" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedLead(lead);
                                          setShowResendDialog(true);
                                        }}
                                      >
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Resend Invite
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </TableCell>
                           </TableRow>
                         ))}
                       </TableBody>
                     </Table>
                   </div>
                 )}
               </TabsContent>
             </Tabs>
           </CardContent>
         </Card>

         <Card>
           <CardHeader>
             <div className="flex items-center justify-between">
               <div>
                 <CardTitle className="flex items-center gap-2">
                   <Globe className="h-4 w-4" />
                   Other Countries Interest
                 </CardTitle>
                 <CardDescription>
                   {marketInterestLeads?.length || 0} interest leads
                 </CardDescription>
               </div>
               <Tabs value={interestStatusFilter} onValueChange={(value) => setInterestStatusFilter(value as MarketInterestStatus | "all")}>
                 <TabsList>
                   <TabsTrigger value="all">All</TabsTrigger>
                   <TabsTrigger value="new">New</TabsTrigger>
                   <TabsTrigger value="reviewing">Reviewing</TabsTrigger>
                   <TabsTrigger value="contacted">Contacted</TabsTrigger>
                   <TabsTrigger value="qualified">Qualified</TabsTrigger>
                   <TabsTrigger value="closed">Closed</TabsTrigger>
                 </TabsList>
               </Tabs>
             </div>
           </CardHeader>
           <CardContent>
             {isMarketInterestLoading ? (
               <div className="flex justify-center py-10">
                 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
               </div>
             ) : !marketInterestLeads?.length ? (
               <p className="py-10 text-center text-muted-foreground">
                 No interest leads found for this filter.
               </p>
             ) : (
               <div className="rounded-md border">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Name</TableHead>
                       <TableHead>Email</TableHead>
                       <TableHead>Phone</TableHead>
                       <TableHead>Country</TableHead>
                       <TableHead>Salon</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Source</TableHead>
                       <TableHead>Submitted</TableHead>
                       <TableHead className="w-[50px]"></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {marketInterestLeads.map((lead) => (
                       <TableRow key={lead.id}>
                         <TableCell className="font-medium">
                           {lead.first_name} {lead.last_name}
                         </TableCell>
                         <TableCell>{lead.email}</TableCell>
                         <TableCell>{lead.phone_e164}</TableCell>
                         <TableCell>{lead.country}</TableCell>
                         <TableCell>{lead.salon_name}</TableCell>
                         <TableCell>{getMarketInterestStatusBadge(lead.status)}</TableCell>
                         <TableCell>{lead.source}</TableCell>
                         <TableCell className="text-muted-foreground text-sm">
                           {format(new Date(lead.created_at), "MMM d, yyyy")}
                         </TableCell>
                         <TableCell>
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button variant="ghost" size="icon" className="h-8 w-8">
                                 <MoreHorizontal className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end">
                               {(["new", "reviewing", "contacted", "qualified", "closed"] as MarketInterestStatus[]).map((status) => (
                                 <DropdownMenuItem
                                   key={status}
                                   disabled={lead.status === status || updateMarketInterestStatus.isPending}
                                   onClick={() =>
                                     updateMarketInterestStatus.mutate({
                                       leadId: lead.id,
                                       status,
                                     })
                                   }
                                 >
                                   Mark as {status}
                                 </DropdownMenuItem>
                               ))}
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

         <Card>
           <CardHeader>
             <CardTitle>Operations Monitoring</CardTitle>
             <CardDescription>
               Track import jobs, setup assistance requests, and reactivation campaign execution.
             </CardDescription>
           </CardHeader>
           <CardContent>
             <Tabs value={opsView} onValueChange={(value) => setOpsView(value as OpsView)}>
               <TabsList>
                 <TabsTrigger value="imports">Imports</TabsTrigger>
                 <TabsTrigger value="assistance">Assistance</TabsTrigger>
                 <TabsTrigger value="reactivation">Reactivation</TabsTrigger>
               </TabsList>
               <TabsContent value="imports" className="mt-4">
                 {isImportJobsLoading ? (
                   <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                 ) : (
                   <div className="rounded-md border">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Tenant</TableHead>
                           <TableHead>Type</TableHead>
                           <TableHead>Status</TableHead>
                           <TableHead>Created</TableHead>
                           <TableHead>Finished</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {importJobs.map((job: any) => (
                           <TableRow key={job.id}>
                             <TableCell>{job.tenant_id}</TableCell>
                             <TableCell className="capitalize">{job.import_type}</TableCell>
                             <TableCell><Badge variant="outline">{job.status}</Badge></TableCell>
                             <TableCell>{format(new Date(job.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                             <TableCell>{job.finished_at ? format(new Date(job.finished_at), "MMM d, yyyy HH:mm") : "—"}</TableCell>
                           </TableRow>
                         ))}
                         {importJobs.length === 0 && (
                           <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No import jobs yet.</TableCell></TableRow>
                         )}
                       </TableBody>
                     </Table>
                   </div>
                 )}
               </TabsContent>
               <TabsContent value="assistance" className="mt-4">
                 {isAssistanceLoading ? (
                   <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                 ) : (
                   <div className="rounded-md border">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Tenant</TableHead>
                           <TableHead>Type</TableHead>
                           <TableHead>Status</TableHead>
                           <TableHead>Notes</TableHead>
                           <TableHead>Created</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {assistanceRequests.map((request: any) => (
                           <TableRow key={request.id}>
                             <TableCell>{request.tenant_id}</TableCell>
                             <TableCell>{request.request_type}</TableCell>
                             <TableCell><Badge variant="outline">{request.status}</Badge></TableCell>
                             <TableCell className="max-w-[300px] truncate">{request.notes || "—"}</TableCell>
                             <TableCell>{format(new Date(request.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                           </TableRow>
                         ))}
                         {assistanceRequests.length === 0 && (
                           <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No assistance requests yet.</TableCell></TableRow>
                         )}
                       </TableBody>
                     </Table>
                   </div>
                 )}
               </TabsContent>
               <TabsContent value="reactivation" className="mt-4">
                 {isReactivationLoading ? (
                   <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                 ) : (
                   <div className="rounded-md border">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Name</TableHead>
                           <TableHead>Tenant</TableHead>
                           <TableHead>Channel</TableHead>
                           <TableHead>Status</TableHead>
                           <TableHead>Created</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {reactivationCampaigns.map((campaign: any) => (
                           <TableRow key={campaign.id}>
                             <TableCell className="font-medium">{campaign.name}</TableCell>
                             <TableCell>{campaign.tenant_id}</TableCell>
                             <TableCell className="capitalize">{campaign.channel}</TableCell>
                             <TableCell><Badge variant="outline">{campaign.status}</Badge></TableCell>
                             <TableCell>{format(new Date(campaign.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                           </TableRow>
                         ))}
                         {reactivationCampaigns.length === 0 && (
                           <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No campaigns yet.</TableCell></TableRow>
                         )}
                       </TableBody>
                     </Table>
                   </div>
                 )}
               </TabsContent>
             </Tabs>
           </CardContent>
         </Card>
       </div>
 
       {/* Approve Dialog */}
       <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Approve Application</AlertDialogTitle>
             <AlertDialogDescription>
               This will send an invitation email to <strong>{selectedLead?.email}</strong> with a 7-day valid link to complete signup.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel onClick={() => setSelectedLead(null)}>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleApprove} disabled={approveLead.isPending}>
               {approveLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               Approve & Send Invite
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
 
       {/* Reject Dialog */}
       <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Reject Application</AlertDialogTitle>
             <AlertDialogDescription>
               This will reject the application from <strong>{selectedLead?.email}</strong>. No notification will be sent.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <div className="py-4">
             <Label htmlFor="reason">Reason (optional, internal only)</Label>
             <Textarea
               id="reason"
               placeholder="e.g., Duplicate application, Invalid business..."
               value={rejectReason}
               onChange={(e) => setRejectReason(e.target.value)}
               className="mt-2"
             />
           </div>
           <AlertDialogFooter>
             <AlertDialogCancel onClick={() => {
               setSelectedLead(null);
               setRejectReason("");
             }}>
               Cancel
             </AlertDialogCancel>
             <AlertDialogAction 
               onClick={handleReject} 
               disabled={rejectLead.isPending}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               {rejectLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               Reject
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
        </AlertDialog>

        {/* Resend Invite Dialog */}
        <AlertDialog open={showResendDialog} onOpenChange={setShowResendDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resend Invitation</AlertDialogTitle>
              <AlertDialogDescription>
                This will send a new invitation email to <strong>{selectedLead?.email}</strong> with a fresh 7-day valid link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedLead(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResend} disabled={resendInvite.isPending}>
                {resendInvite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resend Invitation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </BackofficeLayout>
    );
  }
