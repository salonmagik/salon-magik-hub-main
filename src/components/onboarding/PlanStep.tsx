import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubscriptionPlan = "solo" | "studio" | "chain";

interface PlanStepProps {
  selectedPlan: SubscriptionPlan | null;
  onPlanSelect: (plan: SubscriptionPlan) => void;
}

const PLANS = [
  {
    id: "solo" as SubscriptionPlan,
    name: "Solo",
    description: "Perfect for independent stylists",
    price: "Free",
    priceNote: "Forever free",
    features: [
      "1 location",
      "1 staff member",
      "Unlimited appointments",
      "Basic reports",
      "30 free messages/month",
    ],
    recommended: false,
  },
  {
    id: "studio" as SubscriptionPlan,
    name: "Studio",
    description: "For growing salons with a small team",
    price: "₦15,000",
    priceNote: "/month",
    features: [
      "1 location",
      "Up to 10 staff",
      "Advanced scheduling",
      "Full analytics",
      "100 free messages/month",
      "Online booking",
      "Customer purse",
    ],
    recommended: true,
  },
  {
    id: "chain" as SubscriptionPlan,
    name: "Chain",
    description: "For multi-location businesses",
    price: "₦50,000",
    priceNote: "/month",
    features: [
      "Unlimited locations",
      "Unlimited staff",
      "Multi-location management",
      "Advanced analytics",
      "500 free messages/month",
      "Priority support",
      "API access",
    ],
    recommended: false,
  },
];

export function PlanStep({ selectedPlan, onPlanSelect }: PlanStepProps) {
  return (
    <>
      <CardHeader>
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Choose your plan</CardTitle>
        <CardDescription>
          Start with a 14-day free trial. No credit card required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onPlanSelect(plan.id)}
              className={cn(
                "w-full p-4 rounded-lg border text-left transition-colors relative",
                isSelected
                  ? "bg-primary/5 border-primary"
                  : "bg-background border-input hover:bg-muted"
              )}
            >
              {plan.recommended && (
                <Badge className="absolute -top-2 right-4 bg-primary text-primary-foreground">
                  Recommended
                </Badge>
              )}
              
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className={cn(
                    "font-semibold text-lg",
                    isSelected && "text-primary"
                  )}>
                    {plan.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-bold text-lg",
                    isSelected && "text-primary"
                  )}>
                    {plan.price}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.priceNote}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </CardContent>
    </>
  );
}
