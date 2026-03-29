import { useState, useEffect } from "react";
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
import { Textarea } from "@ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Alert, AlertDescription } from "@ui/alert";
import { MessageSquare, Mail, Phone, Loader2, AlertCircle, CreditCard } from "lucide-react";
import { useManualMessages } from "@/hooks/useManualMessages";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useMessagingCredits } from "@/hooks/useMessagingCredits";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@supabase-client";

type Customer = Tables<"customers">;
type WhatsAppTemplate = Tables<"whatsapp_templates">;

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
}

const CREDIT_COST = {
  email: 1,
  sms: 2,
  whatsapp: 2,
};

export function SendMessageDialog({
  open,
  onOpenChange,
  customerId: providedCustomerId,
}: SendMessageDialogProps) {
  const { currentTenant } = useAuth();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { sendMessage, isLoading: sendingMessage } = useManualMessages({
    tenantId: currentTenant?.id || "",
  });
  const { templates, isLoading: templatesLoading } = useWhatsAppTemplates({
    tenantId: currentTenant?.id || "",
    status: "approved",
  });
  const { credits, isLoading: creditsLoading } = useMessagingCredits();

  const [channel, setChannel] = useState<"email" | "sms" | "whatsapp">("email");
  const [customerId, setCustomerId] = useState<string>(providedCustomerId || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const approvedTemplates = templates.filter((t) => t.status === "approved");
  const creditBalance = credits?.balance || 0;
  const creditCost = CREDIT_COST[channel];
  const hasInsufficientCredits = creditBalance < creditCost;

  // Initialize customerId if provided via props
  useEffect(() => {
    if (providedCustomerId) {
      setCustomerId(providedCustomerId);
    }
  }, [providedCustomerId]);

  // Reset template variables when template changes
  useEffect(() => {
    if (selectedTemplate && selectedTemplate.variables) {
      const initialVariables: Record<string, string> = {};
      selectedTemplate.variables.forEach((varName: string) => {
        initialVariables[varName] = "";
      });
      setTemplateVariables(initialVariables);
    } else {
      setTemplateVariables({});
    }
  }, [selectedTemplate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      return;
    }

    const result = await sendMessage({
      customerId,
      channel,
      message: channel === "whatsapp" ? "" : message,
      subject: channel === "email" ? subject : undefined,
      templateId: channel === "whatsapp" ? templateId : undefined,
      templateVariables: channel === "whatsapp" ? templateVariables : undefined,
    });

    if (result) {
      // Reset form
      if (!providedCustomerId) {
        setCustomerId("");
      }
      setSubject("");
      setMessage("");
      setTemplateId("");
      setTemplateVariables({});
      onOpenChange(false);
    }
  };

  const handleVariableChange = (varName: string, value: string) => {
    setTemplateVariables((prev) => ({
      ...prev,
      [varName]: value,
    }));
  };

  const isFormValid = () => {
    if (!customerId) return false;
    if (hasInsufficientCredits) return false;

    if (channel === "email") {
      if (!selectedCustomer?.email) return false;
      return message.trim().length > 0;
    }

    if (channel === "sms") {
      if (!selectedCustomer?.phone) return false;
      return message.trim().length > 0;
    }

    if (channel === "whatsapp") {
      if (!selectedCustomer?.phone) return false;
      if (!templateId) return false;
      // Check all template variables are filled
      if (selectedTemplate?.variables) {
        return selectedTemplate.variables.every(
          (varName: string) => templateVariables[varName]?.trim().length > 0
        );
      }
      return true;
    }

    return false;
  };

  const getChannelDisabledReason = (channelType: "email" | "sms" | "whatsapp") => {
    if (!selectedCustomer) return null;

    if (channelType === "email" && !selectedCustomer.email) {
      return "Customer has no email address";
    }

    if (channelType === "sms" && !selectedCustomer.phone) {
      return "Customer has no phone number";
    }

    if (channelType === "whatsapp") {
      if (!selectedCustomer.phone) {
        return "Customer has no phone number";
      }
      if (approvedTemplates.length === 0) {
        return "Create WhatsApp templates first";
      }
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-xl">Send Message</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Send an email, SMS, or WhatsApp message to a customer
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Customer Selection */}
          {!providedCustomerId && (
            <div className="space-y-2">
              <Label>
                Customer <span className="text-destructive">*</span>
              </Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customersLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading customers...</div>
                  ) : customers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No customers found</div>
                  ) : (
                    customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.full_name}
                        {customer.email && ` (${customer.email})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Channel Selection */}
          <div className="space-y-2">
            <Label>
              Channel <span className="text-destructive">*</span>
            </Label>
            <RadioGroup value={channel} onValueChange={(val) => setChannel(val as typeof channel)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="email"
                  id="email"
                  disabled={!!getChannelDisabledReason("email")}
                />
                <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="w-4 h-4" />
                  Email (1 credit)
                </Label>
                {getChannelDisabledReason("email") && (
                  <span className="text-xs text-muted-foreground">
                    - {getChannelDisabledReason("email")}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="sms"
                  id="sms"
                  disabled={!!getChannelDisabledReason("sms")}
                />
                <Label htmlFor="sms" className="flex items-center gap-2 cursor-pointer">
                  <Phone className="w-4 h-4" />
                  SMS (2 credits)
                </Label>
                {getChannelDisabledReason("sms") && (
                  <span className="text-xs text-muted-foreground">
                    - {getChannelDisabledReason("sms")}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="whatsapp"
                  id="whatsapp"
                  disabled={!!getChannelDisabledReason("whatsapp")}
                />
                <Label htmlFor="whatsapp" className="flex items-center gap-2 cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  WhatsApp (2 credits)
                </Label>
                {getChannelDisabledReason("whatsapp") && (
                  <span className="text-xs text-muted-foreground">
                    - {getChannelDisabledReason("whatsapp")}
                  </span>
                )}
              </div>
            </RadioGroup>
          </div>

          {/* Email Subject */}
          {channel === "email" && (
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Enter email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          {/* Message Content (Email & SMS) */}
          {(channel === "email" || channel === "sms") && (
            <div className="space-y-2">
              <Label>
                Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Enter your message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                required
              />
              {channel === "sms" && (
                <p className="text-xs text-muted-foreground">
                  SMS character limit: 160 (plain) or 70 (unicode)
                </p>
              )}
            </div>
          )}

          {/* WhatsApp Template Selection */}
          {channel === "whatsapp" && (
            <>
              <div className="space-y-2">
                <Label>
                  WhatsApp Template <span className="text-destructive">*</span>
                </Label>
                <Select value={templateId} onValueChange={setTemplateId} disabled={templatesLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesLoading ? (
                      <div className="p-2 text-sm text-muted-foreground">Loading templates...</div>
                    ) : approvedTemplates.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        No approved templates. Create templates first.
                      </div>
                    ) : (
                      approvedTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.template_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Template Variables */}
              {selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                <div className="space-y-2">
                  <Label>Template Variables</Label>
                  {selectedTemplate.variables.map((varName: string, index: number) => (
                    <div key={varName} className="space-y-1">
                      <Label className="text-sm">
                        {varName} ({`{${index + 1}}`})
                      </Label>
                      <Input
                        placeholder={`Enter value for ${varName}`}
                        value={templateVariables[varName] || ""}
                        onChange={(e) => handleVariableChange(varName, e.target.value)}
                        required
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Credit Balance & Cost */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Credit Balance:</span>
              <span className="font-semibold">{creditBalance} credits</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">This will cost:</span>
              <span className="font-semibold">{creditCost} credits</span>
            </div>
            {hasInsufficientCredits && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Insufficient credits. You need {creditCost - creditBalance} more credits.{" "}
                  <a
                    href="/billing"
                    className="underline font-semibold"
                    onClick={() => onOpenChange(false)}
                  >
                    Purchase Credits
                  </a>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid() || sendingMessage}>
              {sendingMessage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Send Message
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
