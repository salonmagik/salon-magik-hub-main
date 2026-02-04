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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, MessageSquare, Loader2, Info, AlertTriangle } from "lucide-react";
import { useEmailTemplates, type TemplateType, defaultTemplates, templateTypeLabels } from "@/hooks/useEmailTemplates";
import { cn } from "@/lib/utils";

interface EditTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: TemplateType | null;
}

// Required variables for each template type
const templateVariables: Record<TemplateType, string[]> = {
  // Existing
  appointment_confirmation: ["customer_name", "appointment_date", "appointment_time", "service_name", "salon_name", "location_name", "cta_link"],
  appointment_reminder: ["customer_name", "appointment_date", "appointment_time", "service_name", "salon_name", "cta_link"],
  appointment_cancelled: ["customer_name", "appointment_date", "salon_name"],
  booking_confirmation: ["customer_name", "appointment_date", "appointment_time", "salon_name"],
  payment_receipt: ["customer_name", "amount", "transaction_id", "salon_name"],
  refund_confirmation: ["customer_name", "amount", "refund_method", "salon_name"],
  staff_invitation: ["staff_name", "salon_name", "role", "invitation_link"],
  welcome: ["customer_name", "salon_name"],
  // Auth
  password_reset: ["reset_link"],
  password_changed: [],
  email_verification: ["first_name", "verification_link"],
  welcome_owner: ["first_name", "cta_link"],
  // Appointments
  service_started: ["customer_name", "salon_name"],
  buffer_requested: ["customer_name", "salon_name", "buffer_duration", "accept_link", "reschedule_link"],
  service_change_approval: ["customer_name", "salon_name", "old_service", "new_service", "amount", "approve_link"],
  // Subscription
  trial_ending_7d: ["first_name", "cta_link"],
  trial_ending_3h: ["first_name", "cta_link"],
  payment_failed: ["first_name", "cta_link"],
  // Commerce
  store_credit_restored: ["customer_name", "salon_name", "amount"],
  gift_received: ["recipient_name", "sender_name", "custom_message", "service_name", "view_link"],
  voucher_applied: ["customer_name", "salon_name"],
};

// Validate that required variables are present
const validateTemplate = (type: TemplateType, bodyHtml: string): string[] => {
  const requiredVars = templateVariables[type] || [];
  const missingVars = requiredVars.filter(v => !bodyHtml.includes(`{{${v}}}`));
  return missingVars;
};

export function EditTemplateDialog({ open, onOpenChange, templateType }: EditTemplateDialogProps) {
  const { getTemplate, upsertTemplate } = useEmailTemplates();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [missingVariables, setMissingVariables] = useState<string[]>([]);

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
      setMissingVariables([]);
    }
  }, [templateType, open, getTemplate]);

  // Validate on body change
  useEffect(() => {
    if (templateType && bodyHtml) {
      const missing = validateTemplate(templateType, bodyHtml);
      setMissingVariables(missing);
    }
  }, [templateType, bodyHtml]);

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
          {variables.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Available Variables (click to insert)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <Badge
                    key={v}
                    variant={missingVariables.includes(v) ? "destructive" : "outline"}
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => insertVariable(v)}
                  >
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Missing Variables Warning */}
          {missingVariables.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Missing required variables: {missingVariables.map(v => `{{${v}}}`).join(", ")}
              </AlertDescription>
            </Alert>
          )}

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
              rows={12}
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
