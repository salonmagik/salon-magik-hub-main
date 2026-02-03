import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Mail, MessageSquare, Loader2, Info } from "lucide-react";
import { useEmailTemplates, type TemplateType, defaultTemplates, templateTypeLabels } from "@/hooks/useEmailTemplates";
import { cn } from "@/lib/utils";

interface EditTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: TemplateType | null;
}

const templateVariables: Record<TemplateType, string[]> = {
  appointment_confirmation: ["customer_name", "appointment_date", "appointment_time", "service_name"],
  appointment_reminder: ["customer_name", "appointment_date", "appointment_time", "service_name"],
  appointment_cancelled: ["customer_name", "appointment_date"],
  booking_confirmation: ["customer_name", "appointment_date", "appointment_time"],
  payment_receipt: ["customer_name", "amount", "transaction_id"],
  refund_confirmation: ["customer_name", "amount"],
  staff_invitation: ["staff_name", "salon_name", "role", "invitation_link"],
  welcome: ["customer_name", "salon_name"],
};

export function EditTemplateDialog({ open, onOpenChange, templateType }: EditTemplateDialogProps) {
  const { getTemplate, getTemplateOrDefault, upsertTemplate } = useEmailTemplates();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [channel, setChannel] = useState<"email" | "sms">("email");

  useEffect(() => {
    if (templateType && open) {
      const existingTemplate = getTemplate(templateType);
      if (existingTemplate) {
        setSubject(existingTemplate.subject);
        setBodyHtml(existingTemplate.body_html);
        setIsActive(existingTemplate.is_active);
      } else {
        const defaults = defaultTemplates[templateType];
        setSubject(defaults.subject);
        setBodyHtml(defaults.body_html);
        setIsActive(true);
      }
      setChannel("email");
    }
  }, [templateType, open, getTemplate]);

  const handleSubmit = async () => {
    if (!templateType) return;
    
    setIsSubmitting(true);
    try {
      await upsertTemplate(templateType, {
        subject,
        body_html: bodyHtml,
        is_active: isActive,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToDefault = () => {
    if (!templateType) return;
    const defaults = defaultTemplates[templateType];
    setSubject(defaults.subject);
    setBodyHtml(defaults.body_html);
  };

  const insertVariable = (variable: string) => {
    setBodyHtml((prev) => prev + `{{${variable}}}`);
  };

  const charCount = bodyHtml.length;
  const smsSegments = Math.ceil(charCount / 160);

  if (!templateType) return null;

  const variables = templateVariables[templateType] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Edit Template</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {templateTypeLabels[templateType]}
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Channel Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Channel</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={channel === "email" ? "default" : "secondary"} className="cursor-pointer" onClick={() => setChannel("email")}>
                <Mail className="w-3 h-3 mr-1" />
                Email
              </Badge>
              <Badge variant={channel === "sms" ? "default" : "secondary"} className="cursor-pointer opacity-50" title="SMS coming soon">
                <MessageSquare className="w-3 h-3 mr-1" />
                SMS
              </Badge>
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is-active">Enable this template</Label>
            <Switch id="is-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label>Subject Line</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
            />
          </div>

          {/* Variables Helper */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Available Variables</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => insertVariable(v)}
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Email Body (HTML)</Label>
              {channel === "sms" && (
                <span className={cn(
                  "text-xs",
                  charCount > 160 ? "text-warning-foreground" : "text-muted-foreground"
                )}>
                  {charCount}/160 ({smsSegments} segment{smsSegments !== 1 ? "s" : ""})
                </span>
              )}
            </div>
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="Enter email content..."
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          {/* Preview Info */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <p>
              <strong>Tip:</strong> Use HTML tags for formatting. Variables like{" "}
              <code className="bg-muted px-1 rounded">{"{{customer_name}}"}</code> will be replaced with actual values when the email is sent.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button type="button" variant="ghost" onClick={handleResetToDefault} disabled={isSubmitting}>
            Reset to Default
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
