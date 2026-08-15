import { useEffect, useState } from "react";
import { CreditCard, Wallet, DollarSign } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Label } from "@ui/label";
import { Slider } from "@ui/slider";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";

export type PaymentGateway = "paystack";
export type PaymentMode = "purse" | "card" | "split";

interface PaymentStepProps {
  amountDue: number;
  totalBeforePurse: number;
  currency: string;
  country: string;
  onGatewaySelect: (gateway: PaymentGateway) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  brandColor?: string;
  purseBalance?: number;
  customerId?: string;
  customerEmail?: string;
  tenantId?: string;
  onPaymentModeChange?: (mode: PaymentMode, purseAmount: number, cardAmount: number) => void;
}

export function PaymentStep({
  amountDue,
  totalBeforePurse,
  currency,
  onGatewaySelect,
  onSubmit,
  isSubmitting,
  brandColor = "#2E1F4E",
  purseBalance = 0,
  onPaymentModeChange,
}: PaymentStepProps) {
  const [selectedGateway] = useState<PaymentGateway>("paystack");

  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    purseBalance >= totalBeforePurse ? "purse" : purseBalance > 0 ? "split" : "card"
  );

  // For split payment, start with 50% purse if available, otherwise max purse
  const initialPurseAmount = Math.min(purseBalance, totalBeforePurse / 2);
  const [purseAmount, setPurseAmount] = useState(initialPurseAmount);

  useEffect(() => {
    onGatewaySelect("paystack");
  }, [onGatewaySelect]);

  const handlePaymentModeChange = (mode: PaymentMode) => {
    setPaymentMode(mode);
    let purseAmt = 0;
    let cardAmt = totalBeforePurse;

    if (mode === "purse") {
      purseAmt = Math.min(purseBalance, totalBeforePurse);
      cardAmt = 0;
    } else if (mode === "split") {
      purseAmt = purseAmount;
      cardAmt = totalBeforePurse - purseAmt;
    }

    if (onPaymentModeChange) {
      onPaymentModeChange(mode, purseAmt, cardAmt);
    }
  };
  const handleSliderChange = (values: number[]) => {
    const newPurseAmount = values[0];
    setPurseAmount(newPurseAmount);
    if (onPaymentModeChange) {
      onPaymentModeChange("split", newPurseAmount, totalBeforePurse - newPurseAmount);
    }
  };

  const cardAmount = paymentMode === "purse" ? 0 : paymentMode === "split" ? totalBeforePurse - purseAmount : totalBeforePurse;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-serif text-lg font-semibold mb-2">Select Payment Method</h3>
      </div>

      {/* Payment Mode Selection */}
      {purseBalance > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Payment Options</Label>
          <div className="space-y-2">
            {/* Pay with Purse */}
            {purseBalance >= totalBeforePurse && (
              <button
                onClick={() => handlePaymentModeChange("purse")}
                className={cn(
                  "w-full p-4 rounded-xl border transition-all text-left",
                  paymentMode === "purse"
                    ? "border-[var(--brand-color)] bg-[color-mix(in_srgb,var(--brand-color)_6%,transparent)]"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Pay with Salon Balance</p>
                      <p className="text-xs text-muted-foreground">
                        Available: {formatCurrency(purseBalance, currency)}
                      </p>
                    </div>
                  </div>
                  {paymentMode === "purse" && (
                    <Badge variant="secondary" className="text-xs">Selected</Badge>
                  )}
                </div>
              </button>
            )}

            {/* Pay with Card */}
            <button
              onClick={() => handlePaymentModeChange("card")}
              className={cn(
                "w-full p-4 rounded-xl border transition-all text-left",
                paymentMode === "card"
                  ? "border-[var(--brand-color)] bg-[color-mix(in_srgb,var(--brand-color)_6%,transparent)]"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Pay with Card</p>
                    <p className="text-xs text-muted-foreground">
                      Credit/Debit card or other methods
                    </p>
                  </div>
                </div>
                {paymentMode === "card" && (
                  <Badge variant="secondary" className="text-xs">Selected</Badge>
                )}
              </div>
            </button>

            {/* Split Payment */}
            {purseBalance < totalBeforePurse && purseBalance > 0 && (
              <button
                onClick={() => handlePaymentModeChange("split")}
                className={cn(
                  "w-full p-4 rounded-xl border transition-all text-left",
                  paymentMode === "split"
                    ? "border-[var(--brand-color)] bg-[color-mix(in_srgb,var(--brand-color)_6%,transparent)]"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Split Payment</p>
                      <p className="text-xs text-muted-foreground">
                        Combine store credit and card
                      </p>
                    </div>
                  </div>
                  {paymentMode === "split" && (
                    <Badge variant="secondary" className="text-xs">Selected</Badge>
                  )}
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Split Payment Slider */}
      {paymentMode === "split" && (
        <div className="space-y-4 p-4 rounded-lg bg-muted/50 border">
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Adjust Payment Split
            </Label>
            <Slider
              value={[purseAmount]}
              onValueChange={handleSliderChange}
              max={Math.min(purseBalance, totalBeforePurse)}
              min={0}
              step={0.01}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Salon Balance</span>
              <span className="font-medium text-primary">
                {formatCurrency(purseAmount, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Card Payment</span>
              <span className="font-medium">
                {formatCurrency(cardAmount, currency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Amount Summary */}
      <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
        {paymentMode === "purse" ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Paid from Salon Balance</span>
            <span className="font-serif text-2xl font-semibold" style={{ color: "var(--brand-color)" }}>
              {formatCurrency(totalBeforePurse, currency)}
            </span>
          </div>
        ) : paymentMode === "split" ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Salon Balance</span>
              <span className="font-medium text-primary">
                {formatCurrency(purseAmount, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Card Payment Due</span>
              <span className="font-serif text-2xl font-semibold">
                {formatCurrency(cardAmount, currency)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount Due</span>
            <span className="font-serif text-2xl font-semibold">
              {formatCurrency(totalBeforePurse, currency)}
            </span>
          </div>
        )}
      </div>

      {/* Pay Button */}
      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        className="w-full h-12 text-lg text-white border-0"
        style={{ backgroundColor: brandColor }}
      >
        {isSubmitting
          ? "Processing..."
          : paymentMode === "purse"
          ? `Pay ${formatCurrency(totalBeforePurse, currency)}`
          : paymentMode === "split"
          ? `Pay ${formatCurrency(cardAmount, currency)}`
          : `Pay ${formatCurrency(totalBeforePurse, currency)}`}
      </Button>

      {paymentMode !== "purse" && (
        <p className="text-xs text-center text-muted-foreground">
          You will be redirected to Paystack to complete your payment securely.
        </p>
      )}
      {paymentMode === "purse" && (
        <p className="text-xs text-center text-muted-foreground">
          Your store credit will be used to complete this payment immediately.
        </p>
      )}
    </div>
  );
}
