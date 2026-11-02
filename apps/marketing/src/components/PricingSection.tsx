import { useEffect, useMemo, useState } from "react";
import { cn } from "@shared/utils";
import { usePlans, usePlanFeatures } from "@/hooks/usePlans";
import { usePlanPricing, getCurrencySymbol } from "@/hooks/usePlanPricing";
import { useMarketingPricingMarkets } from "@/hooks/useMarketConfig";
import { DEFAULT_MARKETING_ADDONS, useMarketingAddonPrices, useMarketingAddons } from "@/hooks/useMarketingAddons";
import { useSmsCreditPricing } from "@/hooks/useSmsCreditPricing";

interface PricingSectionProps {
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
}

export function PricingSection({ isWaitlistMode, onWaitlistClick }: PricingSectionProps) {
	const [currency, setCurrency] = useState("GHS");
  const [isAnnual, setIsAnnual] = useState(false);

  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  const { data: plans, isLoading: plansLoading } = usePlans();
	const { data: planFeatures, isLoading: featuresLoading } = usePlanFeatures();
	const { data: pricingMarkets, isLoading: marketsLoading } = useMarketingPricingMarkets();
	const { data: marketingAddons = DEFAULT_MARKETING_ADDONS } = useMarketingAddons();
	const visibleCurrencies = useMemo(() => {
		const supportedCurrencies = Array.from(new Set((pricingMarkets ?? []).map((market) => market.currencyCode)));
		return supportedCurrencies.length > 0 ? supportedCurrencies : ["GHS", "NGN"];
	}, [pricingMarkets]);
  const { data: pricing, isLoading: pricingLoading } = usePlanPricing(currency);
	const { data: cheapestCreditBundlePrice } = useSmsCreditPricing(currency);
	const { data: marketingAddonPrices } = useMarketingAddonPrices(currency);

	const isLoading = plansLoading || pricingLoading || marketsLoading || featuresLoading;
  const symbol = getCurrencySymbol(currency);
  const basePlan = plans?.find((plan) => plan.slug === "solo") ?? plans?.find((plan) => plan.is_recommended) ?? plans?.[0];
	const configuredFeatures = planFeatures
		?.filter((feature) => feature.plan_id === basePlan?.id)
		.sort((a, b) => a.sort_order - b.sort_order)
		.map((feature) => feature.feature_text);
	const featureList = configuredFeatures?.length
		? configuredFeatures
		: [
			"Unlimited services, products, packages, and vouchers",
			"Unlimited email marketing and reminders",
			"Complimentary SMS allowances for reminders and marketing",
			"Appointments, payments, booking page, and reports",
			"Add locations and team seats as your salon grows",
		];

	useEffect(() => {
		if (!visibleCurrencies.includes(currency)) {
			const defaultCurrency = pricingMarkets?.find((market) => market.isDefault)?.currencyCode ?? visibleCurrencies[0];
			if (defaultCurrency) setCurrency(defaultCurrency);
		}
	}, [currency, pricingMarkets, visibleCurrencies]);

  const getPlanPrice = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row) return null;
    if (isAnnual && row.annual_price > 0) return row.effective_monthly;
    return row.monthly_price;
  };

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
            One base subscription for your salon. Add locations, seats, themes, Staff Operations, and SMS top-ups as you grow.
          </p>
        </div>

        {/* Toggles */}
        <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
          <div className="flex rounded-full border border-brand-ink/12 bg-white p-1">
			{visibleCurrencies.map((c) => (
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
					{c} ({getCurrencySymbol(c)})
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
								  ? (() => { const maxSavings = plans?.map((p) => getSavingsPct(p.id)).filter((value): value is number => value != null).reduce((a, b) => Math.max(a, b), 0); return maxSavings != null ? `Annual · save up to ${maxSavings}%/yr` : "Annual billing"; })()
                  : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        {isLoading || !basePlan ? (
          <div className="mx-auto h-[430px] max-w-[520px] animate-pulse rounded-[20px] bg-white/60" />
        ) : (
          <div className="mx-auto max-w-[520px] rounded-[22px] border-[1.5px] border-brand-purple bg-white px-7 py-8 shadow-[0_30px_60px_rgba(46,31,78,0.14)]">
            <div className="font-serif text-[24px] text-brand-ink">Salon Magik</div>
            <p className="mt-1.5 text-[14px] text-brand-ink/55">Everything you need to run one or more locations.</p>
            <div className="mt-6 font-serif text-[42px] leading-none text-brand-ink">
              {getPlanPrice(basePlan.id) != null ? `${symbol}${getPlanPrice(basePlan.id)?.toLocaleString()}` : "Custom"}
              <span className="font-sans text-[14px] text-brand-ink/50"> / month</span>
            </div>
            <p className="mt-2 text-[13px] text-brand-ink/50">Start with a free trial. Add capacity only when you need it.</p>
            <ul className="mt-7 space-y-3 text-[14.5px] text-brand-ink/75">
              {featureList.map((item) => (
                <li key={item} className="flex items-start gap-2.5"><span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-brand-purple text-[10px] text-brand-yellow">✓</span>{item}</li>
              ))}
            </ul>
            {isWaitlistMode ? (
              <button type="button" onClick={onWaitlistClick} className="mt-8 block w-full rounded-full bg-brand-ink py-[13px] text-center text-[14.5px] font-medium text-white hover:bg-brand-purple">Start free</button>
            ) : (
              <a href={`${salonAppUrl}/signup?plan=${basePlan.slug}`} className="mt-8 block w-full rounded-full bg-brand-ink py-[13px] text-center text-[14.5px] font-medium text-white hover:bg-brand-purple">Start free</a>
            )}
          </div>
        )}

        <div className="mt-12 text-center">
          <div className="mb-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">Add-ons</div>
          <h3 className="font-serif text-[clamp(24px,3vw,32px)] font-medium text-brand-ink">Extend your plan</h3>
          <p className="mt-2 text-[16px] text-brand-ink/55">Optional extras you can add as your salon grows.</p>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          {marketingAddons.filter((addon) => addon.status !== "hidden").map((addon) => {
            const available = addon.status === "available";
            const price = addon.key === "extra_communication_credits" && cheapestCreditBundlePrice != null
              ? `From ${getCurrencySymbol(currency)}${cheapestCreditBundlePrice.toLocaleString()} / bundle`
              : addon.key === "staff_operations" && marketingAddonPrices?.staffOperations != null
                ? `${getCurrencySymbol(currency)}${marketingAddonPrices.staffOperations.toLocaleString()} / location / month after trial`
                : addon.key === "staff_operations"
                  ? "Included during your free trial · paid add-on afterwards."
                  : addon.key === "ecommerce_themes" && marketingAddonPrices?.ecommerceThemes != null
                    ? `${getCurrencySymbol(currency)}${marketingAddonPrices.ecommerceThemes.toLocaleString()} / theme / year after trial`
                    : addon.key === "ecommerce_themes" ? "Included during your free trial · paid add-on afterwards." : null;
            return (
              <div key={addon.key} className={cn("rounded-[18px] border p-6", available ? "border-brand-ink/8 bg-white" : "border-dashed border-brand-ink/10 bg-brand-cream-dim")}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="font-serif text-[18px] font-medium text-brand-ink">{addon.name}</div>
                  <span className={cn("shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium", available ? "bg-emerald-50 text-emerald-700" : "bg-brand-yellow/20 text-brand-purple")}>{available ? "Available" : "Coming soon"}</span>
                </div>
                <p className="text-[14px] text-brand-ink/55">{addon.description}</p>
                {price && <p className="mt-3 text-[13.5px] font-medium text-brand-purple">{price}</p>}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
