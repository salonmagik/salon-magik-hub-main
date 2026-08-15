import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useSalonWalletAvailability } from "@/hooks/useSalonWalletAvailability";
import { usePayoutDestinations } from "@/hooks/usePayoutDestinations";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { formatCurrency } from "@shared/currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Alert, AlertDescription } from "@ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Loader2, AlertCircle, Wallet, Info } from "lucide-react";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";

interface WithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WithdrawalDialog({ open, onOpenChange }: WithdrawalDialogProps) {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const currency = currentTenant?.currency || "NGN";

  const { wallet, isLoading: walletLoading } = useSalonWallet(tenantId);
  const { availability, isLoading: availabilityLoading, refetch: refetchAvailability } = useSalonWalletAvailability(tenantId);
  const { destinations, isLoading: destinationsLoading } = usePayoutDestinations(tenantId);
  const { createWithdrawal } = useWithdrawals(tenantId);

  const [selectedDestinationId, setSelectedDestinationId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  // Get minimum withdrawal amount based on currency
  const minWithdrawal = currency === "NGN" ? 1000 : 50;
  const walletBalance = Number(wallet?.balance || 0);
  // Fall back to the raw wallet balance while availability is still loading
  // so the dialog doesn't briefly claim $0 is withdrawable.
  const availableBalance = availability ? availability.available : walletBalance;
  const pendingBalance = availability?.pending ?? 0;
  const nextSettlementAt = availability?.nextSettlementAt
    ? new Date(availability.nextSettlementAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : null;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedDestinationId("");
      setAmount("");
      setError("");
      refetchAvailability();
    }
  }, [open, refetchAvailability]);

  // Validate amount
  const validateAmount = (value: string): string | null => {
    const numValue = Number(value);

    if (!value || numValue <= 0) {
      return "Please enter a valid amount";
    }

    if (numValue < minWithdrawal) {
      return `Minimum withdrawal is ${formatCurrency(minWithdrawal, currency)}`;
    }

    if (numValue > availableBalance) {
      return pendingBalance > 0
        ? `Only ${formatCurrency(availableBalance, currency)} has cleared and is available to withdraw right now. The rest is still settling.`
        : `Insufficient balance. Available: ${formatCurrency(availableBalance, currency)}`;
    }

    return null;
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const validationError = validateAmount(value);
    setError(validationError || "");
  };

  const handleWithdraw = async () => {
    if (!tenantId) {
      setError("No tenant ID found");
      return;
    }

    if (!selectedDestinationId) {
      setError("Please select a payout destination");
      return;
    }

    const validationError = validateAmount(amount);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await createWithdrawal({
        tenantId,
        payoutDestinationId: selectedDestinationId,
        amount: Number(amount),
      });

      if (result) {
        // Success - close dialog and reset form
        onOpenChange(false);
        setSelectedDestinationId("");
        setAmount("");
      }
    } catch (err) {
      console.error("Error processing withdrawal:", err);
      // Error is already displayed via toast in the hook, but we keep it in state for inline display
      setError(
        err instanceof Error 
          ? err.message 
          : "We're unable to process your withdrawal at this time. Please contact support for assistance."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = walletLoading || destinationsLoading;
  const canSubmit = !isSubmitting && !error && amount && selectedDestinationId && !isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Withdraw Funds
          </DialogTitle>
          <DialogDescription>
            Transfer funds from your wallet to your bank or mobile money account
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className={cn(DIALOG_BODY_PADDING, "flex items-center justify-center")}>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
            {/* Wallet Balance */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-1">
                <p className="text-sm text-muted-foreground mb-1">Available to Withdraw</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-64 text-xs">
                    Funds that have fully cleared with our payment processor and can be paid out right now.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold">
                {availabilityLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  formatCurrency(availableBalance, currency)
                )}
              </p>
              {pendingBalance > 0 && (
                <div className="mt-2 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1.5 text-amber-800">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-start gap-1 cursor-default">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <p className="text-xs">
                          {formatCurrency(pendingBalance, currency)} still settling
                          {nextSettlementAt ? ` — available by ${nextSettlementAt}` : ""}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64 text-xs">
                      Recent payments are held by our payment processor (Paystack) for up to 1 business day before they can be paid out. This is standard for all Paystack merchants, not specific to your account.
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Total wallet balance: {formatCurrency(walletBalance, currency)} · Minimum withdrawal: {formatCurrency(minWithdrawal, currency)}
              </p>
            </div>

            {/* Payout Destination Selection */}
            <div className="space-y-2">
              <Label htmlFor="destination">Payout Destination</Label>
              {destinations.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No payout destinations configured. Please add a bank account or mobile money account first.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedDestinationId}
                  onValueChange={setSelectedDestinationId}
                >
                  <SelectTrigger id="destination">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((dest) => (
                      <SelectItem key={dest.id} value={dest.id}>
                        {dest.destination_type === "bank"
                          ? `${dest.bank_name} - ${dest.account_number}`
                          : `${dest.momo_provider} - ${dest.momo_number}`}
                        {dest.is_default && " (Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({currency})</Label>
              <Input
                id="amount"
                type="number"
                placeholder={`Min: ${minWithdrawal}`}
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                min={minWithdrawal}
                max={availableBalance}
                step="0.01"
              />
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleWithdraw}
            disabled={!canSubmit || destinations.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
