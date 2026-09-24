import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useSalonWalletAvailability } from "@/hooks/useSalonWalletAvailability";
import { usePayoutDestinations } from "@/hooks/usePayoutDestinations";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { quoteWithdrawal } from "@shared/withdrawal-fees";
import { formatCurrency, getMinimumWithdrawal } from "@shared/currency";
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
  locationId?: string | null;
  currencyOverride?: string;
  onWithdrawalCreated?: () => void | Promise<void>;
  onAddPayoutDestination?: () => void;
}

export function WithdrawalDialog({ open, onOpenChange, locationId = null, currencyOverride, onWithdrawalCreated, onAddPayoutDestination }: WithdrawalDialogProps) {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const { wallet, isLoading: walletLoading } = useSalonWallet(tenantId, locationId);
  const { availability, isLoading: availabilityLoading, refetch: refetchAvailability } = useSalonWalletAvailability(tenantId, locationId);
  const { destinations, isLoading: destinationsLoading, refetch: refetchDestinations } = usePayoutDestinations(tenantId);
  const { createWithdrawal } = useWithdrawals(tenantId, locationId);
  const currency = currencyOverride ?? wallet?.currency ?? availability?.currency ?? currentTenant?.currency ?? "NGN";

  // No implicit fallback: a branch only sees destinations explicitly pinned
  // to it; the General wallet only sees the tenant's default destination(s).
  const pinnedDestinations = destinations.filter((item) =>
    locationId ? item.location_ids.includes(locationId) : !!item.is_default
  );
  // A branch with nothing pinned yet gets nudged to pick any existing,
  // currency-matching account instead of just being told to go add one —
  // picking here pins it to this branch going forward (see handleWithdraw).
  const needsBranchAssignment = !!locationId && pinnedDestinations.length === 0;
  const scopedDestinations = needsBranchAssignment
    ? destinations.filter((item) => item.currency === currency)
    : pinnedDestinations;

  const [selectedDestinationId, setSelectedDestinationId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  // Get minimum withdrawal amount based on currency
  const minWithdrawal = getMinimumWithdrawal(currency);
  const walletBalance = Number(wallet?.balance || 0);
  // Do not allow a withdrawal until cleared availability is known.
  const availableBalance = availability?.available ?? 0;
  const pendingBalance = availability?.pending ?? 0;
  const nextSettlementAt = availability?.nextSettlementAt
    ? new Date(availability.nextSettlementAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : null;

  const destination = scopedDestinations.find((item) => item.id === selectedDestinationId);
  let quote: ReturnType<typeof quoteWithdrawal> | null = null;
  let quoteError = "";
  if (amount && destination) {
    try { quote = quoteWithdrawal(Number(amount), currency, destination.destination_type); }
    catch (error) { quoteError = error instanceof Error ? error.message : "Invalid withdrawal"; }
  }

  // Reset form when dialog opens. Also refetch destinations — this dialog's
  // own usePayoutDestinations instance fetches once at mount, which can be
  // long before the salon actually has a destination configured (or before
  // one added on the Accounts tab exists yet), leaving it permanently stale
  // for the life of the page without this.
  useEffect(() => {
    if (open) {
      setSelectedDestinationId("");
      setAmount("");
      setError("");
      refetchAvailability();
      refetchDestinations();
    }
  }, [open, refetchAvailability, refetchDestinations]);

  // Validate amount
  const validateAmount = (value: string): string | null => {
    const numValue = Number(value);

    if (!value || numValue <= 0) {
      return "Please enter a valid amount";
    }

    if (numValue < minWithdrawal) {
      return `Minimum withdrawal is ${formatCurrency(minWithdrawal, currency)}`;
    }

    if (!Number.isFinite(numValue)) return "Please enter a valid amount";
    let totalDebit = numValue;
    if (destination) {
      try { totalDebit = quoteWithdrawal(numValue, currency, destination.destination_type).totalDebit; }
      catch (error) { return error instanceof Error ? error.message : "Invalid withdrawal"; }
    }
    if (totalDebit > availableBalance) {
      return pendingBalance > 0
        ? `Only ${formatCurrency(availableBalance, currency)} has cleared and is available to withdraw right now. The rest is still settling.`
        : `Insufficient balance to cover the amount and fees. Available: ${formatCurrency(availableBalance, currency)}`;
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

    if (!quote || !availability || availabilityLoading) {
      setError("Wait for your balance and fee quote before withdrawing");
      return;
    }
    setIsSubmitting(true);
    setError("");

    try {
      // First withdrawal from a branch with no pinned account yet — the
      // one just picked becomes that branch's explicit account going
      // forward, matching what the backend now requires (no more implicit
      // fallback to a "default" destination for an unassigned branch).
      if (needsBranchAssignment && locationId) {
        const { error: pinError } = await supabase
          .from("salon_payout_destinations")
          .update({ location_ids: [...(destination?.location_ids ?? []), locationId] })
          .eq("id", selectedDestinationId);
        if (pinError) {
          setError("Couldn't assign this account to the branch. Please try again.");
          setIsSubmitting(false);
          return;
        }
        await refetchDestinations();
      }

      const result = await createWithdrawal({
        tenantId,
        payoutDestinationId: selectedDestinationId,
        locationId,
        amount: Number(amount),
        acceptedTotalDebit: quote.totalDebit,
        feeVersion: quote.feeVersion,
      });

      if (result) {
        // Success - close dialog and reset form
        onOpenChange(false);
        setSelectedDestinationId("");
        setAmount("");
        await onWithdrawalCreated?.();
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
  const currentError = quoteError || (amount ? validateAmount(amount) : "");
  const canSubmit = !isSubmitting && !currentError && !!quote && !!availability && !availabilityLoading && !isLoading;

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

            {!availabilityLoading && availableBalance < minWithdrawal && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                Withdrawals start at {formatCurrency(minWithdrawal, currency)} plus transfer charges.
                Your cleared balance is {formatCurrency(availableBalance, currency)}.
              </p>
            )}
            {/* Payout Destination Selection */}
            <div className="space-y-2">
              <Label htmlFor="destination">Payout Destination</Label>
              {needsBranchAssignment && scopedDestinations.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  This branch doesn't have a payout account yet — pick one below and it'll be used for this branch going forward.
                </p>
              )}
              {scopedDestinations.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-2">
                    <p>No payout destinations configured. Please add a bank account or mobile money account first.</p>
                    {onAddPayoutDestination && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { onOpenChange(false); onAddPayoutDestination(); }}
                      >
                        Add payout account
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedDestinationId}
                  onValueChange={(value) => { setSelectedDestinationId(value); setError(""); }}
                >
                  <SelectTrigger id="destination">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopedDestinations.map((dest) => (
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
              <Label htmlFor="amount">Withdrawal amount ({currency})</Label>
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

            {quote && (
              <div className="rounded-lg border p-3 space-y-2 text-sm" aria-live="polite">
                <div className="flex justify-between"><span>Amount sent to payout account</span><span>{formatCurrency(quote.amount, currency)}</span></div>
                <div className="flex justify-between"><span>Paystack transfer fee (salon pays)</span><span>{formatCurrency(quote.transferFee, currency)}</span></div>
                {quote.stampDuty > 0 && <div className="flex justify-between"><span>Stamp duty</span><span>{formatCurrency(quote.stampDuty, currency)}</span></div>}
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total wallet deduction</span><span>{formatCurrency(quote.totalDebit, currency)}</span></div>
                <p className="text-xs text-muted-foreground">This amount is reserved until the transfer completes.</p>
                {quote.stampDuty > 0 && <p className="text-xs text-muted-foreground">Once applied by Paystack, stamp duty is non-refundable, including if the transfer is reversed.</p>}
              </div>
            )}

            {/* Error Message */}
            {(currentError || error) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{currentError || error}</AlertDescription>
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
            disabled={!canSubmit || scopedDestinations.length === 0}
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
