import { useState } from "react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@shared/utils";
import { formatCurrency } from "@shared/currency";
import { usePlans } from "@/hooks/usePlans";
import { usePlanPricing } from "@/hooks/usePlanPricing";

export type SubscriptionPlan = "solo" | "studio" | "chain";

interface PlanStepProps {
  selectedPlan: SubscriptionPlan | null;
  onPlanSelect: (plan: SubscriptionPlan) => void;
  currency: string;
}

export function PlanStep({ selectedPlan, onPlanSelect, currency }: PlanStepProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: pricing, isLoading: pricingLoading } = usePlanPricing(currency);

  const isLoading = plansLoading || pricingLoading;

  const getEquivalentMonthly = (
		monthlyPrice: number,
		annualPrice: number,
		effectiveMonthly: number,
	) => {
		if (annualPrice > 0) {
			return annualPrice / 12;
		}

		return effectiveMonthly;
	};

	const getAnnualSavingsPercent = (
		monthlyPrice: number,
		equivalentMonthly: number,
	) => {
		if (monthlyPrice <= 0) return 0;
		return Math.max(
			0,
			Math.round(((monthlyPrice - equivalentMonthly) / monthlyPrice) * 100),
		);
	};

	const maxAnnualSavings = Math.max(
		0,
		...(pricing?.map((p) =>
			getAnnualSavingsPercent(
				p.monthly_price,
				getEquivalentMonthly(
					p.monthly_price,
					p.annual_price,
					p.effective_monthly,
				),
			),
		) ?? [0]),
	);

  const getPrice = (planId: string) => {
    const plan = plans?.find(p => p.slug === planId);
    const planPricing = pricing?.find(p => p.plan_id === plan?.id);

    if (!planPricing) {
      return { price: 0, period: "/mo", note: null, savings: 0 };
    }

    if (billingCycle === "annual" && planPricing.annual_price > 0) {
      const equivalentMonthly = getEquivalentMonthly(
				planPricing.monthly_price,
				planPricing.annual_price,
				planPricing.effective_monthly,
			);
			const savings = getAnnualSavingsPercent(
				planPricing.monthly_price,
				equivalentMonthly,
			);

      return {
				price: equivalentMonthly,
				period: "/mo",
				note: "equivalent monthly, billed annually",
				savings,
			};
    }
    return {
      price: planPricing.monthly_price,
      period: "/month",
      note: null,
      savings: 0,
    };
  };

  if (isLoading) {
    return (
      <>
        <CardHeader>
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Choose your plan</CardTitle>
          <CardDescription>Loading plans...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </>
    );
  }

  const trialDays = plans?.[0]?.trial_days || 14;

  return (
		<>
			<CardHeader>
				<div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
					<Sparkles className="w-6 h-6 text-primary" />
				</div>
				<CardTitle>Choose your plan</CardTitle>
				<CardDescription>
					Start with a {trialDays}-day free trial. No credit card required.
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
								: "text-muted-foreground hover:text-foreground",
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
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Annual
						<Badge variant="secondary" className="ml-2 text-xs">
							Save up to {maxAnnualSavings}%
						</Badge>
					</button>
				</div>

				{/* Plans */}
				<div className="space-y-3">
					{plans?.map((plan) => {
						const isSelected = selectedPlan === plan.slug;
						const priceInfo = getPrice(plan.slug);
						const isRecommended = plan.is_recommended;

						return (
							<button
								key={plan.id}
								type="button"
								onClick={() => onPlanSelect(plan.slug as SubscriptionPlan)}
								className={cn(
									"w-full p-4 rounded-lg border text-left transition-colors relative",
									isSelected
										? "bg-primary/5 border-primary"
										: "bg-background border-input hover:bg-muted",
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
												isSelected && "text-primary",
											)}
										>
											{plan.name}
										</p>
										<p className="text-sm text-muted-foreground">
											{plan.description}
										</p>
									</div>
									<div className="text-right">
										<p
											className={cn(
												"font-bold text-lg",
												isSelected && "text-primary",
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
									{plan.features.slice(0, 6).map((feature) => (
										<div
											key={feature.id}
											className="flex items-center gap-2 text-sm"
										>
											<Check className="w-3.5 h-3.5 text-primary shrink-0" />
											<span className="text-muted-foreground">
												{feature.feature_text}
											</span>
										</div>
									))}
								</div>

								{priceInfo.savings > 0 && (
									<div className="mt-2 pt-2 border-t">
										<Badge
											variant="outline"
											className="text-xs text-green-600 border-green-200 bg-green-50"
										>
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
					All plans include a {trialDays}-day free trial. Card required before
					trial ends.
				</p>
			</CardContent>
		</>
	);
}
