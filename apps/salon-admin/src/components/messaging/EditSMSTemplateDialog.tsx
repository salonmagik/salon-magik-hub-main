import { useState, useEffect, useRef, useCallback } from "react";
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
import { MessageSquare, Loader2, Info, AlertTriangle, ArrowLeft, Eye } from "lucide-react";
import {
  useSMSTemplates,
  type SMSTemplateType,
  defaultSMSTemplates,
  smsTemplateTypeLabels,
  smsTemplateVariables,
  smsTemplateAutoSendTriggers,
} from "@/hooks/useSMSTemplates";
import { cn } from "@shared/utils";
import { prettifyTokenLabel, replaceTemplateTokens } from "@/components/messaging/templateEditorUtils";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

interface EditSMSTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateType: SMSTemplateType | null;
}

const VAR_CHIP_CLASSES =
  "inline-flex items-center bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium mx-0.5 align-middle select-none cursor-default";
const ZWS = "​";

function messageToHtml(msg: string): string {
  const escaped = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withChips = escaped.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    const label = prettifyTokenLabel(token);
    return `${ZWS}<span data-token="${match}" contenteditable="false" class="${VAR_CHIP_CLASSES}">${label}</span>${ZWS}`;
  });
  return withChips.replace(/\n/g, "<br>");
}

function domToMessage(el: HTMLElement): string {
  let result = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.textContent ?? "").replace(/\u200b/g, "");
    } else if (node instanceof HTMLElement) {
      const token = node.dataset.token;
      if (token) {
        result += token;
      } else if (node.tagName === "BR") {
        result += "\n";
      } else if (node.tagName === "DIV" || node.tagName === "P") {
        if (result.length > 0 && !result.endsWith("\n")) result += "\n";
        result += domToMessage(node);
      } else {
        result += domToMessage(node);
      }
    }
  }
  return result;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastMessageFromDom = useRef<string>("");
  const previewValues = {
    customer_name: "Ama",
    appointment_date: "Tuesday, May 12",
    appointment_time: "2:30 PM",
    service_name: "Silk Press",
    salon_name: "Glamour House",
    amount: "GHS 200",
  };

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
      setPreviewOpen(false);
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

  // Keep the contentEditable body in sync with state, without fighting the user's own typing
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (message === lastMessageFromDom.current) return;
    lastMessageFromDom.current = message;
    el.innerHTML = messageToHtml(message);
  }, [message]);

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const value = domToMessage(el);
    lastMessageFromDom.current = value;
    setMessage(value);
  }, []);

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
    const token = `{{${variable}}}`;
    const el = editorRef.current;
    if (!el) {
      setMessage((prev) => `${prev}${token}`);
      return;
    }
    el.focus();
    const selection = window.getSelection();
    let range: Range;
    if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.deleteContents();
    const label = prettifyTokenLabel(variable);
    const before = document.createTextNode(ZWS);
    const chip = document.createElement("span");
    chip.setAttribute("data-token", token);
    chip.setAttribute("contenteditable", "false");
    chip.className = VAR_CHIP_CLASSES;
    chip.textContent = label;
    const after = document.createTextNode(ZWS);
    range.insertNode(after);
    range.insertNode(chip);
    range.insertNode(before);
    range.setStartAfter(after);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    handleEditorInput();
  };

  if (!templateType) return null;

  const variables = smsTemplateVariables[templateType] || [];
  const previewMessage = replaceTemplateTokens(message, previewValues);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {previewOpen ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Eye className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Preview text message</DialogTitle>
                  <DialogDescription>What your customer will see</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
              <div className="rounded-2xl border bg-muted/10 p-3.5">
                <div className="text-sm font-medium">What the customer will see</div>
                <div className="mt-3 rounded-3xl bg-slate-950 px-4 py-3.5 text-sm leading-7 text-white">
                  {previewMessage || "Your customer-facing SMS preview will appear here."}
                </div>
              </div>
              {charCount > 160 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Messages over 160 characters will be split into {smsSegments} segments. Each
                    segment costs 2 credits per recipient.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <div className="flex-1" />
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Template
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Edit text message template</DialogTitle>
                  <DialogDescription>
                    {smsTemplateTypeLabels[templateType]}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className={cn(DIALOG_BODY_PADDING, "space-y-4.5")}>
              {/* Active Toggle */}
              <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-3">
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
                <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-3">
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
                      Add customer info
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
                        + {prettifyTokenLabel(v)}
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
                    Consider adding: {missingVariables.map((v) => prettifyTokenLabel(v)).join(", ")}
                  </AlertDescription>
                </Alert>
              )}

              {/* Message Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Text message</Label>
                  <span
                    className={cn(
                      "text-xs",
                      charCount > 160 ? "text-warning-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {charCount}/160 ({smsSegments} segment{smsSegments !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="relative">
                  {message.length === 0 && (
                    <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                      Write the text the same way your customer should read it.
                    </span>
                  )}
                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    onInput={handleEditorInput}
                    className="min-h-[120px] rounded-xl border bg-background px-3 py-2.5 text-sm font-sans leading-6 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 whitespace-pre-wrap"
                  />
                </div>
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
                  <li>Say your salon name early so customers know who the text is from.</li>
                  <li>Keep the message short to avoid extra SMS segments.</li>
                  <li>Each SMS segment costs 2 credits per recipient.</li>
                  <li>Auto-send uses this exact message when the chosen event happens.</li>
                </ul>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
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
              <Button onClick={() => setPreviewOpen(true)} className="gap-2">
                <Eye className="w-4 h-4" />
                Preview
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
