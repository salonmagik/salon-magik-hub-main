import { useState } from "react";
import { CreditCard, Building2, Smartphone, Globe, Wallet, DollarSign } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
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
  gateway: PaymentGateway;
}

interface PaymentStepProps {
  amountDue: number;
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

const STRIPE_METHODS: PaymentMethod[] = [
  { id: "card", name: "Credit/Debit Card", icon: <CreditCard className="h-5 w-5" />, gateway: "stripe" },
  { id: "apple_pay", name: "Apple Pay", icon: <Smartphone className="h-5 w-5" />, gateway: "stripe" },
  { id: "google_pay", name: "Google Pay", icon: <Wallet className="h-5 w-5" />, gateway: "stripe" },
];

const PAYSTACK_METHODS: PaymentMethod[] = [
  { id: "card", name: "Card Payment", icon: <CreditCard className="h-5 w-5" />, gateway: "paystack" },
  { id: "bank_transfer", name: "Bank Transfer", icon: <Building2 className="h-5 w-5" />, gateway: "paystack" },
  { id: "ussd", name: "USSD", icon: <Smartphone className="h-5 w-5" />, gateway: "paystack" },
  { id: "mobile_money", name: "Mobile Money", icon: <Wallet className="h-5 w-5" />, gateway: "paystack" },
];

// Countries/currencies where Paystack is recommended
const PAYSTACK_REGIONS = ["NG", "GH", "Nigeria", "Ghana"];
const PAYSTACK_CURRENCIES = ["NGN", "GHS"];

export function PaymentStep({
  amountDue,
  currency,
  country,
  onGatewaySelect,
  onSubmit,
  isSubmitting,
  brandColor = "#2563EB",
  purseBalance = 0,
  customerId,
  customerEmail,
  tenantId,
  onPaymentModeChange,
}: PaymentStepProps) {
  const isPaystackRecommended = 
    PAYSTACK_REGIONS.includes(country) || 
    PAYSTACK_CURRENCIES.includes(currency.toUpperCase());
  
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway>(
    isPaystackRecommended ? "paystack" : "stripe"
  );

  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    purseBalance >= amountDue ? "purse" : purseBalance > 0 ? "split" : "card"
  );

  // For split payment, start with 50% purse if available, otherwise max purse
  const initialPurseAmount = Math.min(purseBalance, amountDue / 2);
  const [purseAmount, setPurseAmount] = useState(initialPurseAmount);

  const handleGatewayChange = (gateway: PaymentGateway) => {
    setSelectedGateway(gateway);
    onGatewaySelect(gateway);
  };

  const handlePaymentModeChange = (mode: PaymentMode) => {
    setPaymentMode(mode);
    let purseAmt = 0;
    let cardAmt = amountDue;

    if (mode === "purse") {
      purseAmt = Math.min(purseBalance, amountDue);
      cardAmt = 0;
    } else if (mode === "split") {
      purseAmt = purseAmount;
      cardAmt = amountDue - purseAmt;
    }

    if (onPaymentModeChange) {
      onPaymentModeChange(mode, purseAmt, cardAmt);
    }
  };

  const handleSliderChange = (values: number[]) => {
    const newPurseAmount = values[0];
    setPurseAmount(newPurseAmount);
    if (onPaymentModeChange) {
      onPaymentModeChange("split", newPurseAmount, amountDue - newPurseAmount);
    }
  };

  const methods = selectedGateway === "stripe" ? STRIPE_METHODS : PAYSTACK_METHODS;

  const cardAmount = paymentMode === "purse" ? 0 : paymentMode === "split" ? amountDue - purseAmount : amountDue;
  const showGatewaySelection = paymentMode !== "purse";
  const showPaymentMethods = paymentMode !== "purse";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-2">Select Payment Method</h3>
        <p className="text-sm text-muted-foreground">
          Choose how you would like to pay
        </p>
      </div>

      {/* Payment Mode Selection */}
      {purseBalance > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Payment Options</Label>
          <div className="space-y-2">
            {/* Pay with Purse */}
            {purseBalance >= amountDue && (
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
            {purseBalance < amountDue && purseBalance > 0 && (
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
              max={Math.min(purseBalance, amountDue)}
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
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleGatewayChange("stripe")}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-left",
                  selectedGateway === "stripe"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-5 w-5" />
                  <span className="font-medium">Stripe</span>
                  {!isPaystackRecommended && (
                    <Badge variant="secondary" className="text-xs">Recommended</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">International payments</p>
              </button>

              <button
                onClick={() => handleGatewayChange("paystack")}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-left",
                  selectedGateway === "paystack"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-5 w-5" />
                  <span className="font-medium">Paystack</span>
                  {isPaystackRecommended && (
                    <Badge variant="secondary" className="text-xs">Recommended</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">African payments</p>
              </button>
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
              {formatCurrency(amountDue, currency)}
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
              {formatCurrency(amountDue, currency)}
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
          ? `Pay ${formatCurrency(amountDue, currency)}`
          : paymentMode === "split"
          ? `Pay ${formatCurrency(cardAmount, currency)}`
          : `Pay ${formatCurrency(amountDue, currency)}`}
      </Button>

      {paymentMode !== "purse" && (
        <p className="text-xs text-center text-muted-foreground">
          You will be redirected to {selectedGateway === "stripe" ? "Stripe" : "Paystack"} to complete your payment securely.
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
