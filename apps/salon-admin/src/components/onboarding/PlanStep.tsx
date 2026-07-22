import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
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

  const getEquivalentMonthly = (monthlyPrice: number, annualPrice: number, effectiveMonthly: number) => {
    if (annualPrice > 0) return annualPrice / 12;
    return effectiveMonthly;
  };

  const getAnnualSavingsPercent = (monthlyPrice: number, equivalentMonthly: number) => {
    if (monthlyPrice <= 0) return 0;
    return Math.max(0, Math.round(((monthlyPrice - equivalentMonthly) / monthlyPrice) * 100));
  };

  const maxAnnualSavings = Math.max(
    0,
    ...(pricing?.map((p) =>
      getAnnualSavingsPercent(
        p.monthly_price,
        getEquivalentMonthly(p.monthly_price, p.annual_price, p.effective_monthly),
      ),
    ) ?? [0]),
  );

  const getPrice = (planSlug: string) => {
    const plan = plans?.find((p) => p.slug === planSlug);
    const planPricing = pricing?.find((p) => p.plan_id === plan?.id);

    if (!planPricing) return { price: 0, period: "/mo", note: null, savings: 0 };

    if (billingCycle === "annual" && planPricing.annual_price > 0) {
      const equivalentMonthly = getEquivalentMonthly(
        planPricing.monthly_price,
        planPricing.annual_price,
        planPricing.effective_monthly,
      );
      const savings = getAnnualSavingsPercent(planPricing.monthly_price, equivalentMonthly);
      return { price: equivalentMonthly, period: "/mo", note: "billed annually", savings };
    }
    return { price: planPricing.monthly_price, period: "/month", note: null, savings: 0 };
  };

  const trialDays = plans?.[0]?.trial_days || 14;

  return (
    <div className="p-7">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-[#2E1F4E]">
          <span className="inline-block h-[1.5px] w-4 bg-[#F4C84E]" />
          Subscription
        </div>
        <h2 className="font-serif text-[24px] font-medium leading-snug tracking-[-0.3px] text-gray-900">
          Pick what fits your business.
        </h2>
        <p className="mt-1.5 text-[14px] text-black/45">
          You can change plans anytime from Settings.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#2E1F4E]" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Billing cycle toggle */}
          <div className="inline-flex rounded-full border border-black/[0.08] bg-black/[0.04] p-1">
            {(["monthly", "annual"] as const).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={cn(
                  "rounded-full px-5 py-2 text-[13.5px] font-medium transition-colors",
                  billingCycle === cycle
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-black/45 hover:text-black/70",
                )}
              >
                {cycle === "monthly" ? "Monthly" : (
                  <>Annual{" "}<span className="text-[11.5px] font-semibold text-[#2E1F4E]">Save {maxAnnualSavings}%</span></>
                )}
              </button>
            ))}
          </div>

          {/* Plan cards */}
          <div className="space-y-3">
            {plans?.map((plan) => {
              const isSelected = selectedPlan === plan.slug;
              const priceInfo = getPrice(plan.slug);

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => onPlanSelect(plan.slug as SubscriptionPlan)}
                  className={cn(
                    "relative w-full rounded-[22px] border px-6 py-6 text-left transition-colors",
                    isSelected
                      ? "border-[#2E1F4E] bg-[#2E1F4E]/[0.04]"
                      : "border-black/[0.08] bg-white hover:bg-black/[0.02]",
                  )}
                >
                  {plan.is_recommended && (
                    <span className="absolute -top-[11px] left-5 rounded-full bg-[#2E1F4E] px-3 py-[4px] text-[11px] font-medium text-white">
                      Most popular
                    </span>
                  )}

                  {/* Name + price row */}
                  <div className="flex items-start justify-between gap-4">
                    <p
                      className={cn(
                        "font-serif text-[22px] font-medium capitalize leading-tight",
                        isSelected ? "text-[#2E1F4E]" : "text-gray-900",
                      )}
                    >
                      {plan.name}
                    </p>
                    <div className="shrink-0 text-right">
                      <p className={cn("font-serif text-[26px] font-medium leading-none", isSelected ? "text-[#2E1F4E]" : "text-gray-900")}>
                        {formatCurrency(priceInfo.price, currency)}
                      </p>
                      <p className="mt-1 text-[11.5px] text-black/40">
                        {priceInfo.period}
                        {priceInfo.note && <span className="block">{priceInfo.note}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mt-2.5 text-[13.5px] leading-snug text-black/45">{plan.description}</p>

                  {/* Features */}
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                    {plan.features.slice(0, 6).map((feature) => (
                      <div key={feature.id} className="flex items-center gap-2 text-[13px] text-black/60">
                        <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-[#2E1F4E]">
                          <Check className="h-[10px] w-[10px] text-white" strokeWidth={3} />
                        </span>
                        {feature.feature_text}
                      </div>
                    ))}
                  </div>

                  {priceInfo.savings > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-medium text-emerald-700">
                      Save {priceInfo.savings}% vs monthly
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-center text-[12.5px] text-black/40">
            All plans include a {trialDays}-day free trial. Card required before trial ends.
          </p>
        </div>
      )}
    </div>
  );
}
