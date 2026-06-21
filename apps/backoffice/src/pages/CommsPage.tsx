import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { toast } from "sonner";
import { MessageSquareText, Pencil } from "lucide-react";

type PlatformTemplate = {
  id: string;
  channel: "email" | "sms";
  template_key: string;
  category: string;
  label: string;
  description: string | null;
  subject: string | null;
  body: string;
  is_active: boolean;
};

type TemplateEditorState = {
  id: string | null;
  channel: "email" | "sms";
  template_key: string;
  category: string;
  label: string;
  description: string;
  subject: string;
  body: string;
  is_active: boolean;
};

const emptyEditorState: TemplateEditorState = {
  id: null,
  channel: "email",
  template_key: "",
  category: "operations",
  label: "",
  description: "",
  subject: "",
  body: "",
  is_active: true,
};

// Keep this in sync with the `templateValues` object each edge function actually
// supplies to renderPlatformTemplate(). A placeholder not in this list will render
// as a literal "{{...}}" in the sent email — see send-staff-invitation's
// {{staff_name}} incident for why this is enforced, not just documented.
const KNOWN_TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  email_verification: ["first_name", "verification_link"],
  staff_invitation: ["first_name", "staff_name", "email", "salon_name", "role", "login_link", "temp_password"],
  daily_digest: [
    "first_name",
    "salon_name",
    "digest_date",
    "upcoming_appointments_count",
    "payments_received",
    "outstanding_balances",
    "cta_link",
  ],
};

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/[{}\s]/g, "")))];
}

export default function CommsPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<TemplateEditorState>(emptyEditorState);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["platform-message-templates"],
    queryFn: async (): Promise<PlatformTemplate[]> => {
      const { data, error } = await supabase
        .from("platform_message_templates")
        .select("*")
        .order("category", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data || []) as PlatformTemplate[];
    },
  });

  const groupedTemplates = useMemo(() => {
    return templates.reduce<Record<string, PlatformTemplate[]>>((acc, template) => {
      const key = template.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(template);
      return acc;
    }, {});
  }, [templates]);

  const upsertTemplate = useMutation({
    mutationFn: async (payload: TemplateEditorState) => {
      const knownPlaceholders = KNOWN_TEMPLATE_PLACEHOLDERS[payload.template_key.trim()];
      if (knownPlaceholders) {
        const usedPlaceholders = extractPlaceholders(`${payload.subject} ${payload.body}`);
        const unknown = usedPlaceholders.filter((p) => !knownPlaceholders.includes(p));
        if (unknown.length > 0) {
          throw new Error(
            `Unknown placeholder${unknown.length > 1 ? "s" : ""} for "${payload.template_key}": ${unknown
              .map((p) => `{{${p}}}`)
              .join(", ")}. Valid placeholders: ${knownPlaceholders.map((p) => `{{${p}}}`).join(", ")}.`,
          );
        }
      }

      const record = {
        channel: payload.channel,
        template_key: payload.template_key.trim(),
        category: payload.category.trim(),
        label: payload.label.trim(),
        description: payload.description.trim() || null,
        subject: payload.channel === "email" ? payload.subject.trim() || null : null,
        body: payload.body,
        is_active: payload.is_active,
      };

      if (payload.id) {
        const { error } = await supabase
          .from("platform_message_templates")
          .update(record)
          .eq("id", payload.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("platform_message_templates").insert(record);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template saved");
      setEditorOpen(false);
      setEditorState(emptyEditorState);
      queryClient.invalidateQueries({ queryKey: ["platform-message-templates"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save template");
    },
  });

  const handleEdit = (template: PlatformTemplate) => {
    setEditorState({
      id: template.id,
      channel: template.channel,
      template_key: template.template_key,
      category: template.category,
      label: template.label,
      description: template.description || "",
      subject: template.subject || "",
      body: template.body,
      is_active: template.is_active,
    });
    setEditorOpen(true);
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Comms</h1>
            <p className="mt-1 text-muted-foreground">
              Manage platform-owned transactional and lifecycle templates outside salon-admin.
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              setEditorState(emptyEditorState);
              setEditorOpen(true);
            }}
          >
            <MessageSquareText className="h-4 w-4" />
            New Template
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ownership split</CardTitle>
            <CardDescription>
              Salon-admin now owns only appointment-related automations. Platform-level emails and SMS templates live here.
            </CardDescription>
          </CardHeader>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Loading templates...</CardContent>
          </Card>
        ) : (
          Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="capitalize">{category.replace(/_/g, " ")}</CardTitle>
                <CardDescription>
                  {categoryTemplates.length} template{categoryTemplates.length === 1 ? "" : "s"} in this category.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {categoryTemplates.map((template) => (
                  <div key={template.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{template.label}</div>
                          <Badge variant="outline">{template.channel.toUpperCase()}</Badge>
                          <Badge variant={template.is_active ? "default" : "secondary"}>
                            {template.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{template.template_key}</div>
                        {template.description ? (
                          <div className="mt-2 text-sm text-muted-foreground">{template.description}</div>
                        ) : null}
                        {template.subject ? (
                          <div className="mt-3 text-sm">
                            <span className="font-medium">Subject:</span> {template.subject}
                          </div>
                        ) : null}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(template)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editorState.id ? "Edit Template" : "New Template"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={editorState.label}
                  onChange={(event) => setEditorState((current) => ({ ...current, label: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Template key</Label>
                <Input
                  value={editorState.template_key}
                  onChange={(event) => setEditorState((current) => ({ ...current, template_key: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={editorState.channel}
                  onValueChange={(value) => setEditorState((current) => ({ ...current, channel: value as "email" | "sms" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={editorState.category}
                  onChange={(event) => setEditorState((current) => ({ ...current, category: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editorState.description}
                onChange={(event) => setEditorState((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            {editorState.channel === "email" ? (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={editorState.subject}
                  onChange={(event) => setEditorState((current) => ({ ...current, subject: event.target.value }))}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                rows={12}
                value={editorState.body}
                onChange={(event) => setEditorState((current) => ({ ...current, body: event.target.value }))}
              />
              {(() => {
                const known = KNOWN_TEMPLATE_PLACEHOLDERS[editorState.template_key.trim()];
                if (known) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      Available placeholders for <span className="font-mono">{editorState.template_key}</span>:{" "}
                      {known.map((p) => (
                        <span key={p} className="mr-1.5 font-mono">{`{{${p}}}`}</span>
                      ))}
                    </p>
                  );
                }
                return (
                  <p className="text-xs text-muted-foreground">
                    No registered placeholder list for this template key — double-check the actual edge function
                    before using any <span className="font-mono">{"{{...}}"}</span> placeholders, since an unknown
                    one will show up literally in the sent email instead of being replaced.
                  </p>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                Brand styling (logo, colors, footer) is applied automatically around this body when the email is
                sent — only write the message content here, not a full HTML document.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div>
                <div className="font-medium">Active</div>
                <div className="text-sm text-muted-foreground">Inactive templates stay in the system but are not used at runtime.</div>
              </div>
              <Switch
                checked={editorState.is_active}
                onCheckedChange={(checked) => setEditorState((current) => ({ ...current, is_active: checked }))}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => upsertTemplate.mutate(editorState)} disabled={upsertTemplate.isPending}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
}
