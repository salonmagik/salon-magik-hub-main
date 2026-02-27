import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Checkbox } from "@ui/checkbox";
import { Input } from "@ui/input";
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
  UserPlus, Users, Shield, Mail, MoreHorizontal, Clock, X, RefreshCw, Lock, AlertTriangle,
  User, History, XCircle, CheckCircle, Copy, Building2, Pencil
} from "lucide-react";
import { InviteStaffDialog } from "@/components/dialogs/InviteStaffDialog";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { StaffDetailDialog } from "@/components/dialogs/StaffDetailDialog";
import { useStaff, type StaffMember } from "@/hooks/useStaff";
import { useStaffInvitations } from "@/hooks/useStaffInvitations";
import { useAuth } from "@/hooks/useAuth";
import { MODULE_LABELS } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { PermissionsTab } from "@/components/staff/PermissionsTab";
import type { Tables } from "@supabase-client";

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

const editableRoles: Array<StaffMember["role"]> = ["manager", "supervisor", "receptionist", "staff"];
const overrideModules = Object.keys(MODULE_LABELS);

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function StaffPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [staffToDeactivate, setStaffToDeactivate] = useState<StaffMember | null>(null);
  const [staffTab, setStaffTab] = useState<"all" | "unassigned">("all");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [confirmAssignDialogOpen, setConfirmAssignDialogOpen] = useState(false);
  const [staffToAssign, setStaffToAssign] = useState<StaffMember | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [staffToReactivate, setStaffToReactivate] = useState<StaffMember | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmEditDialogOpen, setConfirmEditDialogOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [staffToEdit, setStaffToEdit] = useState<StaffMember | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRole, setEditRole] = useState<StaffMember["role"]>("staff");
  const [overrideSelections, setOverrideSelections] = useState<Record<string, boolean>>({});
  const { staff, isLoading, refetch } = useStaff();
  const {
    invitations,
    isLoading: invitationsLoading,
    refetch: refetchInvitations,
    cancelInvitation,
    resendInvitation,
    canResend,
  } = useStaffInvitations();
  const { user, currentTenant, currentRole } = useAuth();

  const currentUserIsOwner = currentRole === "owner";
  const currentUserCanAssign = currentRole === "owner" || currentRole === "manager";
  const isChainTenant = currentTenant?.plan === "chain";
  const isOwnerHubStaffView = location.pathname === "/salon/overview/staff";

  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const filteredStaff = staffTab === "unassigned" ? staff.filter((member) => member.isUnassigned) : staff;

  const { data: tenantLocations = [] } = useQuery({
    queryKey: ["staff-assignment-locations", currentTenant?.id],
    queryFn: async (): Promise<Array<Pick<Tables<"locations">, "id" | "name">>> => {
      if (!currentTenant?.id) return [];
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .eq("tenant_id", currentTenant.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(currentTenant?.id),
  });

  const { data: tenantUserOverrides = [] } = useQuery({
    queryKey: ["staff-user-overrides", currentTenant?.id],
    queryFn: async (): Promise<Array<Pick<Tables<"user_permission_overrides">, "user_id" | "module" | "allowed">>> => {
      if (!currentTenant?.id) return [];
      const { data, error } = await supabase
        .from("user_permission_overrides")
        .select("user_id, module, allowed")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(currentTenant?.id && currentUserIsOwner),
  });

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

  const handleDeactivateClick = (member: StaffMember) => {
    setStaffToDeactivate(member);
    setDeactivateDialogOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!staffToDeactivate || !currentTenant?.id) return;
    
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ is_active: false })
        .eq("user_id", staffToDeactivate.userId)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "staff.deactivated",
        _entity_type: "user",
        _entity_id: staffToDeactivate.userId,
        _metadata: {
          deactivated_by_user_id: user?.id,
        },
      });
      
      toast({ title: "Success", description: "Staff member deactivated" });
      await refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to deactivate", variant: "destructive" });
    }
    setStaffToDeactivate(null);
  };

  const handleReactivateClick = (member: StaffMember) => {
    setStaffToReactivate(member);
    setReactivateDialogOpen(true);
  };

  const handleConfirmReactivate = async () => {
    if (!staffToReactivate || !currentTenant?.id) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ is_active: true })
        .eq("user_id", staffToReactivate.userId)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "staff.reactivated",
        _entity_type: "user",
        _entity_id: staffToReactivate.userId,
        _metadata: {
          reactivated_by_user_id: user?.id,
        },
      });

      toast({ title: "Success", description: "Staff member reactivated" });
      await refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reactivate", variant: "destructive" });
    } finally {
      setStaffToReactivate(null);
    }
  };

  const copyTempPassword = (password: string) => {
    navigator.clipboard.writeText(password);
    toast({ title: "Copied", description: "Temporary password copied to clipboard" });
  };

  const openAssignDialog = (member: StaffMember) => {
    setStaffToAssign(member);
    setSelectedLocationIds(member.assignedLocationIds);
    setAssignDialogOpen(true);
    setConfirmAssignDialogOpen(false);
  };

  const openEditDialog = (member: StaffMember) => {
    const [first = "", ...rest] = (member.profile?.full_name || "").trim().split(" ");
    setStaffToEdit(member);
    setEditFirstName(first);
    setEditLastName(rest.join(" "));
    setEditRole(member.role);

    const memberOverrides = tenantUserOverrides.filter((override) => override.user_id === member.userId);
    const initialOverrides: Record<string, boolean> = {};
    memberOverrides.forEach((override) => {
      initialOverrides[override.module] = override.allowed;
    });
    setOverrideSelections(initialOverrides);
    setEditDialogOpen(true);
  };

  const toggleOverrideSelection = (module: string) => {
    setOverrideSelections((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, module)) {
        const next = { ...prev };
        delete next[module];
        return next;
      }
      return { ...prev, [module]: true };
    });
  };

  const handleToggleLocation = (locationId: string) => {
    setSelectedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  };

  const handleSaveAssignments = async () => {
    if (!staffToAssign || !currentTenant?.id || !user?.id) return;
    setAssigning(true);
    try {
      const { error } = await (supabase.rpc as any)("assign_staff_locations", {
        p_tenant_id: currentTenant.id,
        p_user_id: staffToAssign.userId,
        p_location_ids: selectedLocationIds,
      });

      if (error) throw error;

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "staff.assignment_updated",
        _entity_type: "user",
        _entity_id: staffToAssign.userId,
        _metadata: {
          location_ids: selectedLocationIds,
        },
      });

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "assignment.pending_cleared",
        _entity_type: "user",
        _entity_id: staffToAssign.userId,
        _metadata: {
          cleared_by_user_id: user.id,
          location_count: selectedLocationIds.length,
        },
      });

      toast({ title: "Assignments updated", description: "Staff salons updated successfully." });
      setConfirmAssignDialogOpen(false);
      setAssignDialogOpen(false);
      setStaffToAssign(null);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    } catch (error: any) {
      toast({
        title: "Failed to update assignments",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!staffToEdit || !currentTenant?.id || !user?.id) return;
    const fullName = `${editFirstName} ${editLastName}`.trim();
    if (!fullName) {
      toast({ title: "Name required", description: "Enter first or last name.", variant: "destructive" });
      return;
    }

    setSavingEdit(true);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", staffToEdit.userId);
      if (profileError) throw profileError;

      if (staffToEdit.role !== editRole) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .update({ role: editRole })
          .eq("tenant_id", currentTenant.id)
          .eq("user_id", staffToEdit.userId);
        if (roleError) throw roleError;
      }

      const { error: clearOverridesError } = await supabase
        .from("user_permission_overrides")
        .delete()
        .eq("tenant_id", currentTenant.id)
        .eq("user_id", staffToEdit.userId);
      if (clearOverridesError) throw clearOverridesError;

      const overrideRows = Object.entries(overrideSelections).map(([module, allowed]) => ({
        tenant_id: currentTenant.id,
        user_id: staffToEdit.userId,
        module,
        allowed,
      }));

      if (overrideRows.length > 0) {
        const { error: insertOverrideError } = await supabase
          .from("user_permission_overrides")
          .insert(overrideRows);
        if (insertOverrideError) throw insertOverrideError;
      }

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "staff.profile_updated",
        _entity_type: "user",
        _entity_id: staffToEdit.userId,
        _metadata: { full_name: fullName },
      });

      if (staffToEdit.role !== editRole) {
        await (supabase.rpc as any)("log_audit_event", {
          _tenant_id: currentTenant.id,
          _action: "staff.role_updated",
          _entity_type: "user",
          _entity_id: staffToEdit.userId,
          _metadata: { role: editRole },
        });
      }

      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "staff.overrides_updated",
        _entity_type: "user",
        _entity_id: staffToEdit.userId,
        _metadata: { modules: Object.keys(overrideSelections) },
      });

      toast({ title: "Staff updated", description: "Profile, role, and overrides saved." });
      setConfirmEditDialogOpen(false);
      setEditDialogOpen(false);
      setStaffToEdit(null);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["staff-user-overrides", currentTenant.id] }),
      ]);
    } catch (error: any) {
      toast({
        title: "Failed to save changes",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Staff</h1>
            <p className="text-muted-foreground">
              {isOwnerHubStaffView
                ? "Manage staff across all your salon locations"
                : "Manage your team members and their permissions"}
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
                <div className="pt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={staffTab === "all" ? "default" : "outline"}
                    onClick={() => setStaffTab("all")}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={staffTab === "unassigned" ? "default" : "outline"}
                    onClick={() => setStaffTab("unassigned")}
                  >
                    Unassigned
                  </Button>
                </div>
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
                ) : filteredStaff.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-1">
                      {staffTab === "unassigned" ? "No unassigned team members" : "No team members yet"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {staffTab === "unassigned"
                        ? "All active team members currently have salon assignments."
                        : "Invite staff members to help manage your salon"}
                    </p>
                    {staffTab !== "unassigned" && (
                      <Button onClick={() => setInviteDialogOpen(true)} className="gap-2">
                        <UserPlus className="w-4 h-4" />
                        Invite Staff
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Assignments</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStaff.map((member) => {
                          const isActive = member.isActive;
                          return (
                          <TableRow 
                            key={member.userId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedStaff(member)}
                          >
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
                              <div className="flex items-center gap-2">
                                <Badge variant={roleVariants[member.role]}>
                                  {roleLabels[member.role]}
                                </Badge>
                                {!isActive && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {member.role === "owner" ? (
                                <Badge>ALL</Badge>
                              ) : member.isUnassigned ? (
                                <Badge variant="outline">Unassigned</Badge>
                              ) : (
                                <div className="text-sm flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span title={member.assignedLocationNames.join(", ")}>
                                    {member.assignedLocationCount} salon
                                    {member.assignedLocationCount > 1 ? "s" : ""}
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {currentUserCanAssign && member.role !== "owner" && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setSelectedStaff(member)}>
                                      <User className="w-4 h-4 mr-2" />
                                      View Details
                                    </DropdownMenuItem>
                                    {currentUserIsOwner && (
                                      <DropdownMenuItem onClick={() => openEditDialog(member)}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        Edit Staff
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => navigate(`/salon/audit-log?userId=${member.userId}`)}>
                                      <History className="w-4 h-4 mr-2" />
                                      View Activities
                                    </DropdownMenuItem>
                                    {isChainTenant && (
                                      <DropdownMenuItem onClick={() => openAssignDialog(member)}>
                                        <Building2 className="w-4 h-4 mr-2" />
                                        Assign Locations
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    {isActive ? (
                                      <DropdownMenuItem 
                                        onClick={() => handleDeactivateClick(member)}
                                        className="text-destructive"
                                      >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Deactivate
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem 
                                        onClick={() => handleReactivateClick(member)}
                                        className="text-success"
                                      >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Reactivate
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                          );
                        })}
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
                            <div className="flex-1">
                              <p className="font-medium">
                                {invitation.first_name} {invitation.last_name}
                              </p>
                              <p className="text-sm text-muted-foreground">{invitation.email}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
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
                              {/* Temporary Password Display */}
                              {invitation.temp_password && !invitation.password_changed_at && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                    {invitation.temp_password}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyTempPassword(invitation.temp_password!);
                                    }}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                              {invitation.password_changed_at && (
                                <Badge variant="outline" className="mt-2 text-xs text-muted-foreground">
                                  Password updated
                                </Badge>
                              )}
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

      <ConfirmActionDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title="Deactivate Staff Member"
        description={`Are you sure you want to deactivate ${staffToDeactivate?.profile?.full_name || "this staff member"}? They will no longer be able to access the system.`}
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleConfirmDeactivate}
      />

      <ConfirmActionDialog
        open={reactivateDialogOpen}
        onOpenChange={setReactivateDialogOpen}
        title="Reactivate Staff Member"
        description={`Are you sure you want to reactivate ${staffToReactivate?.profile?.full_name || "this staff member"}?`}
        confirmLabel="Reactivate"
        onConfirm={handleConfirmReactivate}
      />

      <StaffDetailDialog
        open={!!selectedStaff}
        onOpenChange={(open) => !open && setSelectedStaff(null)}
        staff={selectedStaff}
      />

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Locations</DialogTitle>
            <DialogDescription>
              {staffToAssign?.profile?.full_name || "Staff member"} can be assigned to one or more locations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {tenantLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No salons available for assignment.</p>
            ) : (
              tenantLocations.map((location) => (
                <label key={location.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={selectedLocationIds.includes(location.id)}
                    onCheckedChange={() => handleToggleLocation(location.id)}
                  />
                  <span>{location.name}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmAssignDialogOpen(true)} disabled={assigning}>
              {assigning ? "Saving..." : "Save Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmAssignDialogOpen}
        onOpenChange={setConfirmAssignDialogOpen}
        title="Confirm Location Assignment"
        description={`Apply ${selectedLocationIds.length} location assignment(s) for ${staffToAssign?.profile?.full_name || "this staff member"}?`}
        confirmLabel={assigning ? "Saving..." : "Confirm"}
        onConfirm={handleSaveAssignments}
      />

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Staff</DialogTitle>
            <DialogDescription>
              Update staff name, role, and per-user permission overrides.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="staff-first-name">First name</Label>
                <Input
                  id="staff-first-name"
                  value={editFirstName}
                  onChange={(event) => setEditFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-last-name">Last name</Label>
                <Input
                  id="staff-last-name"
                  value={editLastName}
                  onChange={(event) => setEditLastName(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(value) => setEditRole(value as StaffMember["role"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Per-user access overrides</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-md p-3">
                {overrideModules.map((moduleKey) => (
                  <label key={moduleKey} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={Object.prototype.hasOwnProperty.call(overrideSelections, moduleKey)}
                      onCheckedChange={() => toggleOverrideSelection(moduleKey)}
                    />
                    <span>{MODULE_LABELS[moduleKey]}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Checking a module adds an explicit allow override for this team member.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmEditDialogOpen(true)} disabled={savingEdit}>
              Review Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmEditDialogOpen}
        onOpenChange={setConfirmEditDialogOpen}
        title="Save Staff Changes"
        description={`Apply updates for ${staffToEdit?.profile?.full_name || "this staff member"}?`}
        confirmLabel={savingEdit ? "Saving..." : "Save changes"}
        onConfirm={handleSaveEdit}
      />
    </SalonSidebar>
  );
}
