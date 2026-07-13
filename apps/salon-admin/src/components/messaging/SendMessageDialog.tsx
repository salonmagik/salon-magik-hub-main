import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Alert, AlertDescription } from "@ui/alert";
import { Progress } from "@ui/progress";
import { AlertCircle, Loader2, Mail, Phone } from "lucide-react";
import { useManualMessages } from "@/hooks/useManualMessages";
import { useMessagingCredits } from "@/hooks/useMessagingCredits";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";
import type { CustomerWithVisitSummary } from "@/hooks/useCustomers";

type Customer = CustomerWithVisitSummary;

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
}

const CREDIT_COST = { email: 0, sms: 2 };

const variableTokens = [
  { label: "Customer name", token: "{{customer_name}}" },
  { label: "Salon name", token: "{{salon_name}}" },
  { label: "Booking link", token: "{{booking_link}}" },
];

export function SendMessageDialog({ open, onOpenChange, customerId: providedCustomerId }: SendMessageDialogProps) {
  const { currentTenant, user } = useAuth();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { sendMessage, isSending } = useManualMessages({ tenantId: currentTenant?.id || "" });
  const { credits, refetch: refetchCredits } = useMessagingCredits();

  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [customerId, setCustomerId] = useState(providedCustomerId || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [sendProgress, setSendProgress] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedCustomer = customers.find((c) => c.id === customerId) as Customer | undefined;
  const creditBalance = credits?.balance || 0;
  const creditCost = CREDIT_COST[channel];
  const hasInsufficientCredits = channel === "sms" && creditBalance < creditCost;
  const isSubmitting = isSending;

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter((c) =>
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  useEffect(() => {
    if (providedCustomerId) setCustomerId(providedCustomerId);
  }, [providedCustomerId]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        if (!providedCustomerId) setCustomerId("");
        setSubject("");
        setMessage("");
        setCustomerSearch("");
        setSendProgress(0);
      }, 300);
    }
  }, [open, providedCustomerId]);

  useEffect(() => {
    if (!isSubmitting) {
      if (sendProgress > 0 && sendProgress < 100) setSendProgress(0);
      return;
    }
    setSendProgress(18);
    const timer = window.setInterval(() => setSendProgress((p) => (p >= 86 ? p : p + 8)), 220);
    return () => window.clearInterval(timer);
  }, [isSubmitting, sendProgress]);

  const insertVariable = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage((m) => m + token);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const channelDisabledReason = () => {
    if (!selectedCustomer) return null;
    if (channel === "email" && !selectedCustomer.email) return "This customer has no email address on file.";
    if (channel === "sms" && !selectedCustomer.phone) return "This customer has no phone number on file.";
    return null;
  };

  const isFormValid = () => {
    if (hasInsufficientCredits) return false;
    if (!customerId) return false;
    if (channel === "email" && !selectedCustomer?.email) return false;
    if (channel === "sms" && !selectedCustomer?.phone) return false;
    return message.trim().length > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return;

    setSendProgress(18);
    const result = await sendMessage({
      customerId,
      channel,
      message,
      subject: channel === "email" ? subject : undefined,
    });

    if (result) {
      setSendProgress(100);
      if (!providedCustomerId) setCustomerId("");
      setSubject("");
      setMessage("");
      onOpenChange(false);
      refetchCredits();
    } else {
      setSendProgress(0);
    }
  };

  const disabledReason = channelDisabledReason();
  const smsChars = message.length;
  const smsParts = Math.max(1, Math.ceil(smsChars / 160));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a message</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer selector */}
          {!providedCustomerId && (
            <div className="space-y-2">
              <Label>Customer</Label>
              <Input
                placeholder="Search by name, email, or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customerSearch && filteredCustomers.length > 0 && !selectedCustomer && (
                <div className="max-h-48 overflow-y-auto rounded-2xl border bg-background shadow-md">
                  {filteredCustomers.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60"
                      onClick={() => { setCustomerId(c.id); setCustomerSearch(""); }}
                    >
                      <div>
                        <div className="font-medium">{c.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.email || c.phone || "No contact info"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {customerId && selectedCustomer && (
                <div className="flex items-center justify-between rounded-2xl border bg-muted/30 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{selectedCustomer.full_name}</div>
                    <div className="text-xs text-muted-foreground">{selectedCustomer.email || selectedCustomer.phone}</div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCustomerId("")}>
                    Change
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Channel */}
          <div className="space-y-2">
            <Label>How to send it</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["email", "sms"] as const).map((ch) => {
                const isSelected = channel === ch;
                const Icon = ch === "email" ? Mail : Phone;
                const reason = selectedCustomer
                  ? (ch === "email" && !selectedCustomer.email ? "No email on file" : ch === "sms" && !selectedCustomer.phone ? "No phone on file" : null)
                  : null;
                return (
                  <label
                    key={ch}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors",
                      isSelected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40",
                      reason && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="radio"
                      name="channel"
                      value={ch}
                      checked={isSelected}
                      disabled={!!reason}
                      onChange={() => setChannel(ch)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4" />
                        {ch === "email" ? "Email" : "SMS"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {ch === "email" ? "Free with your plan" : "2 credits per send"}
                      </div>
                      {reason && <div className="mt-1 text-xs text-muted-foreground">{reason}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Subject (email only) */}
          {channel === "email" && (
            <div className="space-y-2">
              <Label htmlFor="msg-subject">Subject</Label>
              <Input
                id="msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What is this message about?"
              />
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="msg-body">Message</Label>
            <Textarea
              id="msg-body"
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Write your message here..."
              required
            />
            <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/20 p-2.5">
              <span className="mr-1 text-xs text-muted-foreground">Personalise:</span>
              {variableTokens.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted/60"
                >
                  + {v.label}
                </button>
              ))}
            </div>
            {channel === "sms" && (
              <p className="text-xs text-muted-foreground">
                {smsChars} character{smsChars === 1 ? "" : "s"} &bull; {smsParts} SMS part{smsParts === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {/* Credits info */}
          {channel === "sms" && (
            <div className="rounded-2xl border bg-muted/30 px-3.5 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Your SMS balance</span>
                <span className="font-semibold">{creditBalance} credits</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">This message costs</span>
                <span className="font-semibold">{creditCost} credits</span>
              </div>
              {hasInsufficientCredits && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You need {creditCost - creditBalance} more credit{creditCost - creditBalance === 1 ? "" : "s"} to send this SMS.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {disabledReason && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{disabledReason}</AlertDescription>
            </Alert>
          )}

          {isSubmitting && (
            <Progress value={sendProgress} className="h-1.5" />
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid() || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting
                ? "Sending..."
                : channel === "email"
                  ? "Send Email"
                  : "Send SMS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
