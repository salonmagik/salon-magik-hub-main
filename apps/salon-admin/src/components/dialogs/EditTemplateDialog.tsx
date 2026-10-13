import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Badge } from "@ui/badge";
import { Switch } from "@ui/switch";
import { Alert, AlertDescription } from "@ui/alert";
import { Mail, Loader2, Info, AlertTriangle, Bold, Italic, Underline, List, ListOrdered, Link2, Minus, RectangleHorizontal, ArrowLeft, Eye } from "lucide-react";
import { useEmailTemplates, type TemplateType, defaultTemplates, templateTypeLabels } from "@/hooks/useEmailTemplates";
import { htmlToEditableText, prettifyTokenLabel, replaceTemplateTokens, textToBasicEmailHtml } from "@/components/messaging/templateEditorUtils";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";

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
  daily_digest: [],
};

// Validate that required variables are present
const validateTemplate = (type: TemplateType, bodyHtml: string): string[] => {
  const requiredVars = templateVariables[type] || [];
  const missingVars = requiredVars.filter(v => !bodyHtml.includes(`{{${v}}}`));
  return missingVars;
};

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

export function EditTemplateDialog({ open, onOpenChange, templateType }: EditTemplateDialogProps) {
  const { getTemplate, upsertTemplate } = useEmailTemplates();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [missingVariables, setMissingVariables] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastBodyFromDom = useRef<string>("");
  const previewValues = useMemo(
    () => ({
      customer_name: "Ama",
      appointment_date: "Tuesday, May 12",
      appointment_time: "2:30 PM",
      service_name: "Silk Press",
      salon_name: "Glamour House",
      location_name: "East Legon",
      cta_link: "https://salonmagik.com/book/glamour-house",
      amount: "GHS 200",
      transaction_id: "TXN-1024",
      refund_method: "Mobile Money",
      staff_name: "Naana",
      role: "Manager",
      invitation_link: "https://app.salonmagik.com/login",
      first_name: "Ama",
      reset_link: "https://app.salonmagik.com/reset",
      verification_link: "https://app.salonmagik.com/verify",
      buffer_duration: "20 minutes",
      accept_link: "https://app.salonmagik.com/approve",
      reschedule_link: "https://app.salonmagik.com/reschedule",
      old_service: "Basic Pedicure",
      new_service: "Spa Pedicure",
      recipient_name: "Akosua",
      sender_name: "Esi",
      custom_message: "Enjoy this treat!",
      view_link: "https://app.salonmagik.com/voucher",
      voucher_code: "MAGIK20",
    }),
    [],
  );
  const bodyHtml = useMemo(() => textToBasicEmailHtml(bodyDraft), [bodyDraft]);
  const previewSubject = useMemo(() => replaceTemplateTokens(subject, previewValues), [subject, previewValues]);
  const previewBody = useMemo(() => replaceTemplateTokens(bodyDraft, previewValues), [bodyDraft, previewValues]);

  useEffect(() => {
    if (templateType && open) {
      const existingTemplate = getTemplate(templateType);
      if (existingTemplate) {
        setSubject(existingTemplate.subject);
        setBodyDraft(htmlToEditableText(existingTemplate.body_html));
        setIsActive(existingTemplate.is_active);
      } else {
        const defaults = defaultTemplates[templateType];
        setSubject(defaults.subject);
        setBodyDraft(htmlToEditableText(defaults.body_html));
        setIsActive(true);
      }
      setMissingVariables([]);
      setPreviewOpen(false);
    }
  }, [templateType, open, getTemplate]);

  // Validate on body change
  useEffect(() => {
    if (templateType && bodyDraft) {
      const missing = validateTemplate(templateType, bodyDraft);
      setMissingVariables(missing);
    }
  }, [templateType, bodyDraft]);

  // Keep the contentEditable body in sync with state, without fighting the user's own typing
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (bodyDraft === lastBodyFromDom.current) return;
    lastBodyFromDom.current = bodyDraft;
    el.innerHTML = messageToHtml(bodyDraft);
  }, [bodyDraft]);

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const value = domToMessage(el);
    lastBodyFromDom.current = value;
    setBodyDraft(value);
  }, []);

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
    setBodyDraft(htmlToEditableText(defaults.body_html));
  };

  const insertTextAtCursor = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) return;
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
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    handleEditorInput();
  }, [handleEditorInput]);

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const el = editorRef.current;
    if (!el) {
      setBodyDraft((prev) => `${prev}${prev ? " " : ""}${token}`);
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

  const applyFormat = (before: string, after = before) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    const selectedText =
      selection && selection.rangeCount > 0 && el.contains(selection.anchorNode) && !selection.isCollapsed
        ? selection.toString()
        : "your text";
    insertTextAtCursor(`${before}${selectedText}${after}`);
  };

  if (!templateType) return null;

  const variables = templateVariables[templateType] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {previewOpen ? (
          <>
            <DialogHeader className="flex flex-row items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Preview email</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  What your customer will see
                </p>
              </div>
            </DialogHeader>

            <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
              <div className="rounded-2xl border bg-muted/10 p-3.5">
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="mt-1 font-medium">{previewSubject || "No subject yet"}</div>
                <div className="mt-3 rounded-2xl bg-background p-3.5 whitespace-pre-wrap text-sm leading-7">
                  {previewBody || "Your customer-facing email preview will appear here."}
                </div>
              </div>
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
            <DialogHeader className="flex flex-row items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Edit email template</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {templateTypeLabels[templateType]}
                </p>
              </div>
            </DialogHeader>

            <div className={cn(DIALOG_BODY_PADDING, "space-y-4.5")}>
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
                    <span className="text-sm text-muted-foreground">Add customer info</span>
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
                    Add these details before saving: {missingVariables.map((v) => prettifyTokenLabel(v)).join(", ")}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Email message</Label>
                  <Badge variant="secondary">Email editor</Badge>
                </div>
                <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/30 p-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("**", "**")}><Bold className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("_", "_")}><Italic className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("__", "__")}><Underline className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("• ", "")}><List className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("1. ", "")}><ListOrdered className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("[", "]({{cta_link}})")}><Link2 className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat('[Button: ', ']')}><RectangleHorizontal className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyFormat("\n---\n", "")}><Minus className="h-4 w-4" /></Button>
                </div>
                <div className="relative">
                  {bodyDraft.length === 0 && (
                    <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                      Write the email the same way you want your customer to read it.
                    </span>
                  )}
                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    onInput={handleEditorInput}
                    className="min-h-[220px] rounded-xl border bg-background px-3 py-2.5 text-sm font-sans leading-6 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 whitespace-pre-wrap"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button type="button" variant="ghost" onClick={handleResetToDefault} disabled={isSubmitting}>
                Reset to Default
              </Button>
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
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
