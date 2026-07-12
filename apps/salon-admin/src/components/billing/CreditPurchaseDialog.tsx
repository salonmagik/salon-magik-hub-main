import { useState } from "react";
import { useCreditPurchase, CreditPackage } from "@/hooks/useCreditPurchase";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useAuth } from "@/hooks/useAuth";
import { useClaimTenantSalesPromo, useTenantSalesPromo } from "@/hooks/useSalesPromo";
import { formatCurrency } from "@shared/currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Alert, AlertDescription } from "@ui/alert";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { Check, MessageSquare, Loader2, Wallet, CreditCard, AlertCircle, Ticket } from "lucide-react";
import { cn } from "@shared/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";

type PaymentMethod = "wallet" | "paystack";

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_CUSTOM_CREDITS = 10;
const MAX_CUSTOM_CREDITS = 1000;

export function CreditPurchaseDialog({ open, onOpenChange }: CreditPurchaseDialogProps) {
  const { currentTenant } = useAuth();
  const { packages, getPackagePrice, getCustomCreditPrice, currency } = useCreditPurchase();
  const { wallet, isLoading: walletLoading } = useSalonWallet(currentTenant?.id);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customCredits, setCustomCredits] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wallet");
  const [isProcessing, setIsProcessing] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const claimPromo = useClaimTenantSalesPromo();
  const { data: tenantPromo } = useTenantSalesPromo("credits");

  const selectedPkg = packages.find((p) => p.id === selectedPackage);
  
  // Calculate price based on selection type
  const customCreditsNum = parseInt(customCredits) || 0;
  const basePrice = isCustom 
    ? getCustomCreditPrice(customCreditsNum, currency)
    : (selectedPkg ? getPackagePrice(selectedPkg, currency) : 0);
  const discountAmount = tenantPromo
    ? tenantPromo.discount_type === "fixed"
      ? Math.min(basePrice, Number(tenantPromo.discount_value || 0))
      : Number(((basePrice * Number(tenantPromo.discount_value || 0)) / 100).toFixed(2))
    : 0;
  const selectedPrice = Math.max(0, Number((basePrice - discountAmount).toFixed(2)));
  const selectedCredits = isCustom ? customCreditsNum : (selectedPkg?.credits || 0);
  
  const hasInsufficientBalance = wallet && wallet.balance < selectedPrice;
  
  // Validation for custom credits
  const customCreditsError = isCustom && customCredits !== "" && (
    customCreditsNum < MIN_CUSTOM_CREDITS 
      ? `Minimum ${MIN_CUSTOM_CREDITS} credits`
      : customCreditsNum > MAX_CUSTOM_CREDITS 
      ? `Maximum ${MAX_CUSTOM_CREDITS} credits`
      : null
  );
  
  const isPurchaseDisabled = isCustom 
    ? !customCredits || customCreditsNum < MIN_CUSTOM_CREDITS || customCreditsNum > MAX_CUSTOM_CREDITS
    : !selectedPackage;

  const handlePurchase = async () => {
    if (!currentTenant?.id) return;
    if (isPurchaseDisabled) return;

    setIsProcessing(true);

    try {
      if (paymentMethod === "wallet") {
        // Purchase credits from salon purse
        const { data, error } = await supabase.functions.invoke("purchase-credits-from-purse", {
          body: {
            tenantId: currentTenant.id,
            packageId: isCustom ? undefined : selectedPackage,
            customCredits: isCustom ? selectedCredits : undefined,
            customAmount: isCustom ? basePrice : undefined,
          },
        });

        if (error) throw error;

        toast({
          title: `Successfully purchased ${data.credits} credits!`,
          description: `${formatCurrency(data.amountDebited, currency)} was deducted from your wallet. New balance: ${data.newBalance} credits.`,
        });

        // Close dialog and refresh (parent component should handle refresh)
        onOpenChange(false);
      } else {
        // Purchase credits with Paystack
        // Get authenticated user's email
        const { data: { user } } = await supabase.auth.getUser();
        const customerEmail = user?.email || "";
        
        if (!customerEmail) {
          throw new Error("Unable to retrieve your email address. Please try again.");
        }

        const { data, error } = await supabase.functions.invoke("create-payment-session", {
          body: {
            tenantId: currentTenant.id,
            amount: basePrice,
            currency: currency,
            customerEmail,
            customerName: currentTenant.name || "Salon Owner",
            description: `Purchase ${selectedCredits} messaging credits`,
            intentType: "messaging_credit_purchase",
            credits: selectedCredits,
            successUrl: `${window.location.origin}/salon/messaging?purchase=success`,
            cancelUrl: `${window.location.origin}/salon/messaging?purchase=cancelled`,
          },
        });

        if (error) throw error;

        if (data?.paymentUrl || data?.checkoutUrl) {
          window.location.href = data.paymentUrl || data.checkoutUrl;
        } else {
          throw new Error("No payment URL returned");
        }
      }
    } catch (err) {
      console.error("Error purchasing credits:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to purchase credits. Please try again.";
      toast({
        title: "Purchase failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getPopularPackage = (): string => {
    return "pack_100"; // 100 credits is most popular
  };

  const isWalletPaymentDisabled = paymentMethod === "wallet" && (hasInsufficientBalance || walletLoading);

  const handleClaimPromo = async () => {
    if (!promoCode.trim()) return;

    try {
      await claimPromo.mutateAsync({ code: promoCode.trim(), surface: "credits" });
      setPromoCode("");
      toast({
        title: "Promo claimed",
        description: "This promo is now available for messaging credit purchases.",
      });
    } catch (error) {
      toast({
        title: "Promo unavailable",
        description: error instanceof Error ? error.message : "Failed to claim promo code.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Purchase Message Credits
          </DialogTitle>
          <DialogDescription>
            Credits are used for sending SMS messages to your customers. Each
            SMS costs 2 credits. Email is always free and included with your
            plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Sales Promo
            </Label>
            {tenantPromo ? (
              <Alert>
                <AlertDescription>
                  {tenantPromo.code} from {tenantPromo.campaign_name} is active for credits with {tenantPromo.remaining_uses} use{tenantPromo.remaining_uses === 1 ? "" : "s"} remaining.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter promo code"
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                />
                <Button
                  variant="outline"
                  onClick={handleClaimPromo}
                  disabled={!promoCode.trim() || claimPromo.isPending}
                >
                  {claimPromo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
            )}
          </div>

          {/* Package Selection */}
          <div className="space-y-3">
            <Label>Select Package</Label>
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                package={pkg}
                price={getPackagePrice(pkg, currency)}
                currency={currency}
                isSelected={!isCustom && selectedPackage === pkg.id}
                isPopular={pkg.id === getPopularPackage()}
                onSelect={() => {
                  setIsCustom(false);
                  setSelectedPackage(pkg.id);
                }}
              />
            ))}
            
            {/* Custom Amount Option */}
            <Card
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                isCustom && "border-primary ring-1 ring-primary"
              )}
              onClick={() => {
                setIsCustom(true);
                setSelectedPackage(null);
              }}
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        isCustom
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isCustom && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold">Custom Amount</span>
                      <p className="text-sm text-muted-foreground">
                        Choose your own credit amount
                      </p>
                    </div>
                  </div>
                  
                  {isCustom && (
                    <div className="pl-8 space-y-2">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <Label htmlFor="custom-credits" className="text-sm">
                            Number of credits ({MIN_CUSTOM_CREDITS}-{MAX_CUSTOM_CREDITS})
                          </Label>
                          <Input
                            id="custom-credits"
                            type="number"
                            min={MIN_CUSTOM_CREDITS}
                            max={MAX_CUSTOM_CREDITS}
                            value={customCredits}
                            onChange={(e) => setCustomCredits(e.target.value)}
                            placeholder={`Enter ${MIN_CUSTOM_CREDITS}-${MAX_CUSTOM_CREDITS}`}
                            className="mt-1"
                          />
                        </div>
                        {customCredits && !customCreditsError && (
                          <div className="text-right pb-2">
                            <p className="font-bold text-lg">{formatCurrency(selectedPrice, currency)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(selectedPrice / customCreditsNum, currency)}/credit
                            </p>
                          </div>
                        )}
                      </div>
                      {customCreditsError && (
                        <p className="text-sm text-destructive">{customCreditsError}</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Method Selection */}
          {(selectedPackage || (isCustom && customCredits && !customCreditsError)) && (
            <div className="space-y-3">
              <Label>Payment Method</Label>
              <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <div className="flex items-center space-x-2 border rounded-lg p-3">
                  <RadioGroupItem value="wallet" id="wallet" />
                  <Label htmlFor="wallet" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      <span>Pay from Wallet</span>
                    </div>
                    {wallet && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Current balance: {formatCurrency(wallet.balance, currency)}
                      </p>
                    )}
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3">
                  <RadioGroupItem value="paystack" id="paystack" />
                  <Label htmlFor="paystack" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span>Pay with Paystack</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Pay with card or bank transfer
                    </p>
                  </Label>
                </div>
              </RadioGroup>

              {/* Insufficient Balance Warning */}
              {paymentMethod === "wallet" && hasInsufficientBalance && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Insufficient wallet balance. You need {formatCurrency(selectedPrice, currency)} but have{" "}
                    {formatCurrency(wallet?.balance || 0, currency)}.
                  </AlertDescription>
                </Alert>
              )}

              {tenantPromo && selectedPrice > 0 && (
                <Alert>
                  <AlertDescription>
                    Promo applied. Original {formatCurrency(basePrice, currency)}, discounted {formatCurrency(selectedPrice, currency)}.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={isPurchaseDisabled || isProcessing || isWalletPaymentDisabled}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Purchase"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PackageCardProps {
  package: CreditPackage;
  price: number;
  currency: string;
  isSelected: boolean;
  isPopular: boolean;
  onSelect: () => void;
}

function PackageCard({
  package: pkg,
  price,
  currency,
  isSelected,
  isPopular,
  onSelect,
}: PackageCardProps) {
  const pricePerCredit = price / pkg.credits;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        isSelected && "border-primary ring-1 ring-primary"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                isSelected
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30"
              )}
            >
              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{pkg.credits} Credits</span>
                {isPopular && (
                  <Badge variant="secondary" className="text-xs">
                    Most Popular
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(pricePerCredit, currency)}/credit
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg">{formatCurrency(price, currency)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
