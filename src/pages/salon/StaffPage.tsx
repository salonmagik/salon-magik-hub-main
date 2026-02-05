import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Users, Shield, Mail, MoreHorizontal, Clock, X, RefreshCw, Lock, AlertTriangle } from "lucide-react";
import { InviteStaffDialog } from "@/components/dialogs/InviteStaffDialog";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { useStaff, type StaffMember } from "@/hooks/useStaff";
import { useStaffInvitations } from "@/hooks/useStaffInvitations";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PermissionsTab } from "@/components/staff/PermissionsTab";

const roleLabels: Record<StaffMember["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

const roleVariants: Record<StaffMember["role"], "default" | "secondary" | "outline"> = {
  owner: "default",
  manager: "secondary",
  supervisor: "secondary",
  receptionist: "outline",
  staff: "outline",
};

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function StaffPage() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);
  const { staff, isLoading, refetch } = useStaff();
  const {
    invitations,
    isLoading: invitationsLoading,
    refetch: refetchInvitations,
    cancelInvitation,
    resendInvitation,
    canResend,
  } = useStaffInvitations();
  const { user } = useAuth();

  const currentUserIsOwner = staff.some(
    (s) => s.userId === user?.id && s.role === "owner"
  );

  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  const handleCancelClick = (id: string) => {
    setSelectedInvitationId(id);
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (selectedInvitationId) {
      await cancelInvitation(selectedInvitationId);
      setSelectedInvitationId(null);
    }
  };

  const handleResend = async (id: string) => {
    await resendInvitation(id);
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Staff</h1>
            <p className="text-muted-foreground">
              Manage your team members and their permissions
            </p>
          </div>
          <Button onClick={() => setInviteDialogOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Invite Staff</span>
            <span className="sm:hidden">Invite</span>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : staff.length}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Owners
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : staff.filter((s) => s.role === "owner").length}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Invites
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning-foreground" />
                <span className="text-2xl font-bold">
                  {invitationsLoading ? "..." : pendingInvitations.length}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {isLoading
                  ? "..."
                  : staff.filter((s) => !["owner", "manager"].includes(s.role)).length}
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Staff, Invitations, and Permissions */}
        <Tabs defaultValue="team">
          <TabsList>
            <TabsTrigger value="team">Team Members</TabsTrigger>
            <TabsTrigger value="invitations" className="flex items-center gap-2">
              Pending Invitations
              {pendingInvitations.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {pendingInvitations.length}
                </Badge>
              )}
            </TabsTrigger>
            {currentUserIsOwner && (
              <TabsTrigger value="permissions" className="flex items-center gap-2">
                <Lock className="w-3 h-3" />
                Permissions
              </TabsTrigger>
            )}
          </TabsList>

          {/* Team Members Tab */}
          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-[200px]" />
                          <Skeleton className="h-3 w-[150px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : staff.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-1">No team members yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Invite staff members to help manage your salon
                    </p>
                    <Button onClick={() => setInviteDialogOpen(true)} className="gap-2">
                      <UserPlus className="w-4 h-4" />
                      Invite Staff
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staff.map((member) => (
                          <TableRow key={member.userId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-9 h-9">
                                  <AvatarImage src={member.profile?.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {getInitials(member.profile?.full_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    {member.profile?.full_name || "Unknown"}
                                  </p>
                                  <p className="text-xs text-muted-foreground sm:hidden truncate">
                                    {member.profile?.phone || "No phone"}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate text-sm">—</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={roleVariants[member.role]}>
                                {roleLabels[member.role]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {currentUserIsOwner && member.role !== "owner" && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>Change Role</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive">
                                      Remove from Team
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Invitations Tab */}
          <TabsContent value="invitations">
            <Card>
              <CardHeader>
                <CardTitle>Pending Invitations</CardTitle>
              </CardHeader>
              <CardContent>
                {invitationsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-[200px]" />
                          <Skeleton className="h-3 w-[150px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : pendingInvitations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Mail className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-1">No pending invitations</h3>
                    <p className="text-sm text-muted-foreground">
                      All invitations have been accepted or expired
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingInvitations.map((invitation) => {
                      const isExpired = new Date(invitation.expires_at) < new Date();
                      const resendStatus = canResend(invitation);

                      return (
                        <div
                          key={invitation.id}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            isExpired ? "bg-destructive/5 border-destructive/20" : "bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isExpired ? "bg-destructive/10" : "bg-primary/10"
                            }`}>
                              {isExpired ? (
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                              ) : (
                                <Mail className="w-5 h-5 text-primary" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">
                                {invitation.first_name} {invitation.last_name}
                              </p>
                              <p className="text-sm text-muted-foreground">{invitation.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {roleLabels[invitation.role]}
                                </Badge>
                                {isExpired ? (
                                  <Badge variant="destructive" className="text-xs">
                                    Expired
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Expires {format(new Date(invitation.expires_at), "MMM d, yyyy")}
                                  </span>
                                )}
                                {invitation.resend_count > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    Resent {invitation.resend_count}×
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => handleResend(invitation.id)}
                              disabled={!resendStatus.allowed}
                              title={
                                resendStatus.allowed
                                  ? "Resend invitation"
                                  : `Wait ${resendStatus.minutesRemaining} min`
                              }
                            >
                              <RefreshCw className="w-3 h-3" />
                              {resendStatus.allowed ? "Resend" : `${resendStatus.minutesRemaining}m`}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive gap-1"
                              onClick={() => handleCancelClick(invitation.id)}
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permissions Tab - Owner Only */}
          {currentUserIsOwner && (
            <TabsContent value="permissions">
              <PermissionsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <InviteStaffDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={() => {
          refetch();
          refetchInvitations();
        }}
      />

      <ConfirmActionDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel Invitation"
        description="Are you sure you want to cancel this invitation? The recipient will no longer be able to join your team with this link."
        confirmLabel="Cancel Invitation"
        variant="destructive"
        onConfirm={handleConfirmCancel}
      />
    </SalonSidebar>
  );
}
