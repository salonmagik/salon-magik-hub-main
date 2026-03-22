import { useState } from "react";
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
import { Loader2, MoreHorizontal, Check, X, Mail, Clock, Users, Globe } from "lucide-react";
import { format } from "date-fns";

export default function WaitlistPage() {
  const [applicationsTab, setApplicationsTab] = useState<WaitlistStatus | "all">("pending");
  const [activeMainTab, setActiveMainTab] = useState<"applications" | "interest">("applications");
  const [interestStatusFilter, setInterestStatusFilter] = useState<MarketInterestStatus | "all">("all");
  const { data: leads, isLoading } = useWaitlist(applicationsTab === "all" ? undefined : applicationsTab);
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
          <h1 className="text-2xl font-bold tracking-tight">Customer Waitlists</h1>
          <p className="text-muted-foreground">Review applications and other-country interest submissions</p>
        </div>

        <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as "applications" | "interest")}> 
          <TabsList>
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="interest">Other Countries Interest</TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Applications</CardTitle>
                <CardDescription>
                  {leads?.length || 0} {applicationsTab === "all" ? "total" : applicationsTab} leads
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={applicationsTab} onValueChange={(v) => setApplicationsTab(v as WaitlistStatus | "all")}> 
                  <TabsList>
                    <TabsTrigger value="pending" className="gap-2"><Clock className="h-4 w-4" />Pending</TabsTrigger>
                    <TabsTrigger value="invited" className="gap-2"><Mail className="h-4 w-4" />Invited</TabsTrigger>
                    <TabsTrigger value="converted" className="gap-2"><Check className="h-4 w-4" />Converted</TabsTrigger>
                    <TabsTrigger value="rejected" className="gap-2"><X className="h-4 w-4" />Rejected</TabsTrigger>
                    <TabsTrigger value="all" className="gap-2"><Users className="h-4 w-4" />All</TabsTrigger>
                  </TabsList>

                  <TabsContent value={applicationsTab} className="mt-4">
                    {isLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : leads?.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">No leads found.</div>
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
                              <TableHead className="w-[50px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leads.map((lead) => (
                              <TableRow key={lead.id}>
                                <TableCell className="font-medium text-muted-foreground">{lead.position || "-"}</TableCell>
                                <TableCell className="font-medium">{lead.name}</TableCell>
                                <TableCell>{lead.email}</TableCell>
                                <TableCell>{lead.country}</TableCell>
                                <TableCell>{getPlanBadge(lead.plan_interest)}</TableCell>
                                <TableCell>{lead.team_size || "-"}</TableCell>
                                <TableCell>{getStatusBadge(lead.status)}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">{format(new Date(lead.created_at), "MMM d, yyyy")}</TableCell>
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
                                          <Check className="mr-2 h-4 w-4" />Approve
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setSelectedLead(lead);
                                            setShowRejectDialog(true);
                                          }}
                                          className="text-red-600"
                                        >
                                          <X className="mr-2 h-4 w-4" />Reject
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                  {lead.status === "invited" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      onClick={() => {
                                        setSelectedLead(lead);
                                        setShowResendDialog(true);
                                      }}
                                    >
                                      Resend
                                    </Button>
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
          </TabsContent>

          <TabsContent value="interest" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Other Countries Interest</CardTitle>
                <CardDescription>Track market expansion requests from countries outside GH/NG.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={interestStatusFilter} onValueChange={(v) => setInterestStatusFilter(v as MarketInterestStatus | "all")}> 
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="new">New</TabsTrigger>
                    <TabsTrigger value="reviewing">Reviewing</TabsTrigger>
                    <TabsTrigger value="contacted">Contacted</TabsTrigger>
                    <TabsTrigger value="qualified">Qualified</TabsTrigger>
                    <TabsTrigger value="closed">Closed</TabsTrigger>
                  </TabsList>

                  <TabsContent value={interestStatusFilter} className="mt-4">
                    {isMarketInterestLoading ? (
                      <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : marketInterestLeads?.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">No interest leads found.</div>
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Country</TableHead>
                              <TableHead>City</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Submitted</TableHead>
                              <TableHead className="w-[50px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {marketInterestLeads?.map((lead) => (
                              <TableRow key={lead.id}>
                                <TableCell className="font-medium">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "-"}</TableCell>
                                <TableCell>{lead.email}</TableCell>
                                <TableCell>{lead.country}</TableCell>
                                <TableCell>{lead.city || "-"}</TableCell>
                                <TableCell>{lead.source || "-"}</TableCell>
                                <TableCell>{getMarketInterestStatusBadge(lead.status)}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">{format(new Date(lead.created_at), "MMM d, yyyy")}</TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {(["new", "reviewing", "contacted", "qualified", "closed"] as const).map((status) => (
                                        <DropdownMenuItem
                                          key={`${lead.id}-${status}`}
                                          onClick={() => updateMarketInterestStatus.mutate({ id: lead.id, status })}
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
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve application?</AlertDialogTitle>
              <AlertDialogDescription>
                This will invite {selectedLead?.email} to create their account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleApprove} disabled={approveLead.isPending}>Approve & Invite</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject application?</AlertDialogTitle>
              <AlertDialogDescription>
                Add an optional reason for rejection.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Optional internal note"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReject}
                className="bg-red-600 hover:bg-red-700"
                disabled={rejectLead.isPending}
              >
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showResendDialog} onOpenChange={setShowResendDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resend invite?</AlertDialogTitle>
              <AlertDialogDescription>
                This will resend the invitation email to {selectedLead?.email}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResend} disabled={resendInvite.isPending}>Resend Invite</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </BackofficeLayout>
  );
}
