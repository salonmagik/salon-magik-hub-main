import { useEffect, useState } from "react";
import { CreditCard, Building2, Smartphone, Wallet, DollarSign, Info } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Label } from "@ui/label";
import { Slider } from "@ui/slider";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";

export type PaymentGateway = "stripe" | "paystack";
export type PaymentMode = "purse" | "card" | "split";

interface PaymentMethod {
  id: string;
  name: string;
  icon: React.ReactNode;
}

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

const PAYSTACK_METHODS: PaymentMethod[] = [
  { id: "card", name: "Card Payment", icon: <CreditCard className="h-5 w-5" /> },
  { id: "bank_transfer", name: "Bank Transfer", icon: <Building2 className="h-5 w-5" /> },
  { id: "ussd", name: "USSD", icon: <Smartphone className="h-5 w-5" /> },
  { id: "mobile_money", name: "Mobile Money", icon: <Wallet className="h-5 w-5" /> },
];

export function PaymentStep({
  amountDue,
  totalBeforePurse,
  currency,
  onGatewaySelect,
  onSubmit,
  isSubmitting,
  brandColor = "#2563EB",
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

  const methods = PAYSTACK_METHODS;

  const cardAmount = paymentMode === "purse" ? 0 : paymentMode === "split" ? totalBeforePurse - purseAmount : totalBeforePurse;
  const showGatewaySelection = paymentMode !== "purse";
  const showPaymentMethods = paymentMode !== "purse";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-2">Select Payment Method</h3>
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
                  "w-full p-4 rounded-lg border-2 transition-all text-left",
                  paymentMode === "purse"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Pay with Store Credit</p>
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
                "w-full p-4 rounded-lg border-2 transition-all text-left",
                paymentMode === "card"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
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
                  "w-full p-4 rounded-lg border-2 transition-all text-left",
                  paymentMode === "split"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
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
              <span className="text-muted-foreground">Store Credit</span>
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

      {/* Gateway Selection */}
      {showGatewaySelection && (
        <>
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              Payment Provider
            </Label>
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 text-left">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5" />
                <span className="font-medium">Paystack</span>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Paystack is the current payment provider for this checkout.</p>
            </div>
          </div>

          {/* Available Payment Methods */}
          {showPaymentMethods && (
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">Available methods</Label>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm"
                  >
                    {method.icon}
                    <span>{method.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Amount Summary */}
      <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
        {paymentMode === "purse" ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Paid from Store Credit</span>
            <span className="text-2xl font-bold text-primary">
              {formatCurrency(totalBeforePurse, currency)}
            </span>
          </div>
        ) : paymentMode === "split" ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Store Credit</span>
              <span className="font-medium text-primary">
                {formatCurrency(purseAmount, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Card Payment Due</span>
              <span className="text-2xl font-bold">
                {formatCurrency(cardAmount, currency)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount Due</span>
            <span className="text-2xl font-bold">
              {formatCurrency(totalBeforePurse, currency)}
            </span>
          </div>
        )}
      </div>

      {paymentMode !== "purse" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Paystack will open in a new tab. If the payment page does not load, try Safari or disable strict browser privacy shields for the payment tab.
            </p>
          </div>
        </div>
      )}

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
