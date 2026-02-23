import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
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
import { Loader2, AlertCircle, Wallet, DollarSign } from "lucide-react";

interface PurseTopupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  tenantId: string;
  currency?: string;
  customerEmail?: string;
}

const PREDEFINED_AMOUNTS = {
  NGN: [500, 1000, 2000, 5000],
  GHS: [20, 50, 100, 200],
};

export function PurseTopupDialog({
  open,
  onOpenChange,
  customerId,
  tenantId,
  currency = "NGN",
  customerEmail,
}: PurseTopupDialogProps) {
  const [amount, setAmount] = useState<string>("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  // Get predefined amounts based on currency
  const predefinedAmounts = PREDEFINED_AMOUNTS[currency as keyof typeof PREDEFINED_AMOUNTS] || PREDEFINED_AMOUNTS.NGN;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setAmount("");
      setSelectedAmount(null);
      setError("");
    }
  }, [open]);

  const handlePredefinedAmount = (value: number) => {
    setSelectedAmount(value);
    setAmount(value.toString());
    setError("");
  };

  const handleCustomAmount = (value: string) => {
    setSelectedAmount(null);
    setAmount(value);
    setError("");
  };

  const validateAmount = (value: string): string | null => {
    const numValue = Number(value);

    if (!value || numValue <= 0) {
      return "Please enter a valid amount";
    }

    if (numValue < 100) {
      return "Minimum top-up amount is 100";
    }

    return null;
  };

  const handleTopup = async () => {
    if (!customerId || !tenantId) {
      setError("Missing customer or tenant information");
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
      // Call create-payment-session edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-payment-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            tenantId,
            amount: Number(amount),
            customerEmail: customerEmail || "customer@example.com",
            intentType: "customer_purse_topup",
            customerId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create payment session");
      }

      const data = await response.json();

      // Redirect to Paystack payment URL
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        throw new Error("Payment URL not received");
      }
    } catch (err) {
      console.error("Error creating topup payment session:", err);
      setError(err instanceof Error ? err.message : "Failed to initiate top-up");
      setIsSubmitting(false);
    }
  };

  const canSubmit = amount && !error && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Top Up Purse
          </DialogTitle>
          <DialogDescription>
            Add funds to your purse to pay for bookings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Predefined amounts */}
          <div className="space-y-2">
            <Label>Select Amount</Label>
            <div className="grid grid-cols-4 gap-2">
              {predefinedAmounts.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={selectedAmount === value ? "default" : "outline"}
                  onClick={() => handlePredefinedAmount(value)}
                  disabled={isSubmitting}
                  className="h-auto py-3 flex flex-col items-center gap-1"
                >
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    {formatCurrency(value, currency)}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Or Enter Custom Amount</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">
                {currency}
              </span>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => handleCustomAmount(e.target.value)}
                disabled={isSubmitting}
                min="100"
                step="1"
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum: {formatCurrency(100, currency)}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleTopup}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Top Up {amount ? formatCurrency(Number(amount), currency) : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
