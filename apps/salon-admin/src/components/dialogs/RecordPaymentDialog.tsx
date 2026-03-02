import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { CreditCard, Coins, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useCustomers } from "@/hooks/useCustomers";
import { toast } from "@ui/ui/use-toast";
import { cn } from "@shared/utils";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  appointmentId?: string;
  customerId?: string;
  defaultAmount?: number;
}

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "pos", label: "POS" },
  { value: "transfer", label: "Bank Transfer" },
] as const;

export function RecordPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  appointmentId,
  customerId: propCustomerId,
  defaultAmount,
}: RecordPaymentDialogProps) {
  const { currentTenant } = useAuth();
  const { customers, isLoading: customersLoading } = useCustomers();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerId: propCustomerId || "",
    amount: defaultAmount?.toString() || "",
    method: "cash" as (typeof paymentMethods)[number]["value"],
    type: "payment",
    reference: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("transactions").insert({
        tenant_id: currentTenant.id,
        customer_id: formData.customerId && formData.customerId !== "_none" ? formData.customerId : null,
        appointment_id: appointmentId || null,
        amount: parseFloat(formData.amount),
        method: formData.method,
        type: formData.type,
        provider_reference: formData.reference || null,
        status: "completed",
      });

      if (error) throw error;

      toast({ title: "Success", description: "Payment recorded successfully" });
      setFormData({
        customerId: propCustomerId || "",
        amount: "",
        method: "cash",
        type: "payment",
        reference: "",
        notes: "",
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Error recording payment:", err);
      toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-success/10">
            <CreditCard className="w-5 h-5 text-success" />
          </div>
          <div>
            <DialogTitle className="text-xl">Record Payment</DialogTitle>
            <p className="text-sm text-muted-foreground">Log a payment transaction</p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Customer */}
          {!propCustomerId && (
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={formData.customerId}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, customerId: v }))}
                disabled={customersLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={customersLoading ? "Loading..." : "Select customer (optional)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No customer</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label>
              Amount <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              {/* <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /> */}
              <Input
                type="number"
                placeholder="0.00"
                className="pl-9 text-lg font-semibold"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                required
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <RadioGroup
              value={formData.method}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, method: v as typeof formData.method }))}
              className="grid grid-cols-3 gap-2"
            >
              {paymentMethods.map((method) => (
                <label
                  key={method.value}
                  className={cn(
                    "flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all text-sm",
                    formData.method === method.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <RadioGroupItem value={method.value} className="sr-only" />
                  <span>{method.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Reference */}
          <div className="space-y-2">
            <Label>Reference (Optional)</Label>
            <Input
              placeholder="Transaction ID or receipt number"
              value={formData.reference}
              onChange={(e) => setFormData((prev) => ({ ...prev, reference: e.target.value }))}
            />
          </div>

          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
