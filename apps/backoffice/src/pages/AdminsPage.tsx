import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import {
  useBackofficeAuth,
  useBackofficeUsers,
  type BackofficeUserWithTemplate,
  useBackofficeRoleTemplates,
  useSalesOps,
} from "@/hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Badge } from "@ui/badge";
import { Checkbox } from "@ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { Alert, AlertDescription } from "@ui/alert";
import { Loader2, Plus, MoreHorizontal, Shield, Users } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { toast } from "sonner";

const KYC_DOCUMENT_OPTIONS = {
  NG: [
    { value: "drivers_license", label: "Driver's License", requiresBack: true },
    { value: "passport", label: "Passport", requiresBack: false },
    { value: "voters_card", label: "Voter's Card", requiresBack: true },
    { value: "nin", label: "NIN", requiresBack: false },
  ],
  GH: [
    { value: "ghana_card", label: "Ghana Card", requiresBack: true },
    { value: "passport", label: "Passport", requiresBack: false },
    { value: "voters_card", label: "Voter's Card", requiresBack: false },
    { value: "nhis", label: "NHIS", requiresBack: false },
    { value: "drivers_license", label: "Driver's License", requiresBack: true },
  ],
} as const;

const permissionByPageKey: Record<string, string[]> = {
  customers_waitlists: ["customers.view_waitlists"],
  customers_tenants: ["customers.view_tenants"],
  customers_ops_monitor: ["customers.view_ops_monitor"],
  plans: ["plans.view"],
  sales_campaigns: ["sales.manage_campaigns"],
  sales_capture_client: ["sales.capture_client"],
  sales_conversions: ["sales.view_conversions"],
  admins: ["admins.manage"],
  settings: ["settings.view"],
  audit_logs: ["audit_logs.view"],
  impersonation: ["impersonation.view"],
};

function buildMemberName(user: BackofficeUserWithTemplate): string {
  const fullName = user.full_name?.trim();
  if (fullName) return fullName;
  const email = user.email?.trim();
  if (email) return email.split("@")[0] || email;
  return "Unnamed member";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "-";
  try {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
  } catch {
    return "-";
  }
}

function validateAdminInviteEmail(email: string, isSalesAgent: boolean): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "Email address is required.";
  const parts = trimmed.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return "Enter a valid email address.";
  }
  if (!isSalesAgent && parts[1] !== "salonmagik.com") {
    return "Non-sales admins must use a @salonmagik.com email.";
  }
  return null;
}

