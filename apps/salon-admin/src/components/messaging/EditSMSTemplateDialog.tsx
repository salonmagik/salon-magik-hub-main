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
import { Switch } from "@ui/switch";
import { Alert, AlertDescription } from "@ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { MessageSquare, Loader2, Info, AlertTriangle } from "lucide-react";
import {
  useSMSTemplates,
  type SMSTemplateType,
  defaultSMSTemplates,
  smsTemplateTypeLabels,
  smsTemplateVariables,
  smsTemplateAutoSendTriggers,
} from "@/hooks/useSMSTemplates";
import { cn } from "@shared/utils";

interface EditSMSTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: SMSTemplateType | null;
}

export function EditSMSTemplateDialog({
  open,
  onOpenChange,
  templateType,
}: EditSMSTemplateDialogProps) {
  const { getTemplate, upsertTemplate } = useSMSTemplates();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [autoSendTrigger, setAutoSendTrigger] = useState<string>("");
  const [missingVariables, setMissingVariables] = useState<string[]>([]);

  // Character count and SMS segment calculation
  const charCount = message.length;
  const smsSegments = Math.ceil(charCount / 160);

  useEffect(() => {
    if (templateType && open) {
      const existingTemplate = getTemplate(templateType);
      if (existingTemplate) {
        setMessage(existingTemplate.message);
        setIsActive(existingTemplate.is_active);
        setAutoSendEnabled(existingTemplate.auto_send_enabled);
        setAutoSendTrigger(existingTemplate.auto_send_trigger || "");
      } else {
        const defaults = defaultSMSTemplates[templateType];
        setMessage(defaults.message);
        setIsActive(true);
        setAutoSendEnabled(false);
        setAutoSendTrigger(defaults.auto_send_trigger || "");
      }
      setMissingVariables([]);
    }
  }, [templateType, open, getTemplate]);

  // Validate variables on message change
  useEffect(() => {
    if (templateType && message) {
      const requiredVars = smsTemplateVariables[templateType] || [];
      const missing = requiredVars.filter((v) => !message.includes(`{{${v}}}`));
      setMissingVariables(missing);
    }
  }, [templateType, message]);

  const handleSubmit = async () => {
    if (!templateType) return;

    setIsSubmitting(true);
    try {
      await upsertTemplate(templateType, {
        message,
        is_active: isActive,
        auto_send_enabled: autoSendEnabled,
        auto_send_trigger: autoSendTrigger || undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToDefault = () => {
    if (!templateType) return;
    const defaults = defaultSMSTemplates[templateType];
    setMessage(defaults.message);
    setAutoSendTrigger(defaults.auto_send_trigger || "");
  };

  const insertVariable = (variable: string) => {
    setMessage((prev) => prev + `{{${variable}}}`);
  };

  if (!templateType) return null;

  const variables = smsTemplateVariables[templateType] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <MessageSquare className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <DialogTitle className="text-xl">Edit SMS Template</DialogTitle>
              <DialogDescription>
                {smsTemplateTypeLabels[templateType]}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="is-active" className="font-medium">
                Enable this template
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                When disabled, this template will not be used
              </p>
            </div>
            <Switch id="is-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Auto-Send Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label htmlFor="auto-send" className="font-medium">
                  Auto-send SMS
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically send this SMS when the trigger event occurs
                </p>
              </div>
              <Switch
                id="auto-send"
                checked={autoSendEnabled}
                onCheckedChange={setAutoSendEnabled}
              />
            </div>

            {autoSendEnabled && (
              <div className="space-y-2 pl-4">
                <Label className="text-sm">Trigger Event</Label>
                <Select value={autoSendTrigger} onValueChange={setAutoSendTrigger}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select when to send..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(smsTemplateAutoSendTriggers).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                  charCount > 160 ? "text-warning-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {charCount}/160 ({smsSegments} segment{smsSegments !== 1 ? "s" : ""})
              </span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter SMS message content..."
              rows={6}
              className="font-sans text-sm"
            />
          </div>

          {/* Character Limit Warning */}
          {charCount > 160 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Messages over 160 characters will be split into {smsSegments} segments. Each
                segment costs 2 credits per recipient.
              </AlertDescription>
            </Alert>
          )}

          {/* Info Box */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              <strong>SMS Best Practices</strong>
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs pl-2">
              <li>Keep messages under 160 characters to use 1 segment</li>
              <li>Use variables like <code className="bg-muted px-1 rounded">{"{{customer_name}}"}</code> for personalization</li>
              <li>Each SMS costs 2 credits per recipient</li>
              <li>Auto-send will trigger on the selected event for active templates</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleResetToDefault}
            disabled={isSubmitting}
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
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
