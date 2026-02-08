import { Gift, Clock, ArrowRight } from "lucide-react";
import { Button } from "@ui/button";
import { useReferralDiscountEligibility, useMyReferralDiscounts } from "@/hooks/useReferrals";
import { format } from "date-fns";

interface ReferralDiscountBannerProps {
  onApply?: () => void;
}

export function ReferralDiscountBanner({ onApply }: ReferralDiscountBannerProps) {
  const { data: eligibility, isLoading: eligibilityLoading } = useReferralDiscountEligibility();
  const { data: discounts, isLoading: discountsLoading } = useMyReferralDiscounts();

  const isLoading = eligibilityLoading || discountsLoading;

  if (isLoading) return null;

  // Check if there's an available referral discount
  const availableDiscount = discounts?.find((d) => d.available);

  if (!availableDiscount && !eligibility?.eligible) return null;

  const percentage = availableDiscount?.percentage || eligibility?.percentage || 4;
  const expiresAt = availableDiscount?.expires_at || eligibility?.expiresAt;

  return (
    <div className="flex items-center justify-between p-4 bg-warning/10 border border-warning/20 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-warning/20 rounded-full">
          <Gift className="w-5 h-5 text-warning-foreground" />
        </div>
        <div>
          <p className="font-medium text-foreground">
            {percentage}% Referral Discount Available
          </p>
          {expiresAt && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Expires {format(new Date(expiresAt), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </div>
      {onApply && (
        <Button
          size="sm"
          variant="outline"
          onClick={onApply}
        >
          Apply
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      )}
    </div>
  );
}
