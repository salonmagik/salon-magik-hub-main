import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsAppTemplates, type CreateTemplateOptions, type UpdateTemplateOptions } from "@/hooks/useWhatsAppTemplates";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Loader2, Plus, Edit, Trash2, RefreshCw, FileText, ExternalLink } from "lucide-react";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type WhatsAppTemplate = Tables<"whatsapp_templates">;

interface TemplateFormData {
  templateName: string;
  templateContent: string;
  variables: string[];
  provider: "termii" | "meta";
}

export function WhatsAppTemplateManager() {
  const { currentTenant } = useAuth();
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate, checkStatus } = useWhatsAppTemplates({
    tenantId: currentTenant?.id || "",
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<TemplateFormData>({
    templateName: "",
    templateContent: "",
    variables: [],
    provider: "termii",
  });
  const [variableInput, setVariableInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleCreateOpen = () => {
    setFormData({
      templateName: "",
      templateContent: "",
      variables: [],
      provider: "termii",
    });
    setVariableInput("");
    setCreateDialogOpen(true);
  };

  const handleEditOpen = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      templateName: template.template_name,
      templateContent: template.template_content,
      variables: template.variables || [],
      provider: template.provider as "termii" | "meta",
    });
    setVariableInput("");
    setEditDialogOpen(true);
  };

  const handleDeleteOpen = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleAddVariable = () => {
    if (!variableInput.trim()) return;
    
    if (formData.variables.includes(variableInput.trim())) {
      toast({ title: "Error", description: "Variable already exists", variant: "destructive" });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      variables: [...prev.variables, variableInput.trim()],
    }));
    setVariableInput("");
  };

  const handleRemoveVariable = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.templateName.trim()) {
      toast({ title: "Error", description: "Template name is required", variant: "destructive" });
      return false;
    }

    if (!formData.templateContent.trim()) {
      toast({ title: "Error", description: "Template content is required", variant: "destructive" });
      return false;
    }

    // Validate placeholder count matches variables array length
    const placeholderPattern = /\{\{(\d+)\}\}/g;
    const placeholders = formData.templateContent.match(placeholderPattern);
    const placeholderCount = placeholders ? placeholders.length : 0;

    if (placeholderCount !== formData.variables.length) {
      toast({
        title: "Error",
        description: `Template has ${placeholderCount} placeholders but ${formData.variables.length} variables defined. They must match.`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    const result = await createTemplate({
      templateName: formData.templateName,
      templateContent: formData.templateContent,
      variables: formData.variables,
      provider: formData.provider,
    });
    setIsSaving(false);

    if (result) {
      setCreateDialogOpen(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTemplate) return;
    if (!validateForm()) return;

    setIsSaving(true);
    const result = await updateTemplate({
      id: selectedTemplate.id,
      templateName: formData.templateName,
      templateContent: formData.templateContent,
      variables: formData.variables,
    });
    setIsSaving(false);

    if (result) {
      setEditDialogOpen(false);
      setSelectedTemplate(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    const success = await deleteTemplate(selectedTemplate.id);
    
    if (success) {
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
    }
  };

  const handleCheckStatus = async (template: WhatsAppTemplate) => {
    setCheckingStatus(template.id);
    await checkStatus(template.id);
    setCheckingStatus(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canEdit = (template: WhatsAppTemplate) => {
    return template.status === "pending" || template.status === "rejected";
  };

  const canDelete = (template: WhatsAppTemplate) => {
    return template.status === "pending" || template.status === "rejected";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>WhatsApp Templates</CardTitle>
              <CardDescription>
                Manage your WhatsApp message templates. Templates must be approved before use.
              </CardDescription>
            </div>
            <Button onClick={handleCreateOpen}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first template to start sending WhatsApp messages.
              </p>
              <Button onClick={handleCreateOpen}>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.template_name}</TableCell>
                    <TableCell>{getStatusBadge(template.status)}</TableCell>
                    <TableCell>
                      {template.variables && template.variables.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {template.variables.map((variable, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {`{{${idx + 1}}}`}: {variable}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{template.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(template.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCheckStatus(template)}
                          disabled={checkingStatus === template.id}
                          title="Check Status"
                        >
                          {checkingStatus === template.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        {canEdit(template) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditOpen(template)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete(template) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteOpen(template)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create WhatsApp Template</DialogTitle>
            <DialogDescription>
              Create a new WhatsApp template. Use placeholders like {`{{1}}`}, {`{{2}}`} for dynamic content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Template Name</Label>
              <Input
                id="create-name"
                placeholder="e.g., appointment_reminder"
                value={formData.templateName}
                onChange={(e) => setFormData((prev) => ({ ...prev, templateName: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(value: "termii" | "meta") =>
                  setFormData((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger id="create-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="termii">Termii</SelectItem>
                  <SelectItem value="meta">Meta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-content">Template Content</Label>
              <Textarea
                id="create-content"
                placeholder={`Hello {{1}}, your appointment is scheduled for {{2}}. See you then!`}
                value={formData.templateContent}
                onChange={(e) => setFormData((prev) => ({ ...prev, templateContent: e.target.value }))}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {`{{1}}`}, {`{{2}}`}, etc. for variables. The number corresponds to the variable position.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Variables</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Variable name (e.g., customer_name)"
                  value={variableInput}
                  onChange={(e) => setVariableInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddVariable();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddVariable} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.variables.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.variables.map((variable, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      {`{{${idx + 1}}}`}: {variable}
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(idx)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Add variables in order. {`{{1}}`} will use the first variable, {`{{2}}`} the second, etc.
              </p>
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-1">Template Preview:</p>
              <p className="text-sm">{formData.templateContent || "Your template content will appear here..."}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit WhatsApp Template</DialogTitle>
            <DialogDescription>
              Update your WhatsApp template. Only pending or rejected templates can be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Template Name</Label>
              <Input
                id="edit-name"
                placeholder="e.g., appointment_reminder"
                value={formData.templateName}
                onChange={(e) => setFormData((prev) => ({ ...prev, templateName: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Input value={formData.provider} disabled />
              <p className="text-xs text-muted-foreground">Provider cannot be changed after creation.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">Template Content</Label>
              <Textarea
                id="edit-content"
                placeholder={`Hello {{1}}, your appointment is scheduled for {{2}}. See you then!`}
                value={formData.templateContent}
                onChange={(e) => setFormData((prev) => ({ ...prev, templateContent: e.target.value }))}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {`{{1}}`}, {`{{2}}`}, etc. for variables. The number corresponds to the variable position.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Variables</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Variable name (e.g., customer_name)"
                  value={variableInput}
                  onChange={(e) => setVariableInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddVariable();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddVariable} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.variables.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.variables.map((variable, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      {`{{${idx + 1}}}`}: {variable}
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(idx)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Add variables in order. {`{{1}}`} will use the first variable, {`{{2}}`} the second, etc.
              </p>
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-1">Template Preview:</p>
              <p className="text-sm">{formData.templateContent || "Your template content will appear here..."}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTemplate?.template_name}"? This action cannot be undone.
              Only pending or rejected templates can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
