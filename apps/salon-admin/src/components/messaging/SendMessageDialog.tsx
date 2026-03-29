import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@ui/checkbox";
import { Switch } from "@ui/switch";
import { Progress } from "@ui/progress";
import { MessageSquare, Mail, Phone, Loader2, AlertCircle, CreditCard, Users, Search, CheckSquare, XSquare } from "lucide-react";
import { useManualMessages } from "@/hooks/useManualMessages";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useMessagingCredits } from "@/hooks/useMessagingCredits";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
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
  const { currentTenant, user } = useAuth();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { sendMessage, isLoading: sendingMessage } = useManualMessages({
    tenantId: currentTenant?.id || "",
  });
  const { templates, isLoading: templatesLoading } = useWhatsAppTemplates({
    tenantId: currentTenant?.id || "",
    status: "approved",
  });
  const { credits, isLoading: creditsLoading, refetch: refetchCredits } = useMessagingCredits();

  // Mode selection
  const [isBulkMode, setIsBulkMode] = useState(false);
  
  // Single customer mode
  const [channel, setChannel] = useState<"email" | "sms" | "whatsapp">("email");
  const [customerId, setCustomerId] = useState<string>(providedCustomerId || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  // Bulk mode
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ sent: 0, total: 0 });
  const [failedMessages, setFailedMessages] = useState<Array<{ customerId: string; customerName: string; error: string }>>([]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const approvedTemplates = templates.filter((t) => t.status === "approved");
  const creditBalance = credits?.balance || 0;
  
  // Calculate credit cost based on mode
  const creditCost = isBulkMode 
    ? CREDIT_COST[channel] * selectedCustomerIds.length 
    : CREDIT_COST[channel];
  const hasInsufficientCredits = creditBalance < creditCost;

  // Filter customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const query = searchQuery.toLowerCase();
    return customers.filter((c) => 
      c.full_name?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.phone?.toLowerCase().includes(query)
    );
  }, [customers, searchQuery]);

  // Initialize customerId if provided via props
  useEffect(() => {
    if (providedCustomerId) {
      setCustomerId(providedCustomerId);
      setIsBulkMode(false); // Force single mode if customerId provided
    }
  }, [providedCustomerId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Reset after a short delay to avoid visual glitches
      setTimeout(() => {
        if (!providedCustomerId) {
          setCustomerId("");
        }
        setSubject("");
        setMessage("");
        setTemplateId("");
        setTemplateVariables({});
        setSelectedCustomerIds([]);
        setSearchQuery("");
        setFailedMessages([]);
        setBulkProgress({ sent: 0, total: 0 });
      }, 300);
    }
  }, [open, providedCustomerId]);

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

  const handleToggleCustomer = (custId: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(custId)
        ? prev.filter((id) => id !== custId)
        : [...prev, custId]
    );
  };

  const handleSelectAll = () => {
    const eligibleCustomers = getEligibleCustomersForChannel(filteredCustomers, channel);
    setSelectedCustomerIds(eligibleCustomers.map((c) => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedCustomerIds([]);
  };

  const getEligibleCustomersForChannel = (customerList: Customer[], channelType: "email" | "sms" | "whatsapp") => {
    return customerList.filter((c) => {
      if (channelType === "email") return !!c.email;
      if (channelType === "sms") return !!c.phone;
      if (channelType === "whatsapp") return !!c.phone;
      return false;
    });
  };

  const handleBulkSend = async () => {
    if (selectedCustomerIds.length === 0) return;

    setSendingBulk(true);
    setBulkProgress({ sent: 0, total: selectedCustomerIds.length });
    setFailedMessages([]);

    try {
      // Call the send-bulk-message edge function
      const { data, error } = await supabase.functions.invoke('send-bulk-message', {
        body: {
          customerIds: selectedCustomerIds,
          channel,
          message: channel === "whatsapp" ? "" : message,
          subject: channel === "email" ? subject : undefined,
          templateId: channel === "whatsapp" ? templateId : undefined,
          templateVariables: channel === "whatsapp" ? templateVariables : undefined,
        },
      });

      if (error) throw error;

      // Update progress and failed messages
      setBulkProgress({ sent: data.sent, total: selectedCustomerIds.length });
      setFailedMessages(data.failedMessages || []);

      // Show summary toast
      if (data.failed === 0) {
        toast({
          title: "Messages Sent Successfully",
          description: `Successfully sent to ${data.sent} customers. ${data.creditsUsed} credits used.`,
        });
        
        // Close dialog on complete success
        onOpenChange(false);
      } else {
        toast({
          title: "Bulk Send Completed",
          description: `Successfully sent to ${data.sent} customers, ${data.failed} failed. ${data.creditsUsed} credits used.`,
          variant: "default",
        });
      }

      // Refetch credit balance
      refetchCredits();

    } catch (err) {
      console.error("Error sending bulk message:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to send bulk message";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSendingBulk(false);
    }
  };

  const handleRetryFailed = async () => {
    if (failedMessages.length === 0) return;

    const failedCustomerIds = failedMessages.map((f) => f.customerId);
    setSelectedCustomerIds(failedCustomerIds);
    setFailedMessages([]);
    
    // Trigger bulk send with failed customers
    await handleBulkSend();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBulkMode) {
      await handleBulkSend();
      return;
    }

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
      
      // Refetch credit balance
      refetchCredits();
    }
  };

  const handleVariableChange = (varName: string, value: string) => {
    setTemplateVariables((prev) => ({
      ...prev,
      [varName]: value,
    }));
  };

  const isFormValid = () => {
    if (hasInsufficientCredits) return false;

    if (isBulkMode) {
      if (selectedCustomerIds.length === 0) return false;

      if (channel === "email" || channel === "sms") {
        return message.trim().length > 0;
      }

      if (channel === "whatsapp") {
        if (!templateId) return false;
        if (approvedTemplates.length === 0) return false;
        // Check all template variables are filled
        if (selectedTemplate?.variables) {
          return selectedTemplate.variables.every(
            (varName: string) => templateVariables[varName]?.trim().length > 0
          );
        }
        return true;
      }

      return false;
    }

    // Single mode validation
    if (!customerId) return false;

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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            {isBulkMode ? (
              <Users className="w-5 h-5 text-primary" />
            ) : (
              <MessageSquare className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <DialogTitle className="text-xl">Send Message</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {isBulkMode 
                ? "Send message to multiple customers" 
                : "Send an email, SMS, or WhatsApp message to a customer"}
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Mode Toggle - Only show if no customerId provided */}
          {!providedCustomerId && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Label htmlFor="bulk-mode" className="cursor-pointer">
                  {isBulkMode ? "Multiple Customers" : "Single Customer"}
                </Label>
              </div>
              <Switch
                id="bulk-mode"
                checked={isBulkMode}
                onCheckedChange={(checked) => {
                  setIsBulkMode(checked);
                  setCustomerId("");
                  setSelectedCustomerIds([]);
                  setSearchQuery("");
                }}
              />
            </div>
          )}

          {/* Customer Selection - Single Mode */}
          {!providedCustomerId && !isBulkMode && (
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

          {/* Customer Selection - Bulk Mode */}
          {!providedCustomerId && isBulkMode && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Customers <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={filteredCustomers.length === 0}
                  >
                    <CheckSquare className="mr-1 h-3 w-3" />
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    disabled={selectedCustomerIds.length === 0}
                  >
                    <XSquare className="mr-1 h-3 w-3" />
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>

              {/* Customer List */}
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {customersLoading ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Loading customers...
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    No customers found
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredCustomers.map((customer) => {
                      const isEligible = getEligibleCustomersForChannel([customer], channel).length > 0;
                      const isSelected = selectedCustomerIds.includes(customer.id);
                      
                      return (
                        <div
                          key={customer.id}
                          className={`flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors ${
                            !isEligible ? "opacity-50" : ""
                          }`}
                        >
                          <Checkbox
                            id={`customer-${customer.id}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToggleCustomer(customer.id)}
                            disabled={!isEligible}
                          />
                          <Label
                            htmlFor={`customer-${customer.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="font-medium">{customer.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {customer.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {customer.email}
                                </span>
                              )}
                              {customer.phone && (
                                <span className="flex items-center gap-1 mt-1">
                                  <Phone className="h-3 w-3" />
                                  {customer.phone}
                                </span>
                              )}
                              {!isEligible && (
                                <span className="text-destructive text-xs mt-1 block">
                                  Missing {channel === "email" ? "email" : "phone"}
                                </span>
                              )}
                            </div>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Count */}
              {selectedCustomerIds.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <strong>{selectedCustomerIds.length}</strong> customer{selectedCustomerIds.length !== 1 ? "s" : ""} selected
                </div>
              )}
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
              <span className="font-semibold">
                {isBulkMode && selectedCustomerIds.length > 0 
                  ? `${creditCost} credits (${CREDIT_COST[channel]} per customer × ${selectedCustomerIds.length})`
                  : `${creditCost} credits`}
              </span>
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

          {/* Bulk Progress */}
          {sendingBulk && bulkProgress.total > 0 && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Sending messages...</span>
                <span className="text-muted-foreground">
                  {bulkProgress.sent} of {bulkProgress.total} sent
                </span>
              </div>
              <Progress value={(bulkProgress.sent / bulkProgress.total) * 100} />
            </div>
          )}

          {/* Failed Messages */}
          {failedMessages.length > 0 && !sendingBulk && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-medium">
                <AlertCircle className="h-4 w-4" />
                Failed to send to {failedMessages.length} customer{failedMessages.length !== 1 ? "s" : ""}
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {failedMessages.map((failed, idx) => (
                  <div key={idx} className="text-sm text-muted-foreground">
                    <span className="font-medium">{failed.customerName}</span>: {failed.error}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryFailed}
                disabled={sendingBulk}
              >
                Retry Failed Messages
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={sendingBulk}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!isFormValid() || sendingMessage || sendingBulk}
            >
              {(sendingMessage || sendingBulk) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  {isBulkMode ? <Users className="mr-2 h-4 w-4" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                  {isBulkMode ? `Send to ${selectedCustomerIds.length} customers` : "Send Message"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
