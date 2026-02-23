import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalonWallet } from "@/hooks/useSalonWallet";
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
import { Loader2, AlertCircle, Wallet } from "lucide-react";

interface WithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WithdrawalDialog({ open, onOpenChange }: WithdrawalDialogProps) {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const currency = currentTenant?.currency || "NGN";

  const { wallet, isLoading: walletLoading } = useSalonWallet(tenantId);
  const { destinations, isLoading: destinationsLoading } = usePayoutDestinations(tenantId);
  const { createWithdrawal } = useWithdrawals(tenantId);

  const [selectedDestinationId, setSelectedDestinationId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  // Get minimum withdrawal amount based on currency
  const minWithdrawal = currency === "NGN" ? 1000 : 50;
  const walletBalance = Number(wallet?.balance || 0);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedDestinationId("");
      setAmount("");
      setError("");
    }
  }, [open]);

  // Validate amount
  const validateAmount = (value: string): string | null => {
    const numValue = Number(value);

    if (!value || numValue <= 0) {
      return "Please enter a valid amount";
    }

    if (numValue < minWithdrawal) {
      return `Minimum withdrawal is ${formatCurrency(minWithdrawal, currency)}`;
    }

    if (numValue > walletBalance) {
      return `Insufficient balance. Available: ${formatCurrency(walletBalance, currency)}`;
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
      setError(err instanceof Error ? err.message : "Failed to process withdrawal");
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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Wallet Balance */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
              <p className="text-2xl font-bold">
                {formatCurrency(walletBalance, currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Minimum withdrawal: {formatCurrency(minWithdrawal, currency)}
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
                max={walletBalance}
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