export default function AdminsPage() {
  const { backofficeUser } = useBackofficeAuth();
  const { users, isLoading, createUser, setUserActive, assignRole } = useBackofficeUsers();
  const {
    templates,
    roleStats,
    permissionKeys,
    pageKeys,
    templatesError,
    keysError,
    upsertTemplate,
    toggleTemplateActive,
  } = useBackofficeRoleTemplates();
  const {
    agentsQuery,
    kycRowsQuery,
    documentsQuery,
    redemptionsQuery,
    commissionsQuery,
    upsertAgentProfile,
    upsertKyc,
    uploadDocument,
  } = useSalesOps();

  const isSuperAdmin = backofficeUser?.role === "super_admin";
  const canManageAdmins = isSuperAdmin;

  const [activeTab, setActiveTab] = useState("team_members");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newIsSalesAgent, setNewIsSalesAgent] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<string[]>([]);
  const [selectedPageKeys, setSelectedPageKeys] = useState<string[]>([]);
  const [pageSearch, setPageSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");

  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<BackofficeUserWithTemplate | null>(null);
  const [selectedPermissionsRoleId, setSelectedPermissionsRoleId] = useState("");

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [kycViewDialogOpen, setKycViewDialogOpen] = useState(false);
  const [conversionsDialogOpen, setConversionsDialogOpen] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<BackofficeUserWithTemplate | null>(null);
  const [profileCountryCode, setProfileCountryCode] = useState<"NG" | "GH">("NG");
  const [profileSalary, setProfileSalary] = useState("0");
  const [profileHireDate, setProfileHireDate] = useState("");
  const [profileDocType, setProfileDocType] = useState<string>("");
  const [profileDocNumber, setProfileDocNumber] = useState("");
  const [profileDocFront, setProfileDocFront] = useState<File | null>(null);
  const [profileDocBack, setProfileDocBack] = useState<File | null>(null);

  const editableRoles = useMemo(() => templates.filter((item) => !item.is_system), [templates]);

  const filteredPageKeys = useMemo(() => {
    const keyword = pageSearch.trim().toLowerCase();
    if (!keyword) return pageKeys;
    return pageKeys.filter(
      (page) =>
        page.label.toLowerCase().includes(keyword) ||
        page.key.toLowerCase().includes(keyword) ||
        page.route_path.toLowerCase().includes(keyword),
    );
  }, [pageKeys, pageSearch]);

  const availablePermissionSet = useMemo(() => {
    const set = new Set<string>();
    selectedPageKeys.forEach((pageKey) => {
      (permissionByPageKey[pageKey] || []).forEach((permission) => set.add(permission));
    });
    return set;
  }, [selectedPageKeys]);

  const filteredPermissionKeys = useMemo(() => {
    const keyword = permissionSearch.trim().toLowerCase();
    return permissionKeys
      .filter((permission) => availablePermissionSet.has(permission.key))
      .filter((permission) => {
        if (!keyword) return true;
        return (
          permission.label.toLowerCase().includes(keyword) ||
          permission.key.toLowerCase().includes(keyword) ||
          (permission.description || "").toLowerCase().includes(keyword)
        );
      });
  }, [permissionKeys, permissionSearch, availablePermissionSet]);

  const agentProfiles = agentsQuery.data || [];
  const kycRows = kycRowsQuery.data || [];
  const kycDocuments = documentsQuery.data || [];
  const redemptions = redemptionsQuery.data || [];
  const commissions = commissionsQuery.data || [];

  const selectedAgentProfile = useMemo(
    () =>
      selectedTeamMember
        ? agentProfiles.find((agent: any) => agent.backoffice_user_id === selectedTeamMember.id) || null
        : null,
    [agentProfiles, selectedTeamMember],
  );

  const selectedKycRow = useMemo(
    () =>
      selectedAgentProfile
        ? kycRows.find((row: any) => row.sales_agent_id === selectedAgentProfile.id) || null
        : null,
    [kycRows, selectedAgentProfile],
  );

  const selectedDocuments = useMemo(
    () =>
      selectedAgentProfile
        ? kycDocuments.filter((row: any) => row.sales_agent_id === selectedAgentProfile.id)
        : [],
    [kycDocuments, selectedAgentProfile],
  );

  const selectedRedemptions = useMemo(
    () =>
      selectedAgentProfile
        ? redemptions.filter((row: any) => row.sales_promo_codes?.agent_id === selectedAgentProfile.id)
        : [],
    [redemptions, selectedAgentProfile],
  );

  const selectedCommissions = useMemo(
    () =>
      selectedAgentProfile
        ? commissions.filter((row: any) => row.agent_id === selectedAgentProfile.id)
        : [],
    [commissions, selectedAgentProfile],
  );
  const inviteEmailError = useMemo(
    () => validateAdminInviteEmail(newEmail, newIsSalesAgent),
    [newEmail, newIsSalesAgent],
  );

  const handleAddUser = async () => {
    if (
      !newEmail.trim() ||
      !newFirstName.trim() ||
      !newLastName.trim() ||
      !newRoleId ||
      inviteEmailError
    ) {
      return;
    }
    await createUser.mutateAsync({
      email: newEmail,
      firstName: newFirstName,
      lastName: newLastName,
      phone: newPhone,
      roleId: newRoleId,
      isSalesAgent: newIsSalesAgent,
    });
    setAddDialogOpen(false);
    setNewEmail("");
    setNewFirstName("");
    setNewLastName("");
    setNewPhone("");
    setNewIsSalesAgent(false);
    setNewRoleId("");
  };

  const openCreateRole = () => {
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setSelectedPermissionKeys([]);
    setSelectedPageKeys([]);
    setPageSearch("");
    setPermissionSearch("");
    setRoleDialogOpen(true);
  };

  const openEditRole = (roleId: string) => {
    const role = templates.find((item) => item.id === roleId);
    if (!role) return;
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setSelectedPermissionKeys(role.permissions);
    setSelectedPageKeys(role.pages);
    setPageSearch("");
    setPermissionSearch("");
    setRoleDialogOpen(true);
  };

  const openPermissionsDialog = (user: BackofficeUserWithTemplate) => {
    if (user.base_role === "super_admin") return;
    setPermissionsUser(user);
    setSelectedPermissionsRoleId(user.role_template_id || "");
    setPermissionsDialogOpen(true);
  };

  const savePermissions = async () => {
    if (!permissionsUser || !selectedPermissionsRoleId) return;
    await assignRole.mutateAsync({
      backofficeUserId: permissionsUser.id,
      roleId: selectedPermissionsRoleId,
    });
    setPermissionsDialogOpen(false);
  };

  const toggleSelection = (current: string[], key: string) =>
    current.includes(key) ? current.filter((item) => item !== key) : [...current, key];

  const handleSaveRole = async () => {
    if (!roleName.trim()) return;
    if (!selectedPageKeys.length) {
      toast.error("Select at least one page/subpage access");
      return;
    }
    await upsertTemplate.mutateAsync({
      id: editingRoleId ?? undefined,
      name: roleName,
      description: roleDescription,
      permissionKeys: selectedPermissionKeys,
      pageKeys: selectedPageKeys,
    });
    setRoleDialogOpen(false);
  };

  const openProfileDialog = (user: BackofficeUserWithTemplate) => {
    setSelectedTeamMember(user);
    const existingAgent = agentProfiles.find((agent: any) => agent.backoffice_user_id === user.id);
    const existingKyc = existingAgent
      ? kycRows.find((row: any) => row.sales_agent_id === existingAgent.id)
      : null;
    const country = ((existingAgent?.country_code as "NG" | "GH" | undefined) || "NG");
    setProfileCountryCode(country);
    setProfileSalary(String(existingAgent?.monthly_base_salary ?? 0));
    setProfileHireDate(existingAgent?.hire_date || "");
    const allowedDocs = KYC_DOCUMENT_OPTIONS[country];
    const existingDocType = existingKyc?.national_id_type;
    setProfileDocType(
      allowedDocs.some((doc) => doc.value === existingDocType)
        ? existingDocType
        : allowedDocs[0]?.value || "",
    );
    setProfileDocNumber(existingKyc?.national_id_number || "");
    setProfileDocFront(null);
    setProfileDocBack(null);
    setProfileDialogOpen(true);
  };

  const openKycDialog = (user: BackofficeUserWithTemplate) => {
    setSelectedTeamMember(user);
    setKycViewDialogOpen(true);
  };

  const openConversionsDialog = (user: BackofficeUserWithTemplate) => {
    setSelectedTeamMember(user);
    setConversionsDialogOpen(true);
  };

  const saveProfile = async () => {
    if (!selectedTeamMember) return;
    const selectedDoc = KYC_DOCUMENT_OPTIONS[profileCountryCode].find((doc) => doc.value === profileDocType);
    if (!selectedDoc) throw new Error("Document type is required");
    if (!profileDocNumber.trim()) throw new Error("Document number is required");
    if (!profileDocFront) throw new Error("Front document image is required");
    if (selectedDoc.requiresBack && !profileDocBack) throw new Error("Back document image is required");

    const agent = await upsertAgentProfile.mutateAsync({
      backofficeUserId: selectedTeamMember.id,
      countryCode: profileCountryCode,
      monthlySalary: Number(profileSalary || 0),
      hireDate: profileHireDate || null,
    });

    await upsertKyc.mutateAsync({
      sales_agent_id: agent.id,
      legal_full_name: selectedTeamMember.full_name || buildMemberName(selectedTeamMember),
      national_id_type: profileDocType,
      national_id_number: profileDocNumber.trim(),
    });

    await uploadDocument.mutateAsync({
      salesAgentId: agent.id,
      documentType: selectedDoc.requiresBack ? `${profileDocType}_front` : profileDocType,
      file: profileDocFront,
    });

    if (selectedDoc.requiresBack && profileDocBack) {
      await uploadDocument.mutateAsync({
        salesAgentId: agent.id,
        documentType: `${profileDocType}_back`,
        file: profileDocBack,
      });
    }

    setProfileDialogOpen(false);
  };

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admins</h1>
            <p className="text-muted-foreground">Manage team members and custom roles.</p>
          </div>
          {canManageAdmins ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openCreateRole}>Create Role</Button>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Admin</DialogTitle>
                    <DialogDescription>
                      Invite a team member and assign a role.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={newIsSalesAgent}
                        onCheckedChange={(checked) => setNewIsSalesAgent(Boolean(checked))}
                      />
                      Is sales agent
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input value={newFirstName} onChange={(event) => setNewFirstName(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Last Name</Label>
                        <Input value={newLastName} onChange={(event) => setNewLastName(event.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input
                        type="email"
                        placeholder={newIsSalesAgent ? "agent@example.com" : "admin@salonmagik.com"}
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                      />
                      {inviteEmailError ? (
                        <p className="text-xs text-destructive">{inviteEmailError}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number (optional)</Label>
                      <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={newRoleId} onValueChange={setNewRoleId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {editableRoles.filter((role) => role.is_active).map((role) => (
                            <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                    <Button
                      onClick={handleAddUser}
                      disabled={
                        createUser.isPending ||
                        !!inviteEmailError ||
                        !newFirstName.trim() ||
                        !newLastName.trim() ||
                        !newRoleId
                      }
                    >
                      {createUser.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Add Admin
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="team_members">Team Members</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="team_members" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" /> Team Members
                </CardTitle>
                <CardDescription>{users.length} backoffice members</CardDescription>
              </CardHeader>
              <CardContent>
                {templatesError ? (
                  <Alert className="mb-4">
                    <AlertDescription>
                      Failed to load roles: {(templatesError as Error).message}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email Address</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>2FA</TableHead>
                        <TableHead>Is Logged In</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Last Activity</TableHead>
                        <TableHead>Date Added</TableHead>
                        <TableHead className="w-[50px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{buildMemberName(user)}</TableCell>
                          <TableCell>{user.email || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={user.base_role === "super_admin" ? "default" : "outline"}>
                              {user.base_role === "super_admin" ? "Super Admin" : user.role_name || "Unassigned"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.status === "active" ? "default" : user.status === "invited" ? "secondary" : "destructive"}>
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.totp_enabled ? <Badge>Enabled</Badge> : <Badge variant="secondary">Not set</Badge>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.is_logged_in ? "default" : "secondary"}>
                              {user.is_logged_in ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatTimestamp(user.last_login_at)}</TableCell>
                          <TableCell>{formatTimestamp(user.last_activity_at)}</TableCell>
                          <TableCell>{formatTimestamp(user.created_at)}</TableCell>
                          <TableCell>
                            {user.base_role !== "super_admin" ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openPermissionsDialog(user)}>Permissions</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openKycDialog(user)}>KYC</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openConversionsDialog(user)}>Conversions/Commissions</DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <a href={`/audit-logs?member=${user.user_id}`}>Audit Log</a>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openProfileDialog(user)}>Update Profile</DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => setUserActive.mutate({ userId: user.id, isActive: !user.is_active })}
                                  >
                                    {user.is_active ? "Deactivate" : "Reactivate"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!users.length ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            No team members found.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Roles</CardTitle>
                <CardDescription>Custom access profiles for non-super-admin team members.</CardDescription>
              </CardHeader>
              <CardContent>
                {keysError ? (
                  <Alert className="mb-4">
                    <AlertDescription>
                      Failed to load role keys: {(keysError as Error).message}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Admins</TableHead>
                      <TableHead>Access - Pages</TableHead>
                      <TableHead>Access - Subpages</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead className="w-[150px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roleStats.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="font-medium">{role.name}</div>
                          <div className="text-xs text-muted-foreground">{role.description || "No description"}</div>
                        </TableCell>
                        <TableCell>{role.admins_count}</TableCell>
                        <TableCell>{role.access_pages_count}</TableCell>
                        <TableCell>{role.access_subpages_count}</TableCell>
                        <TableCell>{role.permissions_count}</TableCell>
                        <TableCell className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditRole(role.id)} disabled={role.is_system}>Edit</Button>
                          <Button
                            size="sm"
                            variant={role.is_active ? "secondary" : "default"}
                            disabled={role.is_system}
                            onClick={() => toggleTemplateActive.mutate({ id: role.id, isActive: !role.is_active })}
                          >
                            {role.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!roleStats.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No roles found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingRoleId ? "Edit Role" : "Create Role"}</DialogTitle>
              <DialogDescription>
                Choose page/subpage access first, then select the permissions available for those scopes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="e.g. Sales Operator" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} placeholder="Optional" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Access (Pages/Subpages)</Label>
                  <Input placeholder="Search access..." value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} />
                  <div className="max-h-56 overflow-y-auto rounded-md border p-3 space-y-3">
                    {filteredPageKeys.map((page) => (
                      <label key={page.key} className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={selectedPageKeys.includes(page.key)}
                          onCheckedChange={() => setSelectedPageKeys((current) => toggleSelection(current, page.key))}
                        />
                        <span>
                          <span className="font-medium">{page.label}</span>
                          <span className="block text-muted-foreground">{page.route_path}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <Input
                    placeholder="Search permissions..."
                    value={permissionSearch}
                    onChange={(event) => setPermissionSearch(event.target.value)}
                    disabled={!selectedPageKeys.length}
                  />
                  <div className="max-h-56 overflow-y-auto rounded-md border p-3 space-y-3">
                    {!selectedPageKeys.length ? (
                      <p className="text-sm text-muted-foreground">Select access first to see permissions.</p>
                    ) : filteredPermissionKeys.length ? (
                      filteredPermissionKeys.map((permission) => (
                        <label key={permission.key} className="flex items-start gap-3 text-sm">
                          <Checkbox
                            checked={selectedPermissionKeys.includes(permission.key)}
                            onCheckedChange={() =>
                              setSelectedPermissionKeys((current) => toggleSelection(current, permission.key))
                            }
                          />
                          <span>
                            <span className="font-medium">{permission.label}</span>
                            <span className="block text-muted-foreground">{permission.key}</span>
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No permissions mapped to selected access.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRole} disabled={!roleName.trim() || upsertTemplate.isPending}>
                {upsertTemplate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Permissions</DialogTitle>
              <DialogDescription>
                Assign a role for {permissionsUser ? buildMemberName(permissionsUser) : "member"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedPermissionsRoleId} onValueChange={setSelectedPermissionsRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {editableRoles.filter((role) => role.is_active).map((role) => (
                    <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>Cancel</Button>
              <Button onClick={savePermissions} disabled={!selectedPermissionsRoleId || assignRole.isPending}>
                {assignRole.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Profile</DialogTitle>
              <DialogDescription>
                Update profile and KYC for {selectedTeamMember ? buildMemberName(selectedTeamMember) : "team member"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select
                    value={profileCountryCode}
                    onValueChange={(value) => {
                      const next = value as "NG" | "GH";
                      setProfileCountryCode(next);
                      const firstDoc = KYC_DOCUMENT_OPTIONS[next][0];
                      setProfileDocType(firstDoc?.value || "");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NG">Nigeria</SelectItem>
                      <SelectItem value="GH">Ghana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hire Date</Label>
                  <Input type="date" value={profileHireDate} onChange={(event) => setProfileHireDate(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Monthly Salary</Label>
                <Input value={profileSalary} onChange={(event) => setProfileSalary(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={profileDocType} onValueChange={setProfileDocType}>
                  <SelectTrigger><SelectValue placeholder="Select document" /></SelectTrigger>
                  <SelectContent>
                    {KYC_DOCUMENT_OPTIONS[profileCountryCode].map((doc) => (
                      <SelectItem key={doc.value} value={doc.value}>{doc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Document Number</Label>
                <Input value={profileDocNumber} onChange={(event) => setProfileDocNumber(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Front Snapshot</Label>
                <Input type="file" onChange={(event) => setProfileDocFront(event.target.files?.[0] || null)} />
              </div>
              {(KYC_DOCUMENT_OPTIONS[profileCountryCode].find((doc) => doc.value === profileDocType)?.requiresBack ?? false) ? (
                <div className="space-y-2">
                  <Label>Back Snapshot</Label>
                  <Input type="file" onChange={(event) => setProfileDocBack(event.target.files?.[0] || null)} />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  try {
                    await saveProfile();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to save profile");
                  }
                }}
                disabled={upsertAgentProfile.isPending || upsertKyc.isPending || uploadDocument.isPending}
              >
                {(upsertAgentProfile.isPending || upsertKyc.isPending || uploadDocument.isPending) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={kycViewDialogOpen} onOpenChange={setKycViewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>KYC</DialogTitle>
            </DialogHeader>
            {selectedAgentProfile ? (
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Document type:</span> {selectedKycRow?.national_id_type || "Not set"}</p>
                <p><span className="font-medium">Document number:</span> {selectedKycRow?.national_id_number || "Not set"}</p>
                <p><span className="font-medium">Status:</span> {selectedKycRow?.verification_status || "pending"}</p>
                <div className="space-y-1">
                  <p className="font-medium">Snapshots</p>
                  {selectedDocuments.map((doc: any) => (
                    <p key={doc.id} className="text-muted-foreground">{doc.document_type} · {doc.review_status}</p>
                  ))}
                  {!selectedDocuments.length ? <p className="text-muted-foreground">No snapshots uploaded.</p> : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No profile found for this member.</p>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={conversionsDialogOpen} onOpenChange={setConversionsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Conversions & Commissions</DialogTitle>
            </DialogHeader>
            {selectedAgentProfile ? (
              <Tabs defaultValue="redemptions">
                <TabsList>
                  <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
                  <TabsTrigger value="commissions">Commissions</TabsTrigger>
                </TabsList>
                <TabsContent value="redemptions" className="space-y-2">
                  {selectedRedemptions.map((row: any) => (
                    <div key={row.id} className="rounded border p-2 text-sm">
                      <p className="font-medium">{row.owner_email}</p>
                      <p className="text-muted-foreground">{row.status}</p>
                    </div>
                  ))}
                  {!selectedRedemptions.length ? <p className="text-sm text-muted-foreground">No redemptions yet.</p> : null}
                </TabsContent>
                <TabsContent value="commissions" className="space-y-2">
                  {selectedCommissions.map((row: any) => (
                    <div key={row.id} className="rounded border p-2 text-sm">
                      <p className="font-medium">{row.payment_reference || "Pending reference"}</p>
                      <p className="text-muted-foreground">{row.status} · {Number(row.total_amount || 0).toLocaleString()}</p>
                    </div>
                  ))}
                  {!selectedCommissions.length ? <p className="text-sm text-muted-foreground">No commissions yet.</p> : null}
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-sm text-muted-foreground">No profile found for this member.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
