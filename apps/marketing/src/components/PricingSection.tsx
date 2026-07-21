import { useState } from "react";
import { cn } from "@shared/utils";
import { usePlans, usePlanFeatures } from "@/hooks/usePlans";
import { usePlanPricing, getCurrencySymbol } from "@/hooks/usePlanPricing";

type Currency = "GHS" | "NGN";

interface PricingSectionProps {
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
}

function Check() {
  return (
    <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-brand-purple text-[10px] text-brand-yellow">
      ✓
    </span>
  );
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
            No setup fees, no per-text charges. Start free, upgrade when your team grows.
          </p>
        </div>

        {/* Toggles */}
        <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
          {/* Currency toggle */}
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

          {/* Billing toggle */}
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
            {(plans ?? []).map((plan) => {
              const price = getPlanPrice(plan.id);
              const planFeatures = getPlanFeatures(plan.id);
              const savingsPct = getSavingsPct(plan.id);
              const isChain = plan.slug === "chain";

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-[20px] border-[1.5px] bg-white px-7 py-8",
                    plan.is_recommended
                      ? "border-brand-purple shadow-[0_30px_60px_rgba(46,31,78,0.14)]"
                      : "border-brand-ink/8",
                  )}
                >
                  {plan.is_recommended && (
                    <span className="absolute -top-[13px] left-7 rounded-full bg-brand-purple px-3 py-[5px] text-[11.5px] tracking-[0.03em] text-white">
                      Most set up for teams
                    </span>
                  )}

                  <div className="font-serif text-[22px] text-brand-ink">{plan.name}</div>
                  <div className="mt-1.5 text-[13.5px] text-brand-ink/50">{plan.description}</div>

                  <div className="mt-5">
                    {price != null ? (
                      <>
                        <div className="font-serif text-[40px] leading-none text-brand-ink">
                          {symbol}{price.toLocaleString()}
                          <span className="font-sans text-[14px] text-brand-ink/50"> / month</span>
                        </div>
                        {isAnnual && savingsPct ? (
                          <div className="mt-1.5 text-[12.5px]">
                            <span className="font-medium text-brand-yellow line-through decoration-brand-yellow/60">
                              {symbol}{pricing?.find((p) => p.plan_id === plan.id)?.monthly_price?.toLocaleString()}/mo without annual
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1 text-[12.5px] text-brand-ink/45">
                            Save up to {getSavingsPct(plan.id) ?? "—"}% with annual billing
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="font-serif text-[32px] leading-none text-brand-ink">Custom</div>
                    )}
                  </div>

                  <ul className="mb-8 mt-6 flex flex-1 flex-col gap-[13px]">
                    {planFeatures.map((f) => (
                      <li key={f.id} className="flex items-start gap-2.5 text-[14.5px] text-brand-ink/75">
                        <Check />
                        {f.feature_text}
                      </li>
                    ))}
                  </ul>

                  {isChain ? (
                    <a
                      href="#"
                      className="block w-full rounded-full border-[1.5px] border-brand-purple py-[13px] text-center text-[14.5px] font-medium text-brand-purple transition-colors hover:bg-brand-lilac-bg"
                    >
                      Talk to us
                    </a>
                  ) : isWaitlistMode ? (
                    <button
                      type="button"
                      onClick={onWaitlistClick}
                      className={cn(
                        "w-full rounded-full py-[13px] text-[14.5px] font-medium transition-colors",
                        plan.is_recommended
                          ? "bg-brand-ink text-white hover:bg-brand-purple"
                          : "border-[1.5px] border-brand-purple text-brand-purple hover:bg-brand-lilac-bg",
                      )}
                    >
                      Start free
                    </button>
                  ) : (
                    <a
                      href={`${salonAppUrl}/signup`}
                      className={cn(
                        "block w-full rounded-full py-[13px] text-center text-[14.5px] font-medium transition-colors",
                        plan.is_recommended
                          ? "bg-brand-ink text-white hover:bg-brand-purple"
                          : "border-[1.5px] border-brand-purple text-brand-purple hover:bg-brand-lilac-bg",
                      )}
                    >
                      Start free
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
}
