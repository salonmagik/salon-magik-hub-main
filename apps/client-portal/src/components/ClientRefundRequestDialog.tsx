import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@shared/currency";
import { OutcomeDialog } from "@ui/outcome-dialog";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

interface ClientRefundRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: { id: string; amount: number; currency: string; tenantName: string } | null;
}

export function ClientRefundRequestDialog({ open, onOpenChange, transaction }: ClientRefundRequestDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(transaction ? String(transaction.amount) : "");
    setReason("");
    setError("");
    setSubmitted(false);
  }, [open, transaction]);

  if (!transaction) return null;

  const submit = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > transaction.amount) {
      setError(`Enter an amount between 0.01 and ${formatCurrency(transaction.amount, transaction.currency)}.`);
      return;
    }
    if (!reason.trim()) {
      setError("Tell the salon why you are requesting a refund.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    const { error: requestError } = await supabase.rpc("request_customer_refund" as never, {
      p_transaction_id: transaction.id,
      p_amount: numericAmount,
      p_reason: reason.trim(),
    } as never);
    setIsSubmitting(false);

    if (requestError) {
      setError(requestError.message || "We could not send your request. Please try again.");
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <OutcomeDialog
        open={open}
        onClose={() => onOpenChange(false)}
        status="success"
        title="Refund request sent"
        description={`The salon will review your request for ${formatCurrency(Number(amount), transaction.currency)}. The salon decides whether to issue salon credit or a direct transfer.`}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a refund</DialogTitle>
          <DialogDescription>
            Send {transaction.tenantName} a request to review this payment. A salon owner or manager must approve it.
          </DialogDescription>
        </DialogHeader>
        <div className={DIALOG_BODY_PADDING + " space-y-4"}>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span>Payment</span><span className="font-medium">{formatCurrency(transaction.amount, transaction.currency)}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">You can request all or part of the payment. Transaction fees are not refundable.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-refund-amount">Amount requested</Label>
            <Input id="client-refund-amount" type="number" min="0.01" max={transaction.amount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-refund-reason">Reason</Label>
            <Textarea id="client-refund-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell the salon what happened" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
