import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Input } from "@ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { ArrowDownLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type Transaction = Tables<"transactions"> & {
  customer?: { id: string; full_name: string } | null;
};

interface RequestRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSuccess?: () => void;
}

export function RequestRefundDialog({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: RequestRefundDialogProps) {
  const { currentTenant, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    reason: "",
    refundType: "original_method" as "original_method" | "store_credit" | "offline",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || !currentTenant?.id) return;

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0 || amount > Number(transaction.amount)) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid refund amount",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("refund_requests").insert({
        tenant_id: currentTenant.id,
        transaction_id: transaction.id,
        customer_id: transaction.customer_id!,
        amount,
        reason: formData.reason,
        refund_type: formData.refundType,
        requested_by_id: user?.id,
        status: "pending",
      });

      if (error) throw error;

      // Log audit event
      await supabase.rpc("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "create",
        _entity_type: "refund_request",
        _entity_id: transaction.id,
        _after_json: { amount, reason: formData.reason, refund_type: formData.refundType },
      });

      toast({ title: "Refund requested", description: "Your refund request has been submitted for approval" });
      setFormData({ amount: "", reason: "", refundType: "original_method" });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Error requesting refund:", err);
      toast({ title: "Error", description: "Failed to submit refund request", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  const currency = currentTenant?.currency || "USD";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <ArrowDownLeft className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <DialogTitle>Request Refund</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Submit a refund request for approval
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-sm">
              <span className="text-muted-foreground">Original transaction:</span>{" "}
              <span className="font-medium">{currency} {Number(transaction.amount).toFixed(2)}</span>
            </p>
            {transaction.customer && (
              <p className="text-sm mt-1">
                <span className="text-muted-foreground">Customer:</span>{" "}
                <span className="font-medium">{transaction.customer.full_name}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Refund Amount <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              step="0.01"
              max={Number(transaction.amount)}
              placeholder={`Max: ${Number(transaction.amount).toFixed(2)}`}
              value={formData.amount}
              onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Refund Type <span className="text-destructive">*</span></Label>
            <Select
              value={formData.refundType}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, refundType: v as typeof formData.refundType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original_method">Original Payment Method</SelectItem>
                <SelectItem value="store_credit">Store Credit (Purse)</SelectItem>
                <SelectItem value="offline">Offline Refund</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Explain why this refund is being requested..."
              value={formData.reason}
              onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
              rows={3}
              required
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
            <Button type="submit" variant="destructive" className="gap-2 w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownLeft className="w-4 h-4" />}
              Request Refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
