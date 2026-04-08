import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription } from "@ui/alert";
import { MessageCircle, Loader2, Info, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import {
  useWhatsAppTemplates,
  type WhatsAppTemplateType,
  defaultWhatsAppTemplates,
  whatsappTemplateTypeLabels,
  whatsappTemplateVariables,
  convertFromTermiiFormat,
} from "@/hooks/useWhatsAppTemplates";
import { cn } from "@shared/utils";

interface EditWhatsAppTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: WhatsAppTemplateType | null;
}

export function EditWhatsAppTemplateDialog({
  open,
  onOpenChange,
  templateType,
}: EditWhatsAppTemplateDialogProps) {
  const { getTemplate, createTemplate, updateTemplate } = useWhatsAppTemplates();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [message, setMessage] = useState("");
  const [missingVariables, setMissingVariables] = useState<string[]>([]);
  const [existingTemplate, setExistingTemplate] = useState<any>(null);

  // Character count (WhatsApp limit: 1024 characters)
  const charCount = message.length;
  const isOverLimit = charCount > 1024;

  useEffect(() => {
    if (templateType && open) {
      const template = getTemplate(templateType);
      if (template) {
        setExistingTemplate(template);
        setTemplateName(template.template_name);
        // Convert from Termii format to user-friendly
        const userFriendlyMessage = convertFromTermiiFormat(
          template.template_content,
          template.variables
        );
        setMessage(userFriendlyMessage);
      } else {
        setExistingTemplate(null);
        setTemplateName(templateType);
        const defaults = defaultWhatsAppTemplates[templateType];
        setMessage(defaults.message);
      }
      setMissingVariables([]);
    }
  }, [templateType, open, getTemplate]);

  // Validate variables on message change
  useEffect(() => {
    if (templateType && message) {
      const requiredVars = whatsappTemplateVariables[templateType] || [];
      const missing = requiredVars.filter((v) => !message.includes(`{{${v}}}`));
      setMissingVariables(missing);
    }
  }, [templateType, message]);

  const handleSubmit = async () => {
    if (!templateType) return;

    if (isOverLimit) {
      return;
    }

    setIsSubmitting(true);
    try {
      const variables = whatsappTemplateVariables[templateType] || [];

      if (existingTemplate) {
        // Update existing template
        await updateTemplate(existingTemplate.id, {
          templateName,
          message,
          variables,
        });
      } else {
        // Create new template
        await createTemplate(templateName, message, variables);
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToDefault = () => {
    if (!templateType) return;
    const defaults = defaultWhatsAppTemplates[templateType];
    setMessage(defaults.message);
    setTemplateName(templateType);
  };

  const insertVariable = (variable: string) => {
    setMessage((prev) => prev + `{{${variable}}}`);
  };

  if (!templateType) return null;

  const variables = whatsappTemplateVariables[templateType] || [];
  const status = existingTemplate?.status || "not_created";

  // Determine if template can be edited
  const canEdit = status === "not_created" || status === "pending" || status === "rejected";
  const isApproved = status === "approved";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">Edit WhatsApp Template</DialogTitle>
              <DialogDescription>
                {whatsappTemplateTypeLabels[templateType]}
              </DialogDescription>
            </div>
            {/* Status Badge */}
            {existingTemplate && (
              <div>
                {status === "approved" && (
                  <Badge className="bg-success/10 text-success border-success/20">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approved
                  </Badge>
                )}
                {status === "pending" && (
                  <Badge variant="secondary" className="bg-warning-bg text-warning-foreground">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending
                  </Badge>
                )}
                {status === "rejected" && (
                  <Badge variant="destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    Rejected
                  </Badge>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Approval Status Alert */}
          {isApproved && (
            <Alert className="bg-success/10 border-success/20">
              <CheckCircle className="h-4 w-4 text-success" />
              <AlertDescription>
                <p className="font-medium text-success">Template Approved</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This template is approved and ready to use. Any changes will require re-approval from Termii.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {status === "pending" && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Approval Pending</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This template is awaiting approval from Termii. This usually takes 1-2 business days.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {status === "rejected" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Template Rejected</p>
                <p className="text-sm mt-1">
                  Your template was rejected by Termii. Please modify it and submit again.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Template Name */}
          <div className="space-y-2">
            <Label>Template Name</Label>
            <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm">
              {templateName}
            </div>
            <p className="text-xs text-muted-foreground">
              Template name is based on the template type and cannot be changed
            </p>
          </div>

          {/* Variables Helper */}
          {variables.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Available Variables (click to insert)
                </span>
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
                Missing recommended variables:{" "}
                {missingVariables.map((v) => `{{${v}}}`).join(", ")}
              </AlertDescription>
            </Alert>
          )}

          {/* Message Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Message Content</Label>
              <span
                className={cn(
                  "text-xs",
                  isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
                )}
              >
                {charCount}/1024
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter WhatsApp message content..."
              rows={6}
              className="font-sans text-sm"
              disabled={!canEdit}
            />
          </div>

          {/* Character Limit Warning */}
          {isOverLimit && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Message exceeds WhatsApp's 1024 character limit. Please shorten your message.
              </AlertDescription>
            </Alert>
          )}

          {/* Info Box */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              <strong>WhatsApp Template Guidelines</strong>
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs pl-2">
              <li>Messages are limited to 1024 characters</li>
              <li>Use variables like <code className="bg-muted px-1 rounded">{"{{customer_name}}"}</code> for personalization</li>
              <li>Templates require approval from Termii before use</li>
              <li>Approval typically takes 1-2 business days</li>
              <li>Each WhatsApp message costs 2 credits per recipient</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleResetToDefault}
            disabled={isSubmitting || !canEdit}
          >
            Reset to Default
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || isOverLimit || !canEdit} 
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {existingTemplate ? "Update Template" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
