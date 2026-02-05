import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Mail, Edit, Eye, RotateCcw } from "lucide-react";

// Email template type definitions
const EMAIL_TEMPLATE_TYPES = [
  { type: "appointment_confirmation", label: "Appointment Confirmation", category: "appointments" },
  { type: "appointment_reminder", label: "Appointment Reminder", category: "appointments" },
  { type: "appointment_cancelled", label: "Appointment Cancelled", category: "appointments" },
  { type: "appointment_rescheduled", label: "Appointment Rescheduled", category: "appointments" },
  { type: "booking_confirmation", label: "Booking Confirmation", category: "appointments" },
  { type: "payment_received", label: "Payment Received", category: "payments" },
  { type: "refund_processed", label: "Refund Processed", category: "payments" },
  { type: "store_credit_added", label: "Store Credit Added", category: "payments" },
  { type: "welcome_email", label: "Welcome Email", category: "account" },
  { type: "password_reset", label: "Password Reset", category: "account" },
  { type: "staff_invitation", label: "Staff Invitation", category: "account" },
];

// Default email templates
const DEFAULT_TEMPLATES: Record<string, { subject: string; body_html: string }> = {
  appointment_confirmation: {
    subject: "Your appointment is confirmed - {{salon_name}}",
    body_html: "<p>Hi {{customer_name}},</p><p>Your appointment at {{salon_name}} is confirmed for {{appointment_date}} at {{appointment_time}}.</p><p>Services: {{services}}</p><p>See you soon!</p>",
  },
  appointment_reminder: {
    subject: "Reminder: Your appointment tomorrow - {{salon_name}}",
    body_html: "<p>Hi {{customer_name}},</p><p>This is a friendly reminder about your appointment at {{salon_name}} tomorrow at {{appointment_time}}.</p><p>See you soon!</p>",
  },
};

interface EmailTemplate {
  id: string;
  template_type: string;
  subject: string;
  body_html: string;
  is_active: boolean;
  channel: string;
}

export default function EmailTemplatesPage() {
  const queryClient = useQueryClient();
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ subject: "", body_html: "" });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("template_type");
      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!tenantId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; subject: string; body_html: string }) => {
      const { error } = await supabase
        .from("email_templates")
        .update({
          subject: data.subject,
          body_html: data.body_html,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates", tenantId] });
      toast.success("Template updated");
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("email_templates")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates", tenantId] });
    },
    onError: (error) => {
      toast.error("Failed to toggle: " + error.message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (templateType: string) => {
      const defaultTemplate = DEFAULT_TEMPLATES[templateType];
      if (!defaultTemplate || !selectedTemplate) return;

      const { error } = await supabase
        .from("email_templates")
        .update({
          subject: defaultTemplate.subject,
          body_html: defaultTemplate.body_html,
        })
        .eq("id", selectedTemplate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates", tenantId] });
      toast.success("Template reset to default");
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to reset: " + error.message);
    },
  });

  const openEditDialog = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      subject: template.subject,
      body_html: template.body_html,
    });
    setEditDialogOpen(true);
  };

  const openPreviewDialog = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setPreviewDialogOpen(true);
  };

  const handleSave = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({
      id: selectedTemplate.id,
      subject: editForm.subject,
      body_html: editForm.body_html,
    });
  };

  const getTemplateLabel = (type: string) => {
    const templateDef = EMAIL_TEMPLATE_TYPES.find((t) => t.type === type);
    return templateDef?.label || type.replace(/_/g, " ");
  };

  const getTemplateCategory = (type: string) => {
    const templateDef = EMAIL_TEMPLATE_TYPES.find((t) => t.type === type);
    return templateDef?.category || "other";
  };


  const templatesByCategory = templates?.reduce((acc, template) => {
    const category = getTemplateCategory(template.template_type);
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>) || {};

  const categories = Object.keys(templatesByCategory);

  return (
    <SalonSidebar>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
          <div className="p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
              <p className="text-muted-foreground">
                Customize the emails sent to your customers
              </p>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : templates?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No email templates configured yet.
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue={categories[0] || "appointments"}>
                <TabsList>
                  {categories.map((category) => (
                    <TabsTrigger key={category} value={category} className="capitalize">
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {categories.map((category) => (
                  <TabsContent key={category} value={category} className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 capitalize">
                          <Mail className="h-5 w-5" />
                          {category} Templates
                        </CardTitle>
                        <CardDescription>
                          {templatesByCategory[category]?.length || 0} templates
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Template</TableHead>
                              <TableHead>Subject</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {templatesByCategory[category]?.map((template) => (
                              <TableRow key={template.id}>
                                <TableCell className="font-medium">
                                  {getTemplateLabel(template.template_type)}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {template.subject}
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={template.is_active}
                                    onCheckedChange={(checked) =>
                                      toggleMutation.mutate({
                                        id: template.id,
                                        is_active: checked,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openPreviewDialog(template)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditDialog(template)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Edit: {selectedTemplate && getTemplateLabel(selectedTemplate.template_type)}
                  </DialogTitle>
                  <DialogDescription>
                    Customize the email content. Use placeholders like {`{{customer_name}}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Subject</Label>
                    <Input
                      value={editForm.subject}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Body (HTML)</Label>
                    <Textarea
                      value={editForm.body_html}
                      onChange={(e) => setEditForm({ ...editForm, body_html: e.target.value })}
                      rows={15}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Available placeholders:</p>
                    <p className="mt-1">
                      {`{{customer_name}}, {{salon_name}}, {{appointment_date}}, {{appointment_time}}, {{services}}, {{total_amount}}`}
                    </p>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => selectedTemplate && resetMutation.mutate(selectedTemplate.template_type)}
                    disabled={resetMutation.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset to Default
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={updateMutation.isPending}>
                      Save Changes
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Preview: {selectedTemplate && getTemplateLabel(selectedTemplate.template_type)}
                  </DialogTitle>
                  <DialogDescription>Subject: {selectedTemplate?.subject}</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div
                    className="border rounded-lg p-4 bg-white"
                    dangerouslySetInnerHTML={{ __html: selectedTemplate?.body_html || "" }}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={() => setPreviewDialogOpen(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </SalonSidebar>
  );
}
