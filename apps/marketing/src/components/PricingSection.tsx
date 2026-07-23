import { useState } from "react";
import { cn } from "@shared/utils";
import { usePlans, usePlanFeatures } from "@/hooks/usePlans";
import { usePlanPricing, getCurrencySymbol } from "@/hooks/usePlanPricing";
import { PlanCard } from "@/components/PlanCard";

type Currency = "GHS" | "NGN";

interface PricingSectionProps {
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
}

export function PricingSection({ isWaitlistMode, onWaitlistClick }: PricingSectionProps) {
  const [currency, setCurrency] = useState<Currency>("GHS");
  const [isAnnual, setIsAnnual] = useState(false);

  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: features } = usePlanFeatures();
  const { data: pricing, isLoading: pricingLoading } = usePlanPricing(currency);

  const isLoading = plansLoading || pricingLoading;
  const symbol = getCurrencySymbol(currency);

  const getPlanPrice = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row) return null;
    if (isAnnual && row.annual_price > 0) return row.effective_monthly;
    return row.monthly_price;
  };

  const getMonthlyPrice = (planId: string) =>
    pricing?.find((p) => p.plan_id === planId)?.monthly_price ?? null;

  const getPlanFeatures = (planId: string) =>
    (features ?? []).filter((f) => f.plan_id === planId).sort((a, b) => a.sort_order - b.sort_order);

  const getSavingsPct = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row || !row.annual_price || !row.monthly_price) return null;
    const annualMonthly = row.annual_price / 12;
    const saving = ((row.monthly_price - annualMonthly) / row.monthly_price) * 100;
    return saving > 0 ? Math.round(saving) : null;
  };

  return (
    <section id="pricing" className="bg-brand-cream-dim px-8 py-[110px]">
      <div className="mx-auto max-w-[1180px]">

        {/* Header */}
        <div className="mx-auto mb-14 max-w-[560px] text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
            <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
            Pricing
          </div>
          <h2 className="mb-3.5 font-serif text-[clamp(28px,3.5vw,38px)] font-medium leading-[1.18] tracking-[-0.3px] text-brand-ink">
            One price, everything included.
          </h2>
          <p className="text-[16px] text-brand-ink/60">
            No setup fees. Unlimited email, SMS credits included in every plan, top up only when you need more.
          </p>
        </div>

        {/* Toggles */}
        <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
          <div className="flex rounded-full border border-brand-ink/12 bg-white p-1">
            {(["GHS", "NGN"] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13.5px] transition-colors",
                  currency === c
                    ? "bg-brand-purple text-white"
                    : "text-brand-ink/60 hover:text-brand-ink",
                )}
              >
                {c === "GHS" ? "GHS (₵)" : "NGN (₦)"}
              </button>
            ))}
          </div>

          <div className="flex rounded-full border border-brand-ink/12 bg-white p-1">
            {[false, true].map((annual) => (
              <button
                key={String(annual)}
                type="button"
                onClick={() => setIsAnnual(annual)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13.5px] transition-colors",
                  isAnnual === annual
                    ? "bg-brand-purple text-white"
                    : "text-brand-ink/60 hover:text-brand-ink",
                )}
              >
                {annual
                  ? `Annual · save up to ${plans?.map((p) => getSavingsPct(p.id)).filter(Boolean).reduce((a, b) => Math.max(a!, b!), 0) ?? "—"}%/yr`
                  : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-[22px] md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[480px] animate-pulse rounded-[20px] bg-white/60" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-[22px] md:grid-cols-3">
            {(plans ?? []).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                price={getPlanPrice(plan.id)}
                monthlyPrice={getMonthlyPrice(plan.id)}
                savingsPct={getSavingsPct(plan.id)}
                features={getPlanFeatures(plan.id)}
                isAnnual={isAnnual}
                isWaitlistMode={isWaitlistMode}
                onWaitlistClick={onWaitlistClick}
                symbol={symbol}
                salonAppUrl={salonAppUrl}
                compact
              />
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
