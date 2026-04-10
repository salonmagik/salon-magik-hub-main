import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useTopUp } from "@/hooks/useTopUp";
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
import { Alert, AlertDescription } from "@ui/alert";
import { Loader2, AlertCircle, Wallet, Plus, TrendingUp } from "lucide-react";
import { cn } from "@shared/utils";

interface TopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopUpDialog({ open, onOpenChange }: TopUpDialogProps) {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const currency = currentTenant?.currency || "USD";

  const { wallet, isLoading: walletLoading } = useSalonWallet(tenantId);
  const {
    createTopUp,
    recentTopUps,
    isLoading,
    isFetchingHistory,
    getMinimumAmount,
    getPresetAmounts,
  } = useTopUp(tenantId, currency);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  const walletBalance = Number(wallet?.balance || 0);
  const minAmount = getMinimumAmount(currency);
  const presetAmounts = getPresetAmounts(currency);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedAmount(null);
      setCustomAmount("");
      setError("");
    }
  }, [open]);

  // Validate amount
  const validateAmount = (value: number): string | null => {
    if (!value || value <= 0) {
      return "Please enter a valid amount";
    }

    if (value < minAmount) {
      return `Minimum top-up is ${formatCurrency(minAmount, currency)}`;
    }

    // Optional: Set maximum limits
    const maxAmounts: { [key: string]: number } = {
      NGN: 1000000, // 1M NGN
      GHS: 10000,   // 10K GHS
      USD: 10000,   // 10K USD
    };
    const maxAmount = maxAmounts[currency] || 10000;

    if (value > maxAmount) {
      return `Maximum top-up is ${formatCurrency(maxAmount, currency)}`;
    }

    return null;
  };

  const handlePresetSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
    const validationError = validateAmount(amount);
    setError(validationError || "");
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedAmount(null);
    
    const numValue = Number(value);
    if (value && !isNaN(numValue)) {
      const validationError = validateAmount(numValue);
      setError(validationError || "");
    } else if (value) {
      setError("Please enter a valid number");
    } else {
      setError("");
    }
  };

  const handleTopUp = async () => {
    if (!tenantId) {
      setError("No tenant ID found");
      return;
    }

    const amount = selectedAmount || Number(customAmount);
    const validationError = validateAmount(amount);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await createTopUp(amount);
      // Note: If successful, user will be redirected to payment gateway
      // Dialog will close automatically on redirect
    } catch (err) {
      console.error("Error creating top-up:", err);
      // Error is already shown via toast in the hook
    }
  };

  const finalAmount = selectedAmount || Number(customAmount) || 0;
  const canSubmit = !isLoading && !error && finalAmount > 0;
  const isLoadingData = walletLoading || isFetchingHistory;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Top Up Wallet
          </DialogTitle>
          <DialogDescription>
            Add funds to your salon wallet for payments and purchases
          </DialogDescription>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Current Wallet Balance */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
              <p className="text-2xl font-bold">
                {formatCurrency(walletBalance, currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Minimum top-up: {formatCurrency(minAmount, currency)}
              </p>
            </div>

            {/* Preset Amount Buttons */}
            <div className="space-y-2">
              <Label>Quick Amounts</Label>
              <div className="grid grid-cols-2 gap-2">
                {presetAmounts.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant={selectedAmount === amount ? "default" : "outline"}
                    onClick={() => handlePresetSelect(amount)}
                    className="w-full"
                  >
                    {formatCurrency(amount, currency)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="custom-amount">Or Enter Custom Amount ({currency})</Label>
              <Input
                id="custom-amount"
                type="number"
                placeholder={`Min: ${minAmount.toLocaleString()}`}
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                min={minAmount}
                step="0.01"
              />
            </div>

            {/* Recent Top-ups */}
            {recentTopUps.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Recent Top-Ups
                </Label>
                <div className="rounded-lg border divide-y max-h-32 overflow-y-auto">
                  {recentTopUps.map((topUp) => (
                    <div
                      key={topUp.id}
                      className="flex justify-between items-center p-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {new Date(topUp.created_at).toLocaleDateString()}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(Number(topUp.amount), topUp.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Preview New Balance */}
            {finalAmount > 0 && !error && (
              <div className="rounded-lg border bg-primary/5 p-3">
                <p className="text-sm text-muted-foreground mb-1">New Balance After Top-Up</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(walletBalance + finalAmount, currency)}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleTopUp} disabled={!canSubmit}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wallet className="mr-2 h-4 w-4" />
                Continue to Payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
