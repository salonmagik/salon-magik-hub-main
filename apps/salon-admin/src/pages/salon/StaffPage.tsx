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
  User, History, XCircle, CheckCircle, Copy, Building2, Pencil, Loader2, Plus, CalendarOff, Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { cn } from "@shared/utils";
import { InviteStaffDialog } from "@/components/dialogs/InviteStaffDialog";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { useStaff, type StaffMember } from "@/hooks/useStaff";
import { useStaffInvitations } from "@/hooks/useStaffInvitations";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_ROLE_PERMISSIONS, MODULE_LABELS } from "@/hooks/usePermissions";
import { useStaffOperationsAddon } from "@/hooks/useStaffOperationsAddon";
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
import { TimeOffTab } from "@/components/staff/TimeOffTab";
import { CheckInsTab } from "@/components/staff/CheckInsTab";
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
  const [resendingInvitationId, setResendingInvitationId] = useState<string | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [staffToDeactivate, setStaffToDeactivate] = useState<StaffMember | null>(null);
  const [staffTab, setStaffTab] = useState<"all" | "unassigned">("all");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
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
  const [memberDialogTab, setMemberDialogTab] = useState<"profile" | "locations" | "permissions">("profile");
  const [editableTabs, setEditableTabs] = useState({
    profile: false,
    locations: false,
    permissions: false,
  });
  const [editCanManageSessions, setEditCanManageSessions] = useState(false);
  const [staffOperationsConfirmOpen, setStaffOperationsConfirmOpen] = useState(false);
  const [initialEditSnapshot, setInitialEditSnapshot] = useState<{
    firstName: string;
    lastName: string;
    role: StaffMember["role"];
    selectedLocationIds: string[];
    overrideSelections: Record<string, boolean>;
    canManageSessions: boolean;
  } | null>(null);
  const { staff, isLoading, refetch, updateStaffLocal } = useStaff();
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
  // send-staff-invitation creates the user_roles row (is_active: true) the moment an
  // invite is sent, so the account exists and looks "Active" in user_roles terms even
  // though the person has never logged in or set a real password. Cross-reference
  // against unaccepted invitations by email so Team Members reflects that correctly.
  const pendingInvitationByEmail = new Map(
    pendingInvitations
      .filter((invitation) => !invitation.accepted_at)
      .map((invitation) => [invitation.email.toLowerCase(), invitation] as const),
  );
  const isRoleChangedInDraft = Boolean(initialEditSnapshot && editRole !== initialEditSnapshot.role);
  const isEditingOwner = staffToEdit?.role === "owner";
  const normalizedSelectedLocations = [...selectedLocationIds].sort();
  const normalizedInitialLocations = [...(initialEditSnapshot?.selectedLocationIds || [])].sort();
  const locationsChanged =
    !isEditingOwner && normalizedSelectedLocations.join(",") !== normalizedInitialLocations.join(",");
  const profileChanged = Boolean(
    initialEditSnapshot &&
      (editFirstName !== initialEditSnapshot.firstName || editLastName !== initialEditSnapshot.lastName)
  );
  const roleChanged = Boolean(initialEditSnapshot && editRole !== initialEditSnapshot.role);
  const overridesChanged = Boolean(
    initialEditSnapshot &&
      !isEditingOwner &&
      overrideModules.some(
        (moduleKey) =>
          (overrideSelections[moduleKey] ?? false) !== (initialEditSnapshot.overrideSelections[moduleKey] ?? false)
      )
  );
  const sessionsChanged = Boolean(
    initialEditSnapshot &&
      staffToEdit?.role === "manager" &&
      editCanManageSessions !== initialEditSnapshot.canManageSessions
  );
  const isEditDirty = profileChanged || roleChanged || locationsChanged || (!roleChanged && overridesChanged) || sessionsChanged;

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

  const { data: tenantRolePermissions = [] } = useQuery({
    queryKey: ["staff-role-permissions", currentTenant?.id],
    queryFn: async (): Promise<Array<Pick<Tables<"role_permissions">, "role" | "module" | "allowed">>> => {
      if (!currentTenant?.id) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, module, allowed")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(currentTenant?.id && currentUserIsOwner),
  });

  const {
    isEnabled: staffOperationsEnabled,
    isPlanEligible: staffOperationsPlanEligible,
    locationCount: staffOperationsLocationCount,
    hasValidPrice: hasValidStaffOperationsPrice,
    priceLabel: staffOperationsPriceLabel,
    isUpdating: staffOperationsUpdating,
    toggle: toggleStaffOperations,
  } = useStaffOperationsAddon();

  const handleToggleStaffOperations = async () => {
    const succeeded = await toggleStaffOperations();
    if (succeeded) setStaffOperationsConfirmOpen(false);
  };

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
    setResendingInvitationId(id);
    try {
      await resendInvitation(id);
    } finally {
      setResendingInvitationId(null);
    }
  };

  const handleDeactivateClick = (member: StaffMember) => {
    setStaffToDeactivate(member);
    setDeactivateDialogOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!staffToDeactivate || !currentTenant?.id) return;

    try {
      const { error } = await (supabase.rpc as any)("set_staff_active_status", {
        p_tenant_id: currentTenant.id,
        p_user_id: staffToDeactivate.userId,
        p_is_active: false,
      });

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

      updateStaffLocal(staffToDeactivate.userId, (member) => ({
        ...member,
        isActive: false,
      }));

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
      const { error } = await (supabase.rpc as any)("set_staff_active_status", {
        p_tenant_id: currentTenant.id,
        p_user_id: staffToReactivate.userId,
        p_is_active: true,
      });

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

      updateStaffLocal(staffToReactivate.userId, (member) => ({
        ...member,
        isActive: true,
      }));

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

  const openMemberDialog = (
    member: StaffMember,
    tab: "profile" | "locations" | "permissions" = "profile",
    enableEdit = false
  ) => {
    const [first = "", ...rest] = (member.profile?.full_name || "").trim().split(" ");
    setStaffToEdit(member);
    setEditFirstName(first);
    setEditLastName(rest.join(" "));
    setEditRole(member.role);
    setSelectedLocationIds(member.assignedLocationIds);

    const rolePermissions = tenantRolePermissions.filter((permission) => permission.role === member.role);
    const rolePermissionMap = new Map(rolePermissions.map((permission) => [permission.module, permission.allowed]));
    const memberOverrides = tenantUserOverrides.filter((override) => override.user_id === member.userId);
    const memberOverrideMap = new Map(memberOverrides.map((override) => [override.module, override.allowed]));

    const initialOverrides: Record<string, boolean> = {};
    overrideModules.forEach((moduleKey) => {
      const roleAllowed =
        rolePermissionMap.get(moduleKey) ??
        DEFAULT_ROLE_PERMISSIONS[member.role]?.[moduleKey] ??
        false;
      initialOverrides[moduleKey] = memberOverrideMap.get(moduleKey) ?? roleAllowed;
    });
    setOverrideSelections(initialOverrides);
    setEditCanManageSessions(false);
    setInitialEditSnapshot({
      firstName: first,
      lastName: rest.join(" "),
      role: member.role,
      selectedLocationIds: member.assignedLocationIds,
      overrideSelections: initialOverrides,
      canManageSessions: false,
    });

    // For managers, load their current can_manage_staff_sessions flag.
    // Update both the edit state and the snapshot baseline once resolved.
    if (member.role === "manager" && currentTenant?.id) {
      supabase
        .from("user_roles")
        .select("can_manage_staff_sessions")
        .eq("user_id", member.userId)
        .eq("tenant_id", currentTenant.id)
        .maybeSingle()
        .then(({ data }) => {
          const val = data?.can_manage_staff_sessions === true;
          setEditCanManageSessions(val);
          setInitialEditSnapshot((prev) =>
            prev ? { ...prev, canManageSessions: val } : prev
          );
        });
    }

    const resolvedTab = member.role === "owner" ? "profile" : tab;
    setMemberDialogTab(resolvedTab);
    setEditableTabs({
      profile: enableEdit && resolvedTab === "profile",
      locations: member.role === "owner" ? false : enableEdit && resolvedTab === "locations",
      permissions: member.role === "owner" ? false : enableEdit && resolvedTab === "permissions",
    });
    setEditDialogOpen(true);
  };

  const toggleOverrideSelection = (module: string) => {
    setOverrideSelections((prev) => ({
      ...prev,
      [module]: !(prev[module] ?? false),
    }));
  };

  const handleToggleLocation = (locationId: string) => {
    setSelectedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
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
        const { error: roleUpdateError } = await (supabase.rpc as any)("update_staff_role", {
          p_tenant_id: currentTenant.id,
          p_user_id: staffToEdit.userId,
          p_new_role: editRole,
        });
        if (roleUpdateError) throw roleUpdateError;

        const actorName = user?.email || "An admin";
        const { error: roleNotificationError } = await supabase.from("notifications").insert({
          tenant_id: currentTenant.id,
          user_id: staffToEdit.userId,
          type: "staff",
          title: "Role updated",
          description: `${actorName} changed your role to ${roleLabels[editRole]}. Your access has been refreshed.`,
          urgent: true,
          entity_type: "user_role",
          entity_id: staffToEdit.userId,
        });
        if (roleNotificationError) {
          console.error("Failed to create role change notification:", roleNotificationError);
        }
      }

      const { error: clearOverridesError } = await supabase
        .from("user_permission_overrides")
        .delete()
        .eq("tenant_id", currentTenant.id)
        .eq("user_id", staffToEdit.userId);
      if (clearOverridesError) throw clearOverridesError;

      if (!isRoleChangedInDraft) {
        const selectedRolePermissions = tenantRolePermissions.filter((permission) => permission.role === editRole);
        const selectedRolePermissionMap = new Map(
          selectedRolePermissions.map((permission) => [permission.module, permission.allowed])
        );

        const overrideRows = overrideModules
          .map((moduleKey) => {
            const desiredAllowed = overrideSelections[moduleKey] ?? false;
            const roleAllowed =
              selectedRolePermissionMap.get(moduleKey) ??
              DEFAULT_ROLE_PERMISSIONS[editRole]?.[moduleKey] ??
              false;

            if (desiredAllowed === roleAllowed) {
              return null;
            }

            return {
              tenant_id: currentTenant.id,
              user_id: staffToEdit.userId,
              module: moduleKey,
              allowed: desiredAllowed,
            };
          })
          .filter(Boolean) as Array<{
            tenant_id: string;
            user_id: string;
            module: string;
            allowed: boolean;
          }>;

        if (overrideRows.length > 0) {
          const { error: insertOverrideError } = await supabase
            .from("user_permission_overrides")
            .insert(overrideRows);
          if (insertOverrideError) throw insertOverrideError;
        }
      }

      if (sessionsChanged && staffToEdit.role === "manager") {
        const { error: sessionsError } = await supabase
          .from("user_roles")
          .update({ can_manage_staff_sessions: editCanManageSessions })
          .eq("user_id", staffToEdit.userId)
          .eq("tenant_id", currentTenant.id);
        if (sessionsError) throw sessionsError;
      }

      if (isChainTenant && currentUserCanAssign && locationsChanged) {
        const { error: assignmentError } = await (supabase.rpc as any)("assign_staff_locations", {
          p_tenant_id: currentTenant.id,
          p_user_id: staffToEdit.userId,
          p_location_ids: selectedLocationIds,
        });
        if (assignmentError) throw assignmentError;

        await (supabase.rpc as any)("log_audit_event", {
          _tenant_id: currentTenant.id,
          _action: "staff.assignment_updated",
          _entity_type: "user",
          _entity_id: staffToEdit.userId,
          _metadata: {
            location_ids: selectedLocationIds,
            location_count: selectedLocationIds.length,
          },
        });
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

      updateStaffLocal(staffToEdit.userId, (member) => ({
        ...member,
        role: editRole,
        profile: {
          ...(member.profile || ({} as typeof member.profile)),
          full_name: fullName,
        } as typeof member.profile,
      }));

      toast({ title: "Staff updated", description: "Profile, role, and overrides saved." });
      setConfirmEditDialogOpen(false);
      setEditDialogOpen(false);
      setStaffToEdit(null);
      setInitialEditSnapshot(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["staff-user-overrides", currentTenant.id] });
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
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
			<div className="mx-auto w-full max-w-[1320px] space-y-[22px]">
				{/* Header */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-[22px] font-medium leading-tight tracking-[-0.3px]">
							Team Members
						</h1>
						<p className="mt-1 text-[13.5px] text-muted-foreground">
							{isOwnerHubStaffView
								? "Manage staff across all your salon locations"
								: "Manage your team members and their permissions"}
						</p>
					</div>
					<Button
						onClick={() => setInviteDialogOpen(true)}
						className="hidden h-11 gap-2 rounded-full px-6 lg:flex"
					>
						<UserPlus className="w-4 h-4" />
						<span className="hidden sm:inline">Invite Staff</span>
						<span className="sm:hidden">Invite</span>
					</Button>
				</div>

				{/* Stats Cards */}
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Card className="rounded-[14px] border-black/[0.06] bg-white shadow-none">
						<CardHeader className="px-5 pb-2 pt-5">
							<CardTitle className="text-[13px] font-normal text-muted-foreground">
								Total Staff
							</CardTitle>
						</CardHeader>
						<CardContent className="px-5 pb-5">
							<div className="flex items-center gap-2">
								<Users className="h-[18px] w-[18px] text-muted-foreground" />
								<span className="font-serif text-[26px] font-medium leading-none">
									{isLoading ? "..." : staff.length}
								</span>
							</div>
						</CardContent>
					</Card>
					<Card className="rounded-[14px] border-black/[0.06] bg-white shadow-none">
						<CardHeader className="px-5 pb-2 pt-5">
							<CardTitle className="text-[13px] font-normal text-muted-foreground">
								Owners
							</CardTitle>
						</CardHeader>
						<CardContent className="px-5 pb-5">
							<div className="flex items-center gap-2">
								<Shield className="h-[18px] w-[18px] text-primary" />
								<span className="font-serif text-[26px] font-medium leading-none">
									{isLoading
										? "..."
										: staff.filter((s) => s.role === "owner").length}
								</span>
							</div>
						</CardContent>
					</Card>
					<Card className="rounded-[14px] border-black/[0.06] bg-white shadow-none">
						<CardHeader className="px-5 pb-2 pt-5">
							<CardTitle className="text-[13px] font-normal text-muted-foreground">
								Pending Invites
							</CardTitle>
						</CardHeader>
						<CardContent className="px-5 pb-5">
							<div className="flex items-center gap-2">
								<Clock className="h-[18px] w-[18px] text-amber-700" />
								<span className="font-serif text-[26px] font-medium leading-none">
									{invitationsLoading ? "..." : pendingInvitations.length}
								</span>
							</div>
						</CardContent>
					</Card>
					<Card className="rounded-[14px] border-black/[0.06] bg-white shadow-none">
						<CardHeader className="px-5 pb-2 pt-5">
							<CardTitle className="flex items-center gap-1 text-[13px] font-normal text-muted-foreground">
								Staff role
								<Tooltip>
									<TooltipTrigger asChild>
										<Info className="h-3 w-3 cursor-default" />
									</TooltipTrigger>
									<TooltipContent side="top" className="max-w-56 text-xs">
										Everyone who isn't an owner or manager — supervisors,
										receptionists, and stylists combined.
									</TooltipContent>
								</Tooltip>
							</CardTitle>
						</CardHeader>
						<CardContent className="px-5 pb-5">
							<div className="flex items-center gap-2">
								<User className="h-[18px] w-[18px] text-muted-foreground" />
								<span className="font-serif text-[26px] font-medium leading-none">
									{isLoading
										? "..."
										: staff.filter(
												(s) => !["owner", "manager"].includes(s.role),
											).length}
								</span>
							</div>
						</CardContent>
					</Card>
				</div>

				<div
					className={cn(
						"flex flex-col gap-4 rounded-[18px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
						staffOperationsEnabled
							? "border-emerald-200 bg-emerald-50/70"
							: "border-primary/25 bg-primary/[0.055]",
					)}
				>
					<div className="flex min-w-0 items-start gap-3">
						<div
							className={cn(
								"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white",
								staffOperationsEnabled ? "text-emerald-700" : "text-primary",
							)}
						>
							{staffOperationsEnabled ? (
								<CheckCircle className="h-5 w-5" />
							) : (
								<Lock className="h-5 w-5" />
							)}
						</div>
						<div>
							<div className="flex flex-wrap items-center gap-2">
								<p className="font-serif text-base font-semibold">
									Staff Operations
								</p>
								<Badge
									className={cn(
										staffOperationsEnabled
											? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
											: "bg-white text-primary hover:bg-white",
									)}
								>
									{staffOperationsEnabled ? "Active" : "Paid add-on"}
								</Badge>
							</div>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Get insight on staff arrival times, time off and leave requests.
								{!staffOperationsEnabled &&
								staffOperationsPlanEligible &&
								staffOperationsPriceLabel
									? ` ${staffOperationsPriceLabel}/month for ${staffOperationsLocationCount} location${staffOperationsLocationCount === 1 ? "" : "s"}.`
									: ""}
								{!staffOperationsEnabled && !staffOperationsPlanEligible
									? " Available on Studio and Chain plans."
									: ""}
							</p>
						</div>
					</div>
					{currentUserIsOwner ? (
						staffOperationsEnabled || staffOperationsPlanEligible ? (
							<Button
								variant={staffOperationsEnabled ? "outline" : "default"}
								className="shrink-0 rounded-full"
								disabled={
									!staffOperationsEnabled && !hasValidStaffOperationsPrice
								}
								onClick={() => setStaffOperationsConfirmOpen(true)}
							>
								{staffOperationsEnabled ? "Disable add-on" : "Enable add-on"}
							</Button>
						) : (
							<Button
								variant="outline"
								className="shrink-0 rounded-full"
								onClick={() =>
									navigate("/salon/business-settings?tab=subscription")
								}
							>
								Upgrade to enable
							</Button>
						)
					) : !staffOperationsEnabled ? (
						<p className="shrink-0 text-xs text-muted-foreground">
							{/* {staffOperationsPlanEligible
                ? "Ask the salon owner to enable it."
                : "Available on Studio and Chain plans."} */}
						</p>
					) : null}
				</div>

				{/* Tabs for Staff, Invitations, and Permissions */}
				<Tabs defaultValue="team">
					<TabsList className="scrollbar-hide flex h-auto w-full justify-start overflow-x-auto rounded-full bg-[#eee9e1] p-1 sm:w-fit">
						<TabsTrigger
							value="team"
							className="h-10 shrink-0 rounded-full px-5 sm:px-6"
						>
							Team Members
						</TabsTrigger>
						<TabsTrigger
							value="invitations"
							className="flex h-10 shrink-0 items-center gap-2 rounded-full px-5 sm:px-6"
						>
							Pending Invitations
							{pendingInvitations.length > 0 && (
								<Badge variant="secondary" className="h-5 px-1.5">
									{pendingInvitations.length}
								</Badge>
							)}
						</TabsTrigger>
						{currentUserIsOwner && (
							<TabsTrigger
								value="permissions"
								className="flex h-10 shrink-0 items-center gap-2 rounded-full px-5 sm:px-6"
							>
								<Lock className="w-3 h-3" />
								Permissions
							</TabsTrigger>
						)}
						{currentUserCanAssign && staffOperationsEnabled && (
							<TabsTrigger
								value="time-off"
								className="flex h-10 shrink-0 items-center gap-2 rounded-full px-5 sm:px-6"
							>
								<CalendarOff className="h-3.5 w-3.5" />
								Time off
							</TabsTrigger>
						)}
						{currentUserCanAssign && staffOperationsEnabled && (
							<TabsTrigger
								value="check-ins"
								className="flex h-10 shrink-0 items-center gap-2 rounded-full px-5 sm:px-6"
							>
								<Clock className="h-3.5 w-3.5" />
								Check-ins
							</TabsTrigger>
						)}
					</TabsList>

					{/* Team Members Tab */}
					<TabsContent value="team" className="mt-5">
						<Card className="overflow-hidden rounded-[22px] border-black/[0.06] bg-white shadow-sm">
							<CardHeader className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
								<CardTitle className="text-base font-normal">
									Team members
								</CardTitle>
								<div className="flex items-center gap-2 pt-2">
									<Button
										size="sm"
										variant={staffTab === "all" ? "default" : "outline"}
										onClick={() => setStaffTab("all")}
										className="h-9 rounded-full px-5"
									>
										All
									</Button>
									<Button
										size="sm"
										variant={staffTab === "unassigned" ? "default" : "outline"}
										onClick={() => setStaffTab("unassigned")}
										className="h-9 rounded-full px-5"
									>
										Unassigned
									</Button>
								</div>
							</CardHeader>
							<CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
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
											{staffTab === "unassigned"
												? "No unassigned team members"
												: "No team members yet"}
										</h3>
										<p className="text-sm text-muted-foreground mb-4">
											{staffTab === "unassigned"
												? "All active team members currently have salon assignments."
												: "Invite staff members to help manage your salon"}
										</p>
										{staffTab !== "unassigned" && (
											<Button
												onClick={() => setInviteDialogOpen(true)}
												className="gap-2"
											>
												<UserPlus className="w-4 h-4" />
												Invite Staff
											</Button>
										)}
									</div>
								) : (
									<div className="scrollbar-hide -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
										<Table className="min-w-[900px]">
											<TableHeader>
												<TableRow>
													<TableHead>Name</TableHead>
													<TableHead className="hidden sm:table-cell">
														Email
													</TableHead>
													<TableHead>Role</TableHead>
													<TableHead>Status</TableHead>
													<TableHead className="hidden lg:table-cell">
														Last Login
													</TableHead>
													<TableHead>Assignments</TableHead>
													<TableHead className="w-[50px]"></TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filteredStaff.map((member) => {
													const isActive = member.isActive;
													const pendingInvitation = member.email
														? pendingInvitationByEmail.get(
																member.email.toLowerCase(),
															)
														: undefined;
													const resendStatus = pendingInvitation
														? canResend(pendingInvitation)
														: null;
													return (
														<TableRow
															key={member.userId}
															className="cursor-pointer hover:bg-muted/50"
															onClick={() => openMemberDialog(member)}
														>
															<TableCell className="py-3.5">
																<div className="flex items-center gap-3">
																	<Avatar className="h-8 w-8">
																		<AvatarImage
																			src={
																				member.profile?.avatar_url || undefined
																			}
																		/>
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
															<TableCell className="hidden py-3.5 sm:table-cell">
																<div className="flex items-center gap-2 text-muted-foreground">
																	<Mail className="w-3.5 h-3.5 flex-shrink-0" />
																	<span className="truncate text-sm">
																		{member.email || "—"}
																	</span>
																</div>
															</TableCell>
															<TableCell className="py-3.5">
																<div className="flex items-center gap-2">
																	<Badge variant={roleVariants[member.role]}>
																		{roleLabels[member.role]}
																	</Badge>
																</div>
															</TableCell>
															<TableCell className="py-3.5">
																{pendingInvitation ? (
																	<Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
																		Pending
																	</Badge>
																) : isActive ? (
																	<Badge className="bg-success/10 text-success hover:bg-success/10">
																		Active
																	</Badge>
																) : (
																	<Badge
																		variant="outline"
																		className="text-muted-foreground"
																	>
																		Deactivated
																	</Badge>
																)}
															</TableCell>
															<TableCell className="hidden py-3.5 text-sm text-muted-foreground lg:table-cell">
																{member.lastLoginAt
																	? format(
																			new Date(member.lastLoginAt),
																			"MMM d, yyyy p",
																		)
																	: "Never"}
															</TableCell>
															<TableCell className="py-3.5">
																{member.role === "owner" ? (
																	<Badge>ALL</Badge>
																) : member.isUnassigned ? (
																	<Badge variant="outline">Unassigned</Badge>
																) : (
																	<div className="text-sm flex items-center gap-1">
																		<Building2 className="w-3.5 h-3.5 text-muted-foreground" />
																		<span
																			title={member.assignedLocationNames.join(
																				", ",
																			)}
																		>
																			{member.assignedLocationCount} salon
																			{member.assignedLocationCount > 1
																				? "s"
																				: ""}
																		</span>
																	</div>
																)}
															</TableCell>
															<TableCell
																className="py-3.5"
																onClick={(e) => e.stopPropagation()}
															>
																{((currentUserCanAssign &&
																	member.role !== "owner") ||
																	pendingInvitation) && (
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				size="icon"
																				className="h-8 w-8"
																			>
																				<MoreHorizontal className="w-4 h-4" />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuItem
																				onClick={() => openMemberDialog(member)}
																			>
																				<User className="w-4 h-4 mr-2" />
																				View Details
																			</DropdownMenuItem>
																			<DropdownMenuItem
																				onClick={() =>
																					navigate(
																						`/salon/audit-log?userId=${member.userId}`,
																					)
																				}
																			>
																				<History className="w-4 h-4 mr-2" />
																				View Activities
																			</DropdownMenuItem>
																			<DropdownMenuSeparator />
																			{pendingInvitation && (
																				<DropdownMenuItem
																					onClick={() =>
																						handleResend(pendingInvitation.id)
																					}
																					disabled={
																						!resendStatus?.allowed ||
																						resendingInvitationId ===
																							pendingInvitation.id
																					}
																				>
																					<Mail className="w-4 h-4 mr-2" />
																					{resendingInvitationId ===
																					pendingInvitation.id
																						? "Resending..."
																						: resendStatus?.allowed
																							? "Resend invite"
																							: `Resend invite (${resendStatus?.minutesRemaining}m)`}
																				</DropdownMenuItem>
																			)}
																			{currentUserCanAssign &&
																				member.role !== "owner" &&
																				(isActive ? (
																					<DropdownMenuItem
																						onClick={() =>
																							handleDeactivateClick(member)
																						}
																						className="text-destructive"
																					>
																						<XCircle className="w-4 h-4 mr-2" />
																						Deactivate
																					</DropdownMenuItem>
																				) : (
																					<DropdownMenuItem
																						onClick={() =>
																							handleReactivateClick(member)
																						}
																						className="text-success"
																					>
																						<CheckCircle className="w-4 h-4 mr-2" />
																						Reactivate
																					</DropdownMenuItem>
																				))}
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
					<TabsContent value="invitations" className="mt-5">
						<Card className="rounded-[22px] border-black/[0.06] bg-white shadow-sm">
							<CardHeader className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
								<CardTitle className="text-base font-normal">
									Pending invitations
								</CardTitle>
							</CardHeader>
							<CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
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
											const isExpired =
												new Date(invitation.expires_at) < new Date();
											const resendStatus = canResend(invitation);

											return (
												<div
													key={invitation.id}
													className={`flex flex-col gap-4 rounded-[14px] border p-4 sm:flex-row sm:items-center sm:justify-between ${
														isExpired
															? "bg-destructive/5 border-destructive/20"
															: "bg-muted/50"
													}`}
												>
													<div className="flex min-w-0 items-start gap-3">
														<div
															className={`w-10 h-10 rounded-full flex items-center justify-center ${
																isExpired
																	? "bg-destructive/10"
																	: "bg-primary/10"
															}`}
														>
															{isExpired ? (
																<AlertTriangle className="w-5 h-5 text-destructive" />
															) : (
																<Mail className="w-5 h-5 text-primary" />
															)}
														</div>
														<div className="min-w-0 flex-1">
															<p className="font-medium">
																{invitation.first_name} {invitation.last_name}
															</p>
															<p className="truncate text-sm text-muted-foreground">
																{invitation.email}
															</p>
															{invitation.phone && (
																<p className="text-sm text-muted-foreground">
																	{invitation.phone}
																</p>
															)}
															<div className="flex flex-wrap items-center gap-2 mt-1">
																<Badge variant="outline" className="text-xs">
																	{roleLabels[invitation.role]}
																</Badge>
																{isExpired ? (
																	<Badge
																		variant="destructive"
																		className="text-xs"
																	>
																		Expired
																	</Badge>
																) : (
																	<span className="text-xs text-muted-foreground">
																		Expires{" "}
																		{format(
																			new Date(invitation.expires_at),
																			"MMM d, yyyy",
																		)}
																	</span>
																)}
																{invitation.resend_count > 0 && (
																	<span className="text-xs text-muted-foreground">
																		Resent {invitation.resend_count}×
																	</span>
																)}
															</div>
															{/* Temporary Password Display */}
															{invitation.temp_password &&
																!invitation.password_changed_at && (
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
																				copyTempPassword(
																					invitation.temp_password!,
																				);
																			}}
																		>
																			<Copy className="w-3 h-3" />
																		</Button>
																	</div>
																)}
															{invitation.password_changed_at && (
																<Badge
																	variant="outline"
																	className="mt-2 text-xs text-muted-foreground"
																>
																	Password updated
																</Badge>
															)}
														</div>
													</div>
													<div className="flex w-full items-center justify-end gap-2 sm:w-auto">
														<Button
															variant="ghost"
															size="sm"
															className="gap-1"
															onClick={() => handleResend(invitation.id)}
															disabled={
																!resendStatus.allowed ||
																resendingInvitationId === invitation.id
															}
															title={
																resendStatus.allowed
																	? "Resend invitation"
																	: `Wait ${resendStatus.minutesRemaining} min`
															}
														>
															{resendingInvitationId === invitation.id ? (
																<>
																	<Loader2 className="w-3 h-3 animate-spin" />
																	Resending...
																</>
															) : (
																<>
																	<RefreshCw className="w-3 h-3" />
																	{resendStatus.allowed
																		? "Resend"
																		: `${resendStatus.minutesRemaining}m`}
																</>
															)}
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
						<TabsContent value="permissions" className="mt-5">
							<PermissionsTab />
						</TabsContent>
					)}
					{currentUserCanAssign &&
						staffOperationsEnabled &&
						currentTenant?.id &&
						user?.id && (
							<TabsContent value="time-off" className="mt-5">
								<TimeOffTab
									tenantId={currentTenant.id}
									actorId={user.id}
									staff={staff}
									canManage={currentUserCanAssign}
								/>
							</TabsContent>
						)}
					{currentUserCanAssign && staffOperationsEnabled && (
						<TabsContent value="check-ins" className="mt-5">
							<CheckInsTab staff={staff} />
						</TabsContent>
					)}
				</Tabs>
			</div>

			<button
				type="button"
				aria-label="Invite staff"
				onClick={() => setInviteDialogOpen(true)}
				className="fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 lg:hidden"
			>
				<Plus className="h-6 w-6" />
			</button>

			<Dialog
				open={staffOperationsConfirmOpen}
				onOpenChange={setStaffOperationsConfirmOpen}
			>
				<DialogContent className="rounded-[24px] sm:max-w-[520px]">
					<DialogHeader>
						<DialogTitle className="font-serif text-2xl">
							{staffOperationsEnabled
								? "Disable Staff Operations?"
								: "Enable Staff Operations?"}
						</DialogTitle>
						<DialogDescription className="pt-2 text-sm leading-6">
							{staffOperationsEnabled
								? "Time-off tools will be hidden immediately and this add-on will be removed from future recurring bills. Existing leave records are retained."
								: `This enables check-ins and time-off management for your team. ${
										staffOperationsPriceLabel
											? `Your recurring add-on bill will increase by ${staffOperationsPriceLabel} per month at the current ${staffOperationsLocationCount}-location count.`
											: "The configured market price will be added to your recurring add-on bill."
									}`}
						</DialogDescription>
					</DialogHeader>
					{!staffOperationsEnabled && (
						<div className="rounded-2xl border bg-muted/35 p-4 text-sm">
							<div className="flex items-center justify-between gap-4">
								<span className="text-muted-foreground">Billing model</span>
								<span className="font-medium">Monthly per active location</span>
							</div>
							<div className="mt-2 flex items-center justify-between gap-4">
								<span className="text-muted-foreground">
									Current monthly total
								</span>
								<span className="font-serif text-lg font-semibold">
									{staffOperationsPriceLabel || "Unavailable"}
								</span>
							</div>
						</div>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							className="rounded-full"
							onClick={() => setStaffOperationsConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant={staffOperationsEnabled ? "destructive" : "default"}
							className="rounded-full"
							disabled={staffOperationsUpdating}
							onClick={handleToggleStaffOperations}
						>
							{staffOperationsUpdating
								? "Updating..."
								: staffOperationsEnabled
									? "Disable add-on"
									: "Confirm and enable"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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

			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto rounded-[22px] border-0 p-5 shadow-2xl sm:max-w-[680px] sm:p-8 sm:px-[34px]">
					<DialogHeader className="pr-8 text-left">
						<DialogTitle className="font-serif text-xl font-medium tracking-[-0.3px]">
							Team member
						</DialogTitle>
						<DialogDescription className="mt-1 text-[13.5px]">
							View details and edit profile, locations, role, and permissions.
						</DialogDescription>
					</DialogHeader>
					<Tabs
						value={memberDialogTab}
						onValueChange={(value) =>
							setMemberDialogTab(value as typeof memberDialogTab)
						}
					>
						<TabsList
							className={cn(
								"grid h-auto w-full rounded-full bg-[#f1ece3] p-1",
								isEditingOwner
									? "grid-cols-1"
									: currentUserIsOwner
										? "grid-cols-3"
										: "grid-cols-2",
							)}
						>
							<TabsTrigger
								value="profile"
								className="h-11 rounded-full text-[13.5px]"
							>
								Profile
							</TabsTrigger>
							{!isEditingOwner && (
								<TabsTrigger
									value="locations"
									className="h-11 rounded-full text-[13.5px]"
								>
									Locations
								</TabsTrigger>
							)}
							{/* Role changes assign permission tiers — owner-only, enforced server-side in update_staff_role. */}
							{!isEditingOwner && currentUserIsOwner && (
								<TabsTrigger
									value="permissions"
									className="h-11 rounded-full text-[13.5px]"
								>
									Role & Permissions
								</TabsTrigger>
							)}
						</TabsList>

						<TabsContent value="profile" className="space-y-[18px] pt-5">
							<div className="flex items-center justify-between">
								<h3 className="font-serif text-[15px] font-medium text-muted-foreground">
									Basic information
								</h3>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1.5 rounded-full px-3 text-[13.5px] text-muted-foreground"
									onClick={() =>
										setEditableTabs((prev) => ({
											...prev,
											profile: !prev.profile,
										}))
									}
								>
									<Pencil className="h-3.5 w-3.5" />
									{editableTabs.profile ? "Stop editing" : "Edit"}
								</Button>
							</div>
							<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label
										htmlFor="staff-first-name"
										className="text-[13.5px] font-normal text-muted-foreground"
									>
										First name
									</Label>
									<Input
										id="staff-first-name"
										className="h-12 rounded-lg border-black/10 disabled:bg-[#f1ece3] disabled:text-muted-foreground disabled:opacity-100"
										value={editFirstName}
										disabled={!editableTabs.profile}
										onChange={(event) => setEditFirstName(event.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label
										htmlFor="staff-last-name"
										className="text-[13.5px] font-normal text-muted-foreground"
									>
										Last name
									</Label>
									<Input
										id="staff-last-name"
										className="h-12 rounded-lg border-black/10 disabled:bg-[#f1ece3] disabled:text-muted-foreground disabled:opacity-100"
										value={editLastName}
										disabled={!editableTabs.profile}
										onChange={(event) => setEditLastName(event.target.value)}
									/>
								</div>
							</div>
							<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label
										htmlFor="staff-email"
										className="text-[13.5px] font-normal text-muted-foreground"
									>
										Email
									</Label>
									<Input
										id="staff-email"
										className="h-12 rounded-lg border-black/10 disabled:bg-[#f1ece3] disabled:text-muted-foreground disabled:opacity-100"
										value={staffToEdit?.email || "—"}
										disabled
									/>
								</div>
								<div className="space-y-1.5">
									<Label
										htmlFor="staff-joined"
										className="text-[13.5px] font-normal text-muted-foreground"
									>
										Joined
									</Label>
									<Input
										id="staff-joined"
										className="h-12 rounded-lg border-black/10 disabled:bg-[#f1ece3] disabled:text-muted-foreground disabled:opacity-100"
										value={
											staffToEdit?.joinedAt
												? format(new Date(staffToEdit.joinedAt), "MMM d, yyyy")
												: "—"
										}
										disabled
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label
									htmlFor="staff-last-login"
									className="text-[13.5px] font-normal text-muted-foreground"
								>
									Last login
								</Label>
								<Input
									id="staff-last-login"
									className="h-12 rounded-lg border-black/10 disabled:bg-[#f1ece3] disabled:text-muted-foreground disabled:opacity-100"
									value={
										staffToEdit?.lastLoginAt
											? format(
													new Date(staffToEdit.lastLoginAt),
													"MMM d, yyyy p",
												)
											: "Never"
									}
									disabled
								/>
							</div>
						</TabsContent>

						<TabsContent value="locations" className="space-y-4 pt-5">
							<div className="flex items-center justify-between">
								<h3 className="font-serif text-[15px] font-medium text-muted-foreground">
									Assigned salon locations
								</h3>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1.5 rounded-full px-3 text-[13.5px] text-muted-foreground"
									disabled={
										!isChainTenant || !currentUserCanAssign || isEditingOwner
									}
									onClick={() =>
										setEditableTabs((prev) => ({
											...prev,
											locations: !prev.locations,
										}))
									}
								>
									<Pencil className="h-3.5 w-3.5" />
									{editableTabs.locations ? "Stop editing" : "Edit"}
								</Button>
							</div>
							{isEditingOwner && (
								<p className="text-sm text-muted-foreground">
									Owners always have access to all branches.
								</p>
							)}
							<div className="scrollbar-hide max-h-64 space-y-1 overflow-y-auto rounded-[14px] border border-black/[0.07] p-2">
								{!isChainTenant ? (
									<p className="text-sm text-muted-foreground">
										Location assignment is available on chain plan only.
									</p>
								) : tenantLocations.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No salons available.
									</p>
								) : (
									tenantLocations.map((location) => (
										<label
											key={location.id}
											className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-[#fbf9f6]"
										>
											<Checkbox
												checked={selectedLocationIds.includes(location.id)}
												disabled={!editableTabs.locations || isEditingOwner}
												onCheckedChange={() =>
													handleToggleLocation(location.id)
												}
											/>
											<span>{location.name}</span>
										</label>
									))
								)}
							</div>
						</TabsContent>

						<TabsContent value="permissions" className="space-y-4 pt-5">
							<div className="flex items-center justify-between">
								<h3 className="font-serif text-[15px] font-medium text-muted-foreground">
									Role and per-user permissions
								</h3>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1.5 rounded-full px-3 text-[13.5px] text-muted-foreground"
									disabled={isEditingOwner}
									onClick={() =>
										setEditableTabs((prev) => ({
											...prev,
											permissions: !prev.permissions,
										}))
									}
								>
									<Pencil className="h-3.5 w-3.5" />
									{editableTabs.permissions ? "Stop editing" : "Edit"}
								</Button>
							</div>
							{isEditingOwner && (
								<p className="text-sm text-muted-foreground">
									Owner permissions are fixed and include full access.
								</p>
							)}
							<div className="space-y-1.5">
								<Label
									htmlFor="staff-role"
									className="text-[13.5px] font-normal text-muted-foreground"
								>
									Role
								</Label>
								<Select
									value={editRole}
									disabled={!editableTabs.permissions || isEditingOwner}
									onValueChange={(value) => {
										const nextRole = value as StaffMember["role"];
										setEditRole(nextRole);
										if (
											initialEditSnapshot &&
											nextRole !== initialEditSnapshot.role
										) {
											const defaults: Record<string, boolean> = {};
											overrideModules.forEach((moduleKey) => {
												defaults[moduleKey] =
													DEFAULT_ROLE_PERMISSIONS[nextRole]?.[moduleKey] ??
													false;
											});
											setOverrideSelections(defaults);
										}
									}}
								>
									<SelectTrigger
										id="staff-role"
										className="h-12 rounded-lg border-black/10 disabled:bg-[#f1ece3] disabled:text-muted-foreground disabled:opacity-100"
									>
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
								<Label className="text-[13.5px] font-normal text-muted-foreground">
									Per-user access overrides
								</Label>
								<div className="scrollbar-hide grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-[14px] border border-black/[0.07] p-2 sm:grid-cols-2">
									{overrideModules.map((moduleKey) => (
										<label
											key={moduleKey}
											className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-[#fbf9f6]"
										>
											<Checkbox
												checked={overrideSelections[moduleKey] === true}
												disabled={
													!editableTabs.permissions ||
													isRoleChangedInDraft ||
													isEditingOwner
												}
												onCheckedChange={() =>
													toggleOverrideSelection(moduleKey)
												}
											/>
											<span>{MODULE_LABELS[moduleKey]}</span>
										</label>
									))}
								</div>
								{isRoleChangedInDraft && (
									<p className="text-xs text-muted-foreground">
										Role changed in this session. Overrides reset to role
										defaults and are read-only until save + reopen.
									</p>
								)}
							</div>
							{staffToEdit?.role === "manager" && currentUserIsOwner && (
								<div className="border-t pt-4 mt-2">
									<Label className="text-sm font-medium mb-2 block">
										Session management
									</Label>
									<label className="flex items-start gap-3 text-sm cursor-pointer">
										<Checkbox
											checked={editCanManageSessions}
											disabled={!editableTabs.permissions}
											onCheckedChange={(checked: boolean | "indeterminate") =>
												setEditCanManageSessions(checked === true)
											}
											className="mt-0.5"
										/>
										<div>
											<span className="font-medium">
												View &amp; revoke all staff sessions
											</span>
											<p className="text-xs text-muted-foreground mt-0.5">
												Lets this manager see and end login sessions for all
												staff on the Sessions tab. Only grant to trusted
												managers.
											</p>
										</div>
									</label>
								</div>
							)}
						</TabsContent>
					</Tabs>
					<DialogFooter className="gap-2 pt-1">
						<Button
							variant="outline"
							className="h-11 rounded-full border-black/10 px-5"
							onClick={() => setEditDialogOpen(false)}
							disabled={savingEdit}
						>
							Cancel
						</Button>
						<Button
							className="h-11 rounded-full px-5"
							onClick={() => setConfirmEditDialogOpen(true)}
							disabled={savingEdit || !isEditDirty}
						>
							{savingEdit ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Updating...
								</>
							) : (
								"Review changes"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ConfirmActionDialog
				open={confirmEditDialogOpen}
				onOpenChange={setConfirmEditDialogOpen}
				title="Review Staff Changes"
				description={
					[
						profileChanged ? `Profile: ${editFirstName} ${editLastName}` : null,
						roleChanged
							? `Role: ${initialEditSnapshot?.role} -> ${editRole}`
							: null,
						locationsChanged
							? `Locations: ${selectedLocationIds.length} selected`
							: null,
						!roleChanged && overridesChanged
							? "Permissions overrides: updated"
							: null,
						roleChanged
							? "Overrides will be reset to the new role defaults."
							: null,
						sessionsChanged
							? `Session management: ${editCanManageSessions ? "granted" : "revoked"}`
							: null,
					]
						.filter(Boolean)
						.join(" | ") ||
					`Apply updates for ${staffToEdit?.profile?.full_name || "this staff member"}?`
				}
				confirmLabel={savingEdit ? "Saving..." : "Save changes"}
				onConfirm={handleSaveEdit}
			/>
		</SalonSidebar>
	);
}
