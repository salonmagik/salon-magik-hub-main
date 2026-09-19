import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { OutcomeDialog } from "@ui/outcome-dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Alert, AlertDescription } from "@ui/alert";
import { CircleDollarSign, Loader2, RotateCcw, TriangleAlert, WalletCards } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@shared/utils";
import { formatCurrency } from "@shared/currency";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";

const WITHDRAWN_FUNDS_MESSAGE =
  "This payment has already been withdrawn, so Salon Magik can't move the money for you. Refund the customer directly and record it below.";

class RefundSubmitError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function extractRefundError(error: unknown): Promise<RefundSubmitError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const response = error.context as Response | undefined;
      const payload = response ? await response.json() : null;
      if (payload && typeof payload === "object") {
        const message = typeof payload.error === "string" ? payload.error : "Unable to complete the refund.";
        const code = typeof payload.code === "string" ? payload.code : undefined;
        return new RefundSubmitError(message, code);
      }
    } catch {
      // fall through to the generic handling below
    }
  }
  if (error instanceof Error) return new RefundSubmitError(error.message);
  return new RefundSubmitError("Unable to complete the refund.");
}

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
  provider?: string | null;
  provider_reference?: string | null;
  customer?: { id: string; full_name: string } | null;
}

interface RecoverabilityInfo {
  requiresWalletDebit: boolean;
  walletBalance: number;
  currency: string;
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
  const [recoverability, setRecoverability] = useState<RecoverabilityInfo | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const currency = transaction?.currency || currentTenant?.currency || "USD";
  const isApproval = Boolean(request);
  const actionLabel = mode === "complete" ? "Make refund" : "Request refund";
  // Gateway refunds are intentionally handled outside Salon Magik for now.
  // This dialog records salon credit or a direct cash/transfer refund only.

  const numericAmount = Number(amount);

  // Advisory only — the backend (debit_salon_wallet_for_refund) is the real
  // guarantee. If the check failed to resolve, destinations stay selectable
  // and the backend decides at submit, per the usability NFR.
  const walletShortfall = Boolean(
    mode === "complete" &&
      recoverability?.requiresWalletDebit &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0 &&
      numericAmount > recoverability.walletBalance,
  );
  const storeCreditBlockedByWallet = mode === "complete" && !isApproval && walletShortfall;
  const bothDestinationsBlocked = storeCreditBlockedByWallet;

  useEffect(() => {
    if (!open || !transaction) return;
    setStage("form");
    setErrorMessage("");
    setAmount(request ? String(request.amount) : "");
    setReason(request?.reason || "");
    setRefundType(request?.refund_type === "offline" ? "offline" : "store_credit");
    setRecoverability(null);
    idempotencyKeyRef.current = crypto.randomUUID();

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

    if (mode === "complete") {
      supabase
        .rpc("check_refund_recoverability" as never, { p_transaction_id: transaction.id } as never)
        .then(({ data, error }) => {
          if (error || !data) return;
          const result = data as { requires_wallet_debit: boolean; wallet_balance: number; currency: string };
          setRecoverability({
            requiresWalletDebit: result.requires_wallet_debit,
            walletBalance: Number(result.wallet_balance),
            currency: result.currency,
          });
        });
    }
  }, [open, request, transaction, mode]);

  // If the amount is raised past what the wallet can cover after a
  // wallet-gated destination was already selected, fall back to the one
  // destination that's never gated on the wallet.
  useEffect(() => {
    if (walletShortfall && refundType === "store_credit") {
      setRefundType("offline");
    }
  }, [walletShortfall, refundType]);

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
        const { data, error } = await supabase.functions.invoke("refund-via-paystack", {
          body: {
            transactionId: transaction.id,
            amount: numericAmount,
            reason: reason.trim(),
            requestId: request?.id || null,
            refundType,
            idempotencyKey: idempotencyKeyRef.current,
          },
        });
        if (error) throw await extractRefundError(error);
        if (data?.error) throw new RefundSubmitError(data.error, data.code);
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
      if (error instanceof RefundSubmitError && error.code === "INSUFFICIENT_RECOVERABLE_FUNDS") {
        setErrorMessage(WITHDRAWN_FUNDS_MESSAGE);
      } else {
        setErrorMessage(error instanceof Error ? error.message : `Unable to ${actionLabel.toLowerCase()}.`);
      }
      setStage("error");
    }
  };

  const handleTryAgain = () => {
    // A declined/failed attempt is terminal. A fresh key allows a genuinely
    // new attempt; if the prior outcome is still pending, the backend's
    // transaction lock and pending-refund guard reject the duplicate.
    idempotencyKeyRef.current = crypto.randomUUID();
    setStage("form");
  };

  const close = () => onOpenChange(false);

  if (!transaction) return null;
  if (stage === "success") return <OutcomeDialog open={open} onClose={close}
    status="success"
    title={mode !== "complete" ? "Refund request sent" : "Refund recorded"}
    description={mode !== "complete"
      ? "An owner or manager can now review this request. The requested amount is reserved from further refunds."
      : refundType === "store_credit"
        ? `${formatCurrency(numericAmount, currency)} is now available in ${transaction.customer?.full_name || "the customer"}'s salon balance.`
        : `${formatCurrency(numericAmount, currency)} has been recorded as refunded outside Salon Magik.`}
  />;


  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (stage === "submitting") return;
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="sm:max-w-lg">
        {stage === "error" ? (
          <div className={cn(DIALOG_BODY_PADDING, "text-center")}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <TriangleAlert className="h-7 w-7 text-destructive" />
            </div>
            <DialogTitle>{mode === "complete" ? "Refund wasn’t completed" : "Request wasn’t sent"}</DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm">{errorMessage}</DialogDescription>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={close}>Close</Button>
              <Button className="flex-1" onClick={handleTryAgain}>
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
                      {refundType === "store_credit"
                        ? "Customer salon balance"
                        : "Cash / transfer outside Salon Magik"}
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
                      disabled={isApproval || storeCreditBlockedByWallet}
                      onClick={() => setRefundType("store_credit")}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        storeCreditBlockedByWallet
                          ? "cursor-not-allowed opacity-60"
                          : refundType === "store_credit" ? "border-primary bg-primary/5" : "hover:border-primary/40",
                        isApproval && !storeCreditBlockedByWallet && "cursor-default",
                      )}
                    >
                      <WalletCards className="mb-3 h-5 w-5 text-primary" />
                      <p className="text-sm font-medium">Salon balance</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {storeCreditBlockedByWallet
                          ? "Unavailable — store credit is funded from your salon balance, which no longer holds this payment."
                          : "Immediately available as store credit."}
                      </p>
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
                  {bothDestinationsBlocked && (
                    <p className="text-xs text-muted-foreground">{WITHDRAWN_FUNDS_MESSAGE}</p>
                  )}
                </div>

                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="note">
                  Transaction fees are non-refundable. They will not be returned when you issue a refund.
                </p>
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
