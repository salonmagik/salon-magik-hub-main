import { useState } from "react";
import { useCreditPurchase, CreditTier } from "@/hooks/useCreditPurchase";
import { useSalonWallet } from "@/hooks/useSalonWallet";
import { useAuth } from "@/hooks/useAuth";
import { useClaimTenantSalesPromo, useTenantSalesPromo } from "@/hooks/useSalesPromo";
import { formatCurrency } from "@shared/currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
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

export function CreditPurchaseDialog({ open, onOpenChange }: CreditPurchaseDialogProps) {
  const { currentTenant } = useAuth();
  const { tiers, isLoading: tiersLoading, purchaseCredits, currency } = useCreditPurchase();
  const { wallet, isLoading: walletLoading } = useSalonWallet(currentTenant?.id);
  const [selectedBundlePrice, setSelectedBundlePrice] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wallet");
  const [isProcessing, setIsProcessing] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const claimPromo = useClaimTenantSalesPromo();
  const { data: tenantPromo } = useTenantSalesPromo("credits");

  const selectedTier = tiers.find((t) => t.bundlePrice === selectedBundlePrice);
  const basePrice = selectedTier?.bundlePrice ?? 0;
  const discountAmount = tenantPromo
    ? tenantPromo.discount_type === "fixed"
      ? Math.min(basePrice, Number(tenantPromo.discount_value || 0))
      : Number(((basePrice * Number(tenantPromo.discount_value || 0)) / 100).toFixed(2))
    : 0;
  const selectedPrice = Math.max(0, Number((basePrice - discountAmount).toFixed(2)));
  const selectedCredits = selectedTier?.credits || 0;

  const hasInsufficientBalance = wallet && wallet.balance < selectedPrice;
  const isPurchaseDisabled = !selectedTier;
  const isWalletPaymentDisabled = paymentMethod === "wallet" && (hasInsufficientBalance || walletLoading);

  const handlePurchase = async () => {
    if (!currentTenant?.id || !selectedTier) return;
    setIsProcessing(true);

    try {
      if (paymentMethod === "wallet") {
        const { data, error } = await supabase.functions.invoke("purchase-credits-from-purse", {
          body: {
            tenantId: currentTenant.id,
            bundlePrice: selectedTier.bundlePrice,
          },
        });

        if (error) throw error;

        toast({
          title: `Successfully purchased ${data.credits} credits!`,
          description: `${formatCurrency(data.amountDebited, currency)} was deducted from your wallet. New balance: ${data.newBalance} credits.`,
        });

        onOpenChange(false);
      } else {
        const result = await purchaseCredits(selectedTier.bundlePrice);
        if (result.success && result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        } else {
          throw new Error("No payment URL returned");
        }
      }
    } catch (err) {
      console.error("Error purchasing credits:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to purchase credits. Please try again.";
      toast({ title: "Purchase failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const getPopularTier = (): number | null => {
    if (tiers.length < 2) return null;
    return tiers[1].bundlePrice; // second tier is a reasonable "most popular" default
  };

  const handleClaimPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      await claimPromo.mutateAsync({ code: promoCode.trim(), surface: "credits" });
      setPromoCode("");
      toast({ title: "Promo claimed", description: "This promo is now available for messaging credit purchases." });
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

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
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

          {/* Bundle Selection */}
          <div className="space-y-3">
            <Label>Select Bundle</Label>
            {tiersLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading bundles...</p>
            ) : (
              tiers.map((tier) => (
                <TierCard
                  key={tier.bundlePrice}
                  tier={tier}
                  currency={currency}
                  isSelected={selectedBundlePrice === tier.bundlePrice}
                  isPopular={tier.bundlePrice === getPopularTier()}
                  onSelect={() => setSelectedBundlePrice(tier.bundlePrice)}
                />
              ))
            )}
          </div>

          {/* Payment Method Selection */}
          {selectedTier && (
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

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TierCardProps {
  tier: CreditTier;
  currency: string;
  isSelected: boolean;
  isPopular: boolean;
  onSelect: () => void;
}

function TierCard({ tier, currency, isSelected, isPopular, onSelect }: TierCardProps) {
  const pricePerCredit = tier.credits > 0 ? tier.bundlePrice / tier.credits : 0;

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
                isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
              )}
            >
              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{tier.credits.toLocaleString()} Credits</span>
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
            <p className="font-bold text-lg">{formatCurrency(tier.bundlePrice, currency)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
