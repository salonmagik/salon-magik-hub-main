import { useState } from "react";
import { CreditCard, Building2, Smartphone, Globe, Wallet } from "lucide-react";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Label } from "@ui/label";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";

export type PaymentGateway = "stripe" | "paystack";

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
}: PaymentStepProps) {
  const isPaystackRecommended = 
    PAYSTACK_REGIONS.includes(country) || 
    PAYSTACK_CURRENCIES.includes(currency.toUpperCase());
  
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway>(
    isPaystackRecommended ? "paystack" : "stripe"
  );

  const handleGatewayChange = (gateway: PaymentGateway) => {
    setSelectedGateway(gateway);
    onGatewaySelect(gateway);
  };

  const methods = selectedGateway === "stripe" ? STRIPE_METHODS : PAYSTACK_METHODS;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-2">Select Payment Method</h3>
        <p className="text-sm text-muted-foreground">
          Choose your preferred payment provider
        </p>
      </div>

      {/* Gateway Selection */}
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

      {/* Available Payment Methods */}
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

      {/* Amount Summary */}
      <div className="p-4 rounded-lg bg-muted/50 border">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Amount Due</span>
          <span className="text-2xl font-bold">
            {formatCurrency(amountDue, currency)}
          </span>
        </div>
      </div>

      {/* Pay Button */}
      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        className="w-full h-12 text-lg text-white border-0"
        style={{ backgroundColor: brandColor }}
      >
        {isSubmitting ? "Processing..." : `Pay ${formatCurrency(amountDue, currency)}`}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        You will be redirected to {selectedGateway === "stripe" ? "Stripe" : "Paystack"} to complete your payment securely.
      </p>
    </div>
  );
}
