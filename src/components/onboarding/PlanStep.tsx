import { useState } from "react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { 
  PRICING, 
  PLAN_FEATURES, 
  PLAN_DESCRIPTIONS, 
  TRIAL_DAYS,
  type Currency,
  type PlanId 
} from "@/lib/pricing";

export type SubscriptionPlan = "solo" | "studio" | "chain";

interface PlanStepProps {
  selectedPlan: SubscriptionPlan | null;
  onPlanSelect: (plan: SubscriptionPlan) => void;
  currency: Currency;
}

export function PlanStep({ selectedPlan, onPlanSelect, currency }: PlanStepProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const plans: PlanId[] = ["solo", "studio", "chain"];

  const getPrice = (planId: PlanId) => {
    const tier = PRICING[planId][currency];
    if (billingCycle === "annual" && tier.annual > 0) {
      return {
        price: tier.effectiveMonthly,
        period: "/mo",
        note: "billed annually",
        savings: Math.round(((tier.monthly - tier.effectiveMonthly) / tier.monthly) * 100),
      };
    }
    return {
      price: tier.monthly,
      period: "/month",
      note: null,
      savings: 0,
    };
  };

  return (
    <>
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Choose your plan</CardTitle>
        <CardDescription>
          Start with a {TRIAL_DAYS}-day free trial. No credit card required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Billing Cycle Toggle */}
        <div className="flex items-center justify-center gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors",
              billingCycle === "monthly"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("annual")}
            className={cn(
              "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors",
              billingCycle === "annual"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Annual
            <Badge variant="secondary" className="ml-2 text-xs">
              Save 12%
            </Badge>
          </button>
        </div>

        {/* Plans */}
        <div className="space-y-3">
          {plans.map((planId) => {
            const isSelected = selectedPlan === planId;
            const priceInfo = getPrice(planId);
            const features = PLAN_FEATURES[planId];
            const description = PLAN_DESCRIPTIONS[planId];
            const isRecommended = planId === "studio";

            return (
              <button
                key={planId}
                type="button"
                onClick={() => onPlanSelect(planId)}
                className={cn(
                  "w-full p-4 rounded-lg border text-left transition-colors relative",
                  isSelected
                    ? "bg-primary/5 border-primary"
                    : "bg-background border-input hover:bg-muted"
                )}
              >
                {isRecommended && (
                  <Badge className="absolute -top-2 right-4 bg-primary text-primary-foreground">
                    Recommended
                  </Badge>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p
                      className={cn(
                        "font-semibold text-lg capitalize",
                        isSelected && "text-primary"
                      )}
                    >
                      {planId}
                    </p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "font-bold text-lg",
                        isSelected && "text-primary"
                      )}
                    >
                      {formatCurrency(priceInfo.price, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {priceInfo.period}
                      {priceInfo.note && (
                        <span className="block">{priceInfo.note}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {features.slice(0, 6).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                {priceInfo.savings > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                      Save {priceInfo.savings}% with annual billing
                    </Badge>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Trial info */}
        <p className="text-center text-sm text-muted-foreground">
          All plans include a {TRIAL_DAYS}-day free trial. Card required before trial ends.
        </p>
      </CardContent>
    </>
  );
}
