import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Alert, AlertDescription } from "@ui/alert";
import { CheckCircle2, CircleDollarSign, Loader2, RotateCcw, TriangleAlert, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@shared/utils";
import { formatCurrency } from "@shared/currency";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

type RefundType = "store_credit" | "offline";
type Stage = "form" | "confirm" | "submitting" | "success" | "error";

interface RefundTransaction {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  appointment_id: string | null;
  amount: number;
  method: string;
  status: string;
  type: string;
  currency: string;
  customer?: { id: string; full_name: string } | null;
}

interface PendingRefund {
  id: string;
  amount: number;
  reason: string;
  refund_type: string;
}

interface RequestRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: RefundTransaction | null;
  mode?: "request" | "complete";
  request?: PendingRefund | null;
  onSuccess?: () => void;
}

export function RequestRefundDialog({
  open,
  onOpenChange,
  transaction,
  mode = "request",
  request = null,
  onSuccess,
}: RequestRefundDialogProps) {
  const { currentTenant } = useAuth();
  const [stage, setStage] = useState<Stage>("form");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundType, setRefundType] = useState<RefundType>("store_credit");
  const [maxRefundAmount, setMaxRefundAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const currency = transaction?.currency || currentTenant?.currency || "USD";
  const isApproval = Boolean(request);
  const actionLabel = mode === "complete" ? "Make refund" : "Request refund";

  useEffect(() => {
    if (!open || !transaction) return;
    setStage("form");
    setErrorMessage("");
    setAmount(request ? String(request.amount) : "");
    setReason(request?.reason || "");
    setRefundType(request?.refund_type === "offline" ? "offline" : "store_credit");

    const loadRefundableAmount = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("refund_requests")
        .select("id, amount, status")
        .eq("transaction_id", transaction.id)
        .in("status", ["pending", "approved", "completed"]);

      if (error) {
        setErrorMessage(error.message);
        setStage("error");
      } else {
        const reserved = (data || [])
          .filter((entry) => entry.id !== request?.id)
          .reduce((sum, entry) => sum + Number(entry.amount), 0);
        setMaxRefundAmount(Math.max(0, Number(transaction.amount) - reserved));
      }
      setIsLoading(false);
    };

    void loadRefundableAmount();
  }, [open, request, transaction]);

  const numericAmount = Number(amount);
  const validationMessage = useMemo(() => {
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return "Enter a refund amount greater than zero.";
    }
    if (numericAmount > maxRefundAmount) {
      return `The maximum available refund is ${formatCurrency(maxRefundAmount, currency)}.`;
    }
    if (!reason.trim()) return "Add a reason for the refund.";
    return "";
  }, [amount, currency, maxRefundAmount, numericAmount, reason]);

  const handleContinue = () => {
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }
    setErrorMessage("");
    setStage("confirm");
  };

  const handleSubmit = async () => {
    if (!transaction || validationMessage) return;
    setStage("submitting");
    setErrorMessage("");

    try {
      if (mode === "complete") {
        const { error } = await supabase.rpc("complete_transaction_refund" as never, {
          p_transaction_id: transaction.id,
          p_amount: numericAmount,
          p_refund_type: refundType,
          p_reason: reason.trim(),
          p_request_id: request?.id || null,
        } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("request_transaction_refund" as never, {
          p_transaction_id: transaction.id,
          p_amount: numericAmount,
          p_refund_type: refundType,
          p_reason: reason.trim(),
        } as never);
        if (error) throw error;
      }

      setStage("success");
      onSuccess?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to ${actionLabel.toLowerCase()}.`);
      setStage("error");
    }
  };

  const close = () => onOpenChange(false);

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (stage === "submitting") return;
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="sm:max-w-lg">
        {stage === "success" ? (
          <div className={cn(DIALOG_BODY_PADDING, "text-center")}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <DialogTitle>
              {mode === "complete" ? "Refund recorded" : "Refund request sent"}
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm">
              {mode === "complete"
                ? refundType === "store_credit"
                  ? `${formatCurrency(numericAmount, currency)} is now available in ${transaction.customer?.full_name || "the customer"}'s salon balance.`
                  : `${formatCurrency(numericAmount, currency)} has been recorded as refunded outside Salon Magik.`
                : "An owner or manager can now review this request. The requested amount is reserved from further refunds."}
            </DialogDescription>
            <Button className="mt-6 w-full" onClick={close}>Done</Button>
          </div>
        ) : stage === "error" ? (
          <div className={cn(DIALOG_BODY_PADDING, "text-center")}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <TriangleAlert className="h-7 w-7 text-destructive" />
            </div>
            <DialogTitle>{mode === "complete" ? "Refund wasn’t completed" : "Request wasn’t sent"}</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm">{errorMessage}</DialogDescription>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={close}>Close</Button>
              <Button className="flex-1" onClick={() => setStage("form")}>
                <RotateCcw className="mr-2 h-4 w-4" />Try again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <CircleDollarSign className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle>
                {stage === "confirm"
                  ? mode === "complete" ? "Confirm refund" : "Confirm refund request"
                  : isApproval
                    ? "Review refund request"
                    : actionLabel}
              </DialogTitle>
              <DialogDescription>
                {stage === "confirm"
                  ? "Review these details carefully. A recorded refund cannot be edited."
                  : `${transaction.customer?.full_name || "Customer"} · ${formatCurrency(Number(transaction.amount), currency)} transaction`}
              </DialogDescription>
            </DialogHeader>

            {stage === "submitting" ? (
              <div className={cn(DIALOG_BODY_PADDING, "flex flex-col items-center justify-center")}>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {mode === "complete" ? "Recording refund…" : "Sending request…"}
                </p>
              </div>
            ) : stage === "confirm" ? (
              <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
                <div className="rounded-xl border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="text-lg font-semibold">{formatCurrency(numericAmount, currency)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground">Destination</span>
                    <span className="text-sm font-medium">
                      {refundType === "store_credit" ? "Customer salon balance" : "Cash / transfer outside Salon Magik"}
                    </span>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <p className="text-sm text-muted-foreground">Reason</p>
                    <p className="mt-1 text-sm">{reason}</p>
                  </div>
                </div>
                {refundType === "offline" && mode === "complete" && (
                  <Alert>
                    <AlertDescription>
                      Salon Magik records this refund but does not send money to the customer. Confirm the cash or transfer separately.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className={cn(DIALOG_BODY_PADDING, "space-y-5")}>
                <div className="grid grid-cols-2 gap-3 rounded-xl border bg-surface p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Transaction</p>
                    <p className="mt-1 font-medium">{formatCurrency(Number(transaction.amount), currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Available to refund</p>
                    <p className="mt-1 font-medium text-primary">
                      {isLoading ? "Calculating…" : formatCurrency(maxRefundAmount, currency)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Refund destination</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={isApproval}
                      onClick={() => setRefundType("store_credit")}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        refundType === "store_credit" ? "border-primary bg-primary/5" : "hover:border-primary/40",
                        isApproval && "cursor-default",
                      )}
                    >
                      <WalletCards className="mb-3 h-5 w-5 text-primary" />
                      <p className="text-sm font-medium">Salon balance</p>
                      <p className="mt-1 text-xs text-muted-foreground">Immediately available as store credit.</p>
                    </button>
                    <button
                      type="button"
                      disabled={isApproval}
                      onClick={() => setRefundType("offline")}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        refundType === "offline" ? "border-primary bg-primary/5" : "hover:border-primary/40",
                        isApproval && "cursor-default",
                      )}
                    >
                      <CircleDollarSign className="mb-3 h-5 w-5 text-primary" />
                      <p className="text-sm font-medium">Cash / transfer</p>
                      <p className="mt-1 text-xs text-muted-foreground">Handled outside Salon Magik.</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="refund-amount">Amount</Label>
                    {!isApproval && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary"
                        onClick={() => setAmount(maxRefundAmount.toFixed(2))}
                        disabled={isLoading || maxRefundAmount <= 0}
                      >
                        All
                      </Button>
                    )}
                  </div>
                  <Input
                    id="refund-amount"
                    type="number"
                    min="0.01"
                    max={maxRefundAmount}
                    step="0.01"
                    value={amount}
                    disabled={isApproval}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "" || Number(next) <= maxRefundAmount) setAmount(next);
                    }}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refund-reason">Reason</Label>
                  <Textarea
                    id="refund-reason"
                    rows={3}
                    value={reason}
                    disabled={isApproval}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is this transaction being refunded?"
                  />
                </div>

                {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
              </div>
            )}

            {stage !== "submitting" && (
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => stage === "confirm" ? setStage("form") : close()}
                >
                  {stage === "confirm" ? "Back" : "Cancel"}
                </Button>
                <Button
                  variant={mode === "complete" ? "destructive" : "default"}
                  disabled={isLoading || maxRefundAmount <= 0}
                  onClick={stage === "confirm" ? handleSubmit : handleContinue}
                >
                  {stage === "confirm"
                    ? mode === "complete" ? "Confirm refund" : "Send request"
                    : "Continue"}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
