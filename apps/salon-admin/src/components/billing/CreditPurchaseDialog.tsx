import { useState } from "react";
import { useCreditPurchase, CreditPackage } from "@/hooks/useCreditPurchase";
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
import { Check, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@shared/utils";

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreditPurchaseDialog({ open, onOpenChange }: CreditPurchaseDialogProps) {
  const { packages, purchaseCredits, getPackagePrice, isLoading, currency } = useCreditPurchase();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    const result = await purchaseCredits(selectedPackage);
    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
  };

  const getPopularPackage = (): string => {
    return "pack_100"; // 100 credits is most popular
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
            Credits are used for sending emails and SMS to your customers.
            Each email costs 1 credit, SMS costs 2 credits.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              package={pkg}
              price={getPackagePrice(pkg, currency)}
              currency={currency}
              isSelected={selectedPackage === pkg.id}
              isPopular={pkg.id === getPopularPackage()}
              onSelect={() => setSelectedPackage(pkg.id)}
            />
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={!selectedPackage || isLoading}
          >
            {isLoading ? (
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
