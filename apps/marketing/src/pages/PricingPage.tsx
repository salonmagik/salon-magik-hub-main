import { useEffect, useMemo, useState, Fragment } from "react";
import { Link } from "react-router-dom";
import { usePlans, usePlanFeatures, usePlanLimits } from "@/hooks/usePlans";
import { usePlanPricing, getCurrencySymbol } from "@/hooks/usePlanPricing";
import { useSmsCreditPricing } from "@/hooks/useSmsCreditPricing";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import { useMarketingPricingMarkets } from "@/hooks/useMarketConfig";
import { DEFAULT_MARKETING_ADDONS, useMarketingAddonPrices, useMarketingAddons } from "@/hooks/useMarketingAddons";
import { MarketingLayout } from "@/components/MarketingLayout";
import { useWaitlist } from "@/components/WaitlistProvider";
import { cn } from "@shared/utils";

const PRICING_CURRENCY_STORAGE_KEY = "pricing_currency_preference";

const defaultSalonAppUrl =
  typeof import.meta !== "undefined" && import.meta.env?.DEV
    ? "http://localhost:8080"
    : "https://app.salonmagik.com";
const salonAppUrl = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SALON_APP_URL) ||
  defaultSalonAppUrl
).replace(/\/$/, "");

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
	const [currency, setCurrency] = useState("GHS");
  const { isWaitlistMode } = useWaitlistMode();
  const { openWaitlist } = useWaitlist();
	const { data: pricingMarkets, isLoading: marketsLoading } = useMarketingPricingMarkets();
	const visibleCurrencies = useMemo(() => {
		const supportedCurrencies = Array.from(new Set((pricingMarkets ?? []).map((market) => market.currencyCode)));
		return supportedCurrencies.length > 0 ? supportedCurrencies : ["GHS", "NGN"];
	}, [pricingMarkets]);

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: planFeatures, isLoading: featuresLoading } = usePlanFeatures();
  const { data: limits } = usePlanLimits();
  const { data: pricing, isLoading: pricingLoading } = usePlanPricing(currency);
  const { data: cheapestCreditBundlePrice } = useSmsCreditPricing(currency);
  const { data: marketingAddons = DEFAULT_MARKETING_ADDONS } = useMarketingAddons();
  const { data: marketingAddonPrices } = useMarketingAddonPrices(currency);

	const isLoading = plansLoading || pricingLoading || marketsLoading || featuresLoading;
  const trialDays =
    plans?.find((p) => p.is_recommended)?.trial_days ?? plans?.[0]?.trial_days ?? 14;
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
			"Reports and customer history",
		];

  const getPlanPrice = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row) return null;
    if (isAnnual && row.annual_price > 0) return row.effective_monthly;
    return row.monthly_price;
  };

  const getSavingsPct = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row || !row.annual_price || !row.monthly_price) return null;
    const saving = ((row.monthly_price - row.annual_price / 12) / row.monthly_price) * 100;
    return saving > 0 ? Math.round(saving) : null;
  };

  const maxSavingsPct =
    plans?.map((p) => getSavingsPct(p.id)).filter(Boolean).reduce((a, b) => Math.max(a!, b!), 0) ?? null;

  const getPlanLimit = (planId: string) => limits?.find((l) => l.plan_id === planId);

  useEffect(() => {
    const saved = localStorage.getItem(PRICING_CURRENCY_STORAGE_KEY);
		if (saved && visibleCurrencies.includes(saved)) {
      setCurrency(saved);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("https://ipapi.co/json/", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error();
        const geo = await res.json();
        const code = String(geo?.country_code || "").toUpperCase();
			const detectedCountry = code === "NG" ? "NG" : code === "GH" ? "GH" : null;
			const detected = pricingMarkets?.find((market) => market.countryCode === detectedCountry && market.isDefault)?.currencyCode
				?? visibleCurrencies[0];
        if (mounted) { setCurrency(detected); localStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, detected); }
		} catch { if (mounted) setCurrency(visibleCurrencies[0]); }
    })();
    return () => { mounted = false; };
	}, [pricingMarkets, visibleCurrencies]);

  const symbol = getCurrencySymbol(currency);

  return (
		<MarketingLayout>
			{/* Hero */}
			<section className="px-8 pb-0 pt-16 text-center">
				<div className="mx-auto max-w-[600px]">
					<h1 className="font-serif text-[clamp(32px,4vw,48px)] font-medium leading-[1.12] tracking-[-0.4px] text-brand-ink">
						Simple, transparent pricing.
					</h1>
					<p className="mx-auto mt-4 max-w-[440px] text-[17px] leading-relaxed text-brand-ink/55">
						Start with a {trialDays}-day free trial. One base subscription covers the platform, then you add capacity and extras as your salon grows.
					</p>
				</div>

				{/* Toggles */}
				<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
					<div className="flex rounded-full border border-brand-ink/12 bg-white p-1">
						{visibleCurrencies.map((code) => {
							const c = { code, label: `${code} (${getCurrencySymbol(code)})` };
							return (
							<button
								key={c.code}
								type="button"
								onClick={() => {
									setCurrency(c.code);
									localStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, c.code);
								}}
								className={cn(
									"rounded-full px-4 py-1.5 text-[13.5px] transition-colors",
									currency === c.code
										? "bg-brand-purple text-white"
										: "text-brand-ink/60 hover:text-brand-ink",
								)}
							>
								{c.label}
							</button>
							);
						})}
					</div>

					<div className="flex rounded-full border border-brand-ink/12 bg-white p-1">
						{([false, true] as const).map((annual) => (
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
									? maxSavingsPct != null ? `Annual · save up to ${maxSavingsPct}%/yr` : "Annual billing"
									: "Monthly"}
							</button>
						))}
					</div>
				</div>
			</section>

			{/* Plan cards: same as PricingSection on landing */}
			<section className="px-8 pb-[80px] pt-[48px]">
				<div className="mx-auto max-w-[1180px]">
					{isLoading ? (
						<div className="grid grid-cols-1 gap-[22px] md:grid-cols-3">
							{[0, 1, 2].map((i) => (
								<div
									key={i}
									className="h-[500px] animate-pulse rounded-[20px] bg-white/60"
								/>
							))}
						</div>
					) : (
						<div className="mx-auto max-w-[620px] rounded-[22px] border-[1.5px] border-brand-purple bg-white px-8 py-9 shadow-[0_30px_60px_rgba(46,31,78,0.14)]">
							<div className="font-serif text-[26px] text-brand-ink">Salon Magik</div>
							<p className="mt-1.5 text-[14px] text-brand-ink/55">One subscription for your salon, with room to grow.</p>
							<div className="mt-6 font-serif text-[46px] leading-none text-brand-ink">
								{basePlan && getPlanPrice(basePlan.id) != null ? `${symbol}${getPlanPrice(basePlan.id)?.toLocaleString()}` : "Custom"}
								<span className="font-sans text-[14px] text-brand-ink/50"> / month</span>
							</div>
							<p className="mt-2 text-[13px] text-brand-ink/50">Locations, seats, themes, Staff Operations, and SMS top-ups are added separately when needed.</p>
							<div className="mt-7 grid gap-3 text-[14.5px] text-brand-ink/75 sm:grid-cols-2">
				{featureList.map((item) => <div key={item} className="flex items-start gap-2.5"><span className="text-brand-purple">✓</span>{item}</div>)}
							</div>
							{isWaitlistMode ? <button type="button" onClick={openWaitlist} className="mt-8 block w-full rounded-full bg-brand-ink py-[13px] text-center text-[14.5px] font-medium text-white hover:bg-brand-purple">Start free</button> : <a href={`${salonAppUrl}/signup${basePlan ? `?plan=${basePlan.slug}` : ""}`} className="mt-8 block w-full rounded-full bg-brand-ink py-[13px] text-center text-[14.5px] font-medium text-white hover:bg-brand-purple">Start free</a>}
						</div>
					)}
				</div>
			</section>

			<section className="bg-brand-cream-dim px-8 py-[80px]">
				<div className="mx-auto max-w-[960px] text-center">
					<div className="mb-3 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">Included from day one</div>
					<h2 className="font-serif text-[clamp(24px,3vw,34px)] font-medium tracking-[-0.3px] text-brand-ink">Everything your salon needs to operate</h2>
					<div className="mt-10 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
						{featureList.map((item) => <div key={item} className="rounded-[16px] border border-brand-ink/8 bg-white p-5 text-[14.5px] text-brand-ink/75"><span className="mr-2 text-brand-purple">✓</span>{item}</div>)}
					</div>
				</div>
			</section>

			{/* Add-ons */}
			<section className="px-8 py-[80px]">
				<div className="mx-auto max-w-[1180px]">
					<div className="mb-10 flex flex-col items-center justify-center">
						<div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
							<span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
							Add-ons
						</div>
						<h2 className="font-serif text-[clamp(24px,3vw,34px)] font-medium tracking-[-0.3px] text-brand-ink">
							Extend your plan
						</h2>
						<p className="mt-2 text-[16px] text-brand-ink/55">
							Optional extras you can add to any plan, or unlock as your
							business grows.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
						{(marketingAddons ?? []).filter((addon) => addon.status !== "hidden").map((addon) => {
							const price = addon.key === "extra_communication_credits" && cheapestCreditBundlePrice != null
								? `Starting from ${getCurrencySymbol(currency)}${cheapestCreditBundlePrice.toLocaleString()} / bundle`
								: addon.key === "staff_operations" && marketingAddonPrices?.staffOperations != null
									? `${getCurrencySymbol(currency)}${marketingAddonPrices.staffOperations.toLocaleString()} / location / month after trial`
									: addon.key === "staff_operations"
										? "Included during your free trial · paid add-on afterwards."
										: addon.key === "ecommerce_themes" && marketingAddonPrices?.ecommerceThemes != null
											? `${getCurrencySymbol(currency)}${marketingAddonPrices.ecommerceThemes.toLocaleString()} / theme / year after trial`
											: addon.key === "ecommerce_themes"
												? "Included during your free trial · paid add-on afterwards."
										: null;
							const available = addon.status === "available";
							return (
							<div
								key={addon.name}
								className={cn(
									"rounded-[18px] border p-6",
									available
										? "border-brand-ink/8 bg-white"
										: "border-dashed border-brand-ink/10 bg-brand-cream-dim",
								)}
							>
								<div className="mb-3 flex items-start justify-between gap-3">
									<div className="font-serif text-[18px] font-medium text-brand-ink">
										{addon.name}
									</div>
									{available ? (
										<span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11.5px] font-medium text-emerald-700">
											Available
										</span>
									) : (
										<span className="shrink-0 rounded-full bg-brand-yellow/20 px-3 py-1 text-[11.5px] font-medium text-brand-purple">
											Coming soon
										</span>
									)}
								</div>
								<p className="text-[14px] text-brand-ink/55">{addon.description}</p>
								{price && (
									<p className="mt-3 text-[13.5px] font-medium text-brand-purple">
										{price}
									</p>
								)}
							</div>
							);
						})}
					</div>
				</div>
			</section>

			{/* FAQ teaser */}
			<section className="bg-brand-cream-dim px-8 py-[80px] text-center">
				<div className="mx-auto max-w-[520px]">
					<h2 className="font-serif text-[clamp(22px,3vw,30px)] font-medium text-brand-ink">
						Still have questions?
					</h2>
					<p className="mt-3 text-[15px] text-brand-ink/55">
						We've answered the most common ones. If yours isn't there, reach out
						and we'll get back to you.
					</p>
					<div className="mt-7 flex flex-wrap items-center justify-center gap-4">
						<Link
							to="/faq"
							className="rounded-full border-[1.5px] border-brand-purple px-7 py-[13px] text-[15px] font-medium text-brand-purple transition-colors hover:bg-brand-lilac-bg"
						>
							View all FAQs
						</Link>
						<a
							href="mailto:hello@salonmagik.com"
							className="rounded-full bg-brand-ink px-7 py-[13px] text-[15px] font-medium text-white transition-colors hover:bg-brand-purple"
						>
							Contact support
						</a>
					</div>
				</div>
			</section>
		</MarketingLayout>
	);
}
