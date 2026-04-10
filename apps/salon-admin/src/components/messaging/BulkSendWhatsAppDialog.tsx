import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@ui/checkbox";
import { Alert, AlertDescription } from "@ui/alert";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  MessageCircle,
  Loader2,
  Info,
  AlertTriangle,
  Users,
  Filter,
} from "lucide-react";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";

interface BulkSendWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedCustomers?: string[];
}

type FilterType = "all" | "has_phone" | "no_recent_visit" | "vip";
type SendMode = "custom" | "template";
type CustomerListItem = {
  id: string;
  full_name: string;
  phone: string | null;
  last_visit_at: string | null;
  visit_count: number;
  visitedLocations: { locationId: string; locationName: string; visitCount: number }[];
};

export function BulkSendWhatsAppDialog({
  open,
  onOpenChange,
  preSelectedCustomers,
}: BulkSendWhatsAppDialogProps) {
  const { currentTenant, user } = useAuth();
  const { customers: rawCustomers, isLoading: loadingCustomers } = useCustomers();
  const customers = rawCustomers as CustomerListItem[];
  const { templates, isLoading: loadingTemplates } = useWhatsAppTemplates();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>("custom");
  const [message, setMessage] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<FilterType>("has_phone");
  const [daysSinceVisit, setDaysSinceVisit] = useState("30");

  // Character count (WhatsApp limit: 1024)
  const charCount = message.length;
  const isOverLimit = charCount > 1024;
  const creditsPerMessage = 2;
  const totalCredits = selectedCustomerIds.length * creditsPerMessage;

  // Get approved templates only
  const approvedTemplates = templates.filter((t) => t.status === "approved");

  // Filter customers based on selected filter
  const filteredCustomers = useMemo(() => {
    let filtered = customers.filter((c) => c.phone); // Always require phone for WhatsApp

    switch (filterType) {
      case "all":
        filtered = customers.filter((c) => c.phone);
        break;
      case "has_phone":
        // Already filtered above
        break;
      case "no_recent_visit": {
        const daysAgo = parseInt(daysSinceVisit) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        filtered = filtered.filter((c) => {
          if (!c.last_visit_at) return true; // Never visited
          return new Date(c.last_visit_at) < cutoffDate;
        });
        break;
      }
      case "vip":
        filtered = filtered.filter((c) => c.visit_count >= 5 || c.visitedLocations.length > 5);
        break;
    }

    return filtered;
  }, [customers, filterType, daysSinceVisit]);

  // Initialize selected customers
  useEffect(() => {
    if (open && preSelectedCustomers) {
      setSelectedCustomerIds(preSelectedCustomers);
    } else if (open && filterType === "has_phone") {
      // Auto-select all customers with phone numbers
      setSelectedCustomerIds(filteredCustomers.map((c) => c.id));
    }
  }, [open, preSelectedCustomers, filterType]);

  // Update selections when filter changes
  useEffect(() => {
    if (filterType !== "all") {
      setSelectedCustomerIds(filteredCustomers.map((c) => c.id));
    }
  }, [filterType, filteredCustomers]);

  const handleToggleCustomer = (customerId: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleSelectAll = () => {
    setSelectedCustomerIds(filteredCustomers.map((c) => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedCustomerIds([]);
  };

  const handleSubmit = async () => {
    if (!currentTenant?.id || !user?.id) {
      toast({ title: "Error", description: "Authentication required", variant: "destructive" });
      return;
    }

    if (selectedCustomerIds.length === 0) {
      toast({
        title: "No recipients",
        description: "Please select at least one customer",
        variant: "destructive",
      });
      return;
    }

    if (sendMode === "custom" && !message.trim()) {
      toast({
        title: "No message",
        description: "Please enter a message to send",
        variant: "destructive",
      });
      return;
    }

    if (sendMode === "template" && !selectedTemplateId) {
      toast({
        title: "No template selected",
        description: "Please select a template to send",
        variant: "destructive",
      });
      return;
    }

    if (isOverLimit) {
      toast({
        title: "Message too long",
        description: "WhatsApp messages are limited to 1024 characters",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const requestBody: any = {
        customerIds: selectedCustomerIds,
        channel: "whatsapp",
      };

      if (sendMode === "custom") {
        // Custom message mode
        requestBody.message = message;
      } else {
        // Template mode
        requestBody.templateId = selectedTemplateId;
        // TODO: Add template variable inputs if needed
        requestBody.templateVariables = {};
      }

      const { data, error } = await supabase.functions.invoke("send-bulk-message", {
        body: requestBody,
      });

      if (error) throw error;

      const result = data as {
        sent: number;
        failed: number;
        creditsUsed: number;
        failedMessages?: { customerId: string; customerName: string; error: string }[];
      };

      if (result.failed > 0) {
        toast({
          title: "Partially sent",
          description: `${result.sent} messages sent, ${result.failed} failed. ${result.creditsUsed} credits used.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Success",
          description: `${result.sent} WhatsApp messages sent successfully! ${result.creditsUsed} credits used.`,
        });
      }

      onOpenChange(false);
      setMessage("");
      setSelectedCustomerIds([]);
      setSelectedTemplateId("");
    } catch (err: any) {
      console.error("Error sending bulk WhatsApp:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to send bulk WhatsApp messages",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <DialogTitle className="text-xl">Bulk Send WhatsApp</DialogTitle>
              <DialogDescription>
                Send WhatsApp messages to multiple customers
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Send Mode Selection */}
          <div className="space-y-3">
            <Label>Send Mode</Label>
            <RadioGroup value={sendMode} onValueChange={(v) => setSendMode(v as SendMode)}>
              <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="flex-1 cursor-pointer">
                  <p className="font-medium">Custom Message</p>
                  <p className="text-xs text-muted-foreground">
                    Send a free-form message (conversational mode)
                  </p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="template" id="template" />
                <Label htmlFor="template" className="flex-1 cursor-pointer">
                  <p className="font-medium">Use Template</p>
                  <p className="text-xs text-muted-foreground">
                    Send a pre-approved WhatsApp template
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Template Selection (if template mode) */}
          {sendMode === "template" && (
            <div className="space-y-2">
              <Label>Select Template</Label>
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : approvedTemplates.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No approved WhatsApp templates available. Please create and get approval for templates first.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.template_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Filter Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Customer Filter
              </Label>
              <Badge variant="outline">
                <Users className="w-3 h-3 mr-1" />
                {filteredCustomers.length} customers
              </Badge>
            </div>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="has_phone">All customers with phone numbers</SelectItem>
                <SelectItem value="no_recent_visit">Customers who haven't visited recently</SelectItem>
                <SelectItem value="vip">VIP customers only</SelectItem>
                <SelectItem value="all">All customers (manual selection)</SelectItem>
              </SelectContent>
            </Select>

            {filterType === "no_recent_visit" && (
              <div className="flex items-center gap-2 pl-4">
                <Label className="text-sm">Days since last visit:</Label>
                <Input
                  type="number"
                  value={daysSinceVisit}
                  onChange={(e) => setDaysSinceVisit(e.target.value)}
                  className="w-20"
                  min="1"
                />
              </div>
            )}
          </div>

          {/* Customer Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Recipients ({selectedCustomerIds.length} selected)
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={loadingCustomers}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={loadingCustomers}
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="border rounded-lg max-h-48 overflow-y-auto p-3 space-y-2 bg-muted/20">
              {loadingCustomers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No customers found with the selected filter
                </div>
              ) : (
                filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedCustomerIds.includes(customer.id)}
                      onCheckedChange={() => handleToggleCustomer(customer.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{customer.full_name}</p>
                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    </div>
                    {(customer.visit_count >= 5 || customer.visitedLocations.length > 5) && (
                      <Badge variant="secondary" className="text-xs">
                        VIP
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Custom Message Textarea (if custom mode) */}
          {sendMode === "custom" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Message</Label>
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
                placeholder="Enter your WhatsApp message..."
                rows={6}
                className="font-sans"
              />
            </div>
          )}

          {/* Character Limit Warning */}
          {sendMode === "custom" && isOverLimit && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Message exceeds WhatsApp's 1024 character limit. Please shorten your message.
              </AlertDescription>
            </Alert>
          )}

          {/* Credits Info */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Cost Estimate</span>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                • {selectedCustomerIds.length} recipients × {creditsPerMessage} credits ={" "}
                <strong className="text-foreground">{totalCredits} total credits</strong>
              </p>
              <p>• Each WhatsApp message costs 2 credits per recipient</p>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
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
            disabled={
              isSubmitting || 
              selectedCustomerIds.length === 0 || 
              (sendMode === "custom" && (isOverLimit || !message.trim())) ||
              (sendMode === "template" && !selectedTemplateId)
            } 
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Send to {selectedCustomerIds.length} Customer{selectedCustomerIds.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
