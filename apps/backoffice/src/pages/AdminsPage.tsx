import { useMemo, useState } from "react";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import {
  useBackofficeAuth,
  useBackofficeUsers,
  type BackofficeUserWithTemplate,
  useBackofficeRoleTemplates,
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
import { Loader2, Plus, MoreHorizontal, Trash2, Shield, Users, Lock } from "lucide-react";
import { format } from "date-fns";

export default function AdminsPage() {
  const { backofficeUser } = useBackofficeAuth();
  const { users, isLoading, createUser, deleteUser } = useBackofficeUsers();
  const { templates, permissionKeys, pageKeys, assignTemplate, upsertTemplate, toggleTemplateActive } = useBackofficeRoleTemplates();
  const isSuperAdmin = backofficeUser?.role === "super_admin";

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "support_agent">("support_agent");
  const [newTemplateId, setNewTemplateId] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<string[]>([]);
  const [selectedPageKeys, setSelectedPageKeys] = useState<string[]>([]);

  const editableTemplates = useMemo(
    () => templates.filter((template) => !template.is_system),
    [templates],
  );

  const handleAddUser = async () => {
    if (!newEmail.trim()) return;
    const created = await createUser.mutateAsync({ email: newEmail, role: newRole });
    if (newRole !== "super_admin" && newTemplateId && created.backofficeUserId) {
      await assignTemplate.mutateAsync({
        backofficeUserId: created.backofficeUserId,
        roleTemplateId: newTemplateId,
      });
    }
    setAddDialogOpen(false);
    setNewEmail("");
    setNewRole("support_agent");
    setNewTemplateId("");
  };

  const handleDeleteUser = async (userId: string) => {
    await deleteUser.mutateAsync(userId);
    setDeleteConfirmId(null);
  };

  const openCreateTemplate = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setSelectedPermissionKeys([]);
    setSelectedPageKeys([]);
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setSelectedPermissionKeys(template.permissions);
    setSelectedPageKeys(template.pages);
    setTemplateDialogOpen(true);
  };

  const toggleSelection = (current: string[], key: string) =>
    current.includes(key) ? current.filter((item) => item !== key) : [...current, key];

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    await upsertTemplate.mutateAsync({
      id: editingTemplateId ?? undefined,
      name: templateName,
      description: templateDescription,
      permissionKeys: selectedPermissionKeys,
      pageKeys: selectedPageKeys,
    });
    setTemplateDialogOpen(false);
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      super_admin: "default",
      admin: "secondary",
      support_agent: "outline",
    };
    return (
      <Badge variant={variants[role] || "outline"} className="capitalize">
        {role.replace("_", " ")}
      </Badge>
    );
  };

  if (!isSuperAdmin) {
    return (
      <BackofficeLayout>
        <div className="p-6">
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Only Super Admins can manage BackOffice users.
            </AlertDescription>
          </Alert>
        </div>
      </BackofficeLayout>
    );
  }

  return (
    <BackofficeLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BackOffice Admins</h1>
            <p className="text-muted-foreground">
              Manage administrators who have access to the BackOffice
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openCreateTemplate}>
              Manage Templates
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Admin
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add BackOffice Admin</DialogTitle>
                <DialogDescription>
                  Add a new administrator. They must have an email from an allowed domain.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@salonmagik.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="support_agent">Support Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template">Role template</Label>
                  <Select value={newTemplateId} onValueChange={setNewTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddUser}
                  disabled={createUser.isPending || !newEmail.trim() || !newTemplateId}
                >
                  {createUser.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Admin
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              {users?.length || 0} BackOffice administrators
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email_domain}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        {(() => {
                          const assignment = (user as BackofficeUserWithTemplate)
                            .backoffice_user_role_assignments as
                            | {
                                role_template_id?: string;
                                backoffice_role_templates?: { name?: string } | null;
                              }
                            | {
                                role_template_id?: string;
                                backoffice_role_templates?: { name?: string } | null;
                              }[]
                            | null
                            | undefined;
                          const selectedTemplateId = Array.isArray(assignment)
                            ? assignment[0]?.role_template_id
                            : assignment?.role_template_id;
                          const selectedTemplateName = Array.isArray(assignment)
                            ? assignment[0]?.backoffice_role_templates?.name
                            : assignment?.backoffice_role_templates?.name;

                          if (user.role === "super_admin") return "System role";

                          return (
                            <Select
                              value={selectedTemplateId || ""}
                              onValueChange={(templateId) =>
                                assignTemplate.mutate({
                                  backofficeUserId: user.id,
                                  roleTemplateId: templateId,
                                })
                              }
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder={selectedTemplateName || "Unassigned"} />
                              </SelectTrigger>
                              <SelectContent>
                                {editableTemplates
                                  .filter((template) => template.is_active)
                                  .map((template) => (
                                    <SelectItem key={template.id} value={template.id}>
                                      {template.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {user.totp_enabled ? (
                          <Badge variant="default">
                            <Shield className="h-3 w-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not set</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.last_login_at
                          ? format(new Date(user.last_login_at), "MMM d, yyyy")
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {user.user_id !== backofficeUser?.user_id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteConfirmId(user.user_id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!users || users.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No BackOffice users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Templates</CardTitle>
            <CardDescription>
              Configure page and action permissions for non-super-admin users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {editableTemplates.map((template) => (
              <div key={template.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground">{template.description || "No description"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {template.pages.length} page scopes · {template.permissions.length} action permissions
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={template.is_active ? "default" : "secondary"}>
                      {template.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openEditTemplate(template.id)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={template.is_active ? "secondary" : "default"}
                      onClick={() =>
                        toggleTemplateActive.mutate({
                          id: template.id,
                          isActive: !template.is_active,
                        })
                      }
                    >
                      {template.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!editableTemplates.length && (
              <p className="text-sm text-muted-foreground">No custom templates created yet.</p>
            )}
          </CardContent>
        </Card>

        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingTemplateId ? "Edit role template" : "Create role template"}</DialogTitle>
              <DialogDescription>
                Select the pages and actions this template is allowed to access.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="e.g. Sales Agent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={templateDescription}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Page access</Label>
                  <div className="max-h-56 overflow-y-auto rounded-md border p-3 space-y-3">
                    {pageKeys.map((page) => (
                      <label key={page.key} className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={selectedPageKeys.includes(page.key)}
                          onCheckedChange={() =>
                            setSelectedPageKeys((current) => toggleSelection(current, page.key))
                          }
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
                  <Label>Action permissions</Label>
                  <div className="max-h-56 overflow-y-auto rounded-md border p-3 space-y-3">
                    {permissionKeys.map((permission) => (
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
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || upsertTemplate.isPending}
              >
                {upsertTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove BackOffice Admin</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this administrator? They will lose access to the BackOffice immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirmId && handleDeleteUser(deleteConfirmId)}
                disabled={deleteUser.isPending}
              >
                {deleteUser.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Remove Admin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
