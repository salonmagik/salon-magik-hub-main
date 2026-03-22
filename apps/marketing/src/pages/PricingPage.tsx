import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePlans, usePlanFeatures, usePlanLimits } from "@/hooks/usePlans";
import { usePlanPricing, getCurrencySymbol } from "@/hooks/usePlanPricing";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { Switch } from "@ui/switch";
import { Badge } from "@ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Check, Loader2, ArrowLeft, Sparkles } from "lucide-react";

const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD ($)" },
  { code: "NGN", label: "NGN (₦)" },
  { code: "GHS", label: "GHS (₵)" },
];
const PRICING_CURRENCY_STORAGE_KEY = "pricing_currency_preference";

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const { isWaitlistMode } = useWaitlistMode();

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: features } = usePlanFeatures();
  const { data: limits } = usePlanLimits();
  const { data: pricing, isLoading: pricingLoading } = usePlanPricing(currency);

  const isLoading = plansLoading || pricingLoading;
  const trialDays = plans?.find((plan) => plan.is_recommended)?.trial_days ?? plans?.[0]?.trial_days ?? 14;

  const getEquivalentMonthly = (planId: string) => {
		const planPricing = pricing?.find((p) => p.plan_id === planId);
		if (!planPricing) return null;

		if (planPricing.annual_price > 0) {
			return planPricing.annual_price / 12;
		}

		return planPricing.effective_monthly;
	};

  const getPlanPrice = (planId: string) => {
    const planPricing = pricing?.find((p) => p.plan_id === planId);
    if (!planPricing) return null;

    const equivalentMonthly = getEquivalentMonthly(planId);
		return isAnnual
			? (equivalentMonthly ?? planPricing.effective_monthly)
			: planPricing.monthly_price;
  };

  const getPlanAnnualTotal = (planId: string) => {
    const planPricing = pricing?.find((p) => p.plan_id === planId);
    return planPricing?.annual_price || 0;
  };

  const getPlanFeatures = (planId: string) => {
    return features?.filter((f) => f.plan_id === planId).sort((a, b) => a.sort_order - b.sort_order) || [];
  };

  const getPlanLimit = (planId: string) => {
    return limits?.find((l) => l.plan_id === planId);
  };

  const faqs = [
    {
      q: "Is there a free trial?",
      a: `Yes! All plans include a ${trialDays}-day free trial. No credit card required to start.`,
    },
    {
      q: "Can I change plans later?",
      a: "Absolutely. Upgrade or downgrade anytime. Changes take effect on your next billing cycle.",
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept all major credit cards via Stripe. In Nigeria and Ghana, we also support Paystack for local cards and bank transfers.",
    },
    {
      q: "What are communication credits?",
      a: "Credits are used for SMS and WhatsApp notifications to your clients. Each plan includes a monthly allocation, and you can purchase more if needed.",
    },
    {
      q: "Do you offer refunds?",
      a: "Yes. If you're not satisfied within the first 30 days, contact support for a full refund.",
    },
  ];

  useEffect(() => {
    const saved = localStorage.getItem(PRICING_CURRENCY_STORAGE_KEY);
    if (saved && SUPPORTED_CURRENCIES.some((item) => item.code === saved)) {
      setCurrency(saved);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const response = await fetch("https://ipapi.co/json/", {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Geo lookup failed");
        const geo = await response.json();
        const code = String(geo?.country_code || geo?.country || "").toUpperCase();
        const detected = code === "NG" ? "NGN" : code === "GH" ? "GHS" : "USD";

        if (isMounted) {
          setCurrency(detected);
          localStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, detected);
        }
      } catch {
        if (isMounted) {
          setCurrency("USD");
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const formatAmount = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(Number(value))) return "0.00";
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
		<div className="min-h-screen bg-background">
			{/* Navigation */}
			<nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
				<div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
					<Link to="/">
						<SalonMagikLogo size="md" />
					</Link>
					<div className="flex items-center gap-4">
						{!isWaitlistMode && (
							<>
								<Link to="/login">
									<Button variant="ghost" size="sm">
										Log in
									</Button>
								</Link>
								<Link to="/signup">
									<Button size="sm">Get started</Button>
								</Link>
							</>
						)}
					</div>
				</div>
			</nav>

			{/* Header */}
			<section className="py-12 px-4">
				<div className="max-w-6xl mx-auto text-center">
					<Link
						to="/"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
					>
						<ArrowLeft className="w-4 h-4" />
						Back to home
					</Link>
					<h1 className="text-4xl font-semibold mb-4">
						Simple, transparent pricing
					</h1>
					<p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
						Choose the plan that fits your salon. All plans include a {trialDays}-day
						free trial.
					</p>

					{/* Billing Toggle & Currency Selector */}
					<div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
						<div className="flex items-center gap-3">
							<span
								className={!isAnnual ? "font-medium" : "text-muted-foreground"}
							>
								Monthly
							</span>
							<Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
							<span
								className={isAnnual ? "font-medium" : "text-muted-foreground"}
							>
								Annual
							</span>
							{isAnnual && (
								<Badge
									variant="secondary"
									className="bg-success/10 text-success"
								>
									Annual discount applied
								</Badge>
							)}
						</div>

						<Select
              value={currency}
              onValueChange={(value) => {
                setCurrency(value);
                localStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, value);
              }}
            >
							<SelectTrigger className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SUPPORTED_CURRENCIES.map((c) => (
									<SelectItem key={c.code} value={c.code}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</section>

			{/* Pricing Cards */}
			<section className="pb-16 px-4">
				<div className="max-w-6xl mx-auto">
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="w-8 h-8 animate-spin text-primary" />
						</div>
					) : (
						<div className="grid md:grid-cols-3 gap-6">
							{plans?.map((plan) => {
								const price = getPlanPrice(plan.id);
								const annualTotal = getPlanAnnualTotal(plan.id);
								const equivalentMonthly = getEquivalentMonthly(plan.id);
								const planFeatures = getPlanFeatures(plan.id);
								const planLimit = getPlanLimit(plan.id);
								const symbol = getCurrencySymbol(currency);

								return (
									<Card
										key={plan.id}
										className={`p-6 relative ${
											plan.is_recommended
												? "border-primary border-2 shadow-lg"
												: ""
										}`}
									>
										{plan.is_recommended && (
											<Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
												Most Popular
											</Badge>
										)}

										<div className="mb-6">
											<h3 className="text-xl font-semibold mb-1">
												{plan.name}
											</h3>
											<p className="text-sm text-muted-foreground">
												{plan.description}
											</p>
										</div>

										<div className="mb-6">
											<div className="flex items-baseline gap-1">
												<span className="text-3xl font-bold">
													{symbol}
													{formatAmount(price)}
												</span>
												<span className="text-muted-foreground">/month</span>
											</div>
											{isAnnual && (
												<div className="text-sm text-muted-foreground mt-1 space-y-0.5">
													<p>
														{symbol}
														{formatAmount(annualTotal)} billed annually
													</p>
													<p>
														Equivalent monthly: {symbol}
														{formatAmount(equivalentMonthly)}
													</p>
												</div>
											)}
										</div>

										{/* Limits Summary */}
										{planLimit && (
											<div className="mb-6 p-3 bg-muted/50 rounded-lg text-sm space-y-1">
												<p>
													<span className="font-medium">
														{planLimit.max_locations}
													</span>{" "}
													{planLimit.max_locations === 1
														? "location"
														: "locations"}
												</p>
												<p>
													<span className="font-medium">
														{planLimit.max_staff === 1
															? "Owner only"
															: `Up to ${planLimit.max_staff} staff`}
													</span>
												</p>
												<p>
													<span className="font-medium">
														{planLimit.monthly_messages}
													</span>{" "}
													messages/month
												</p>
											</div>
										)}

										{/* Features */}
										<ul className="space-y-3 mb-6">
											{planFeatures.map((feature) => (
												<li
													key={feature.id}
													className="flex items-start gap-2 text-sm"
												>
													<Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
													<span>{feature.feature_text}</span>
												</li>
											))}
										</ul>

										{isWaitlistMode ? (
											<Link to="/#waitlist">
												<Button
													variant={plan.is_recommended ? "default" : "outline"}
													className="w-full"
												>
													<Sparkles className="w-4 h-4 mr-2" />
													Join waitlist
												</Button>
											</Link>
										) : (
											<Link to="/signup">
												<Button
													variant={plan.is_recommended ? "default" : "outline"}
													className="w-full"
												>
													Start free trial
												</Button>
											</Link>
										)}
									</Card>
								);
							})}
						</div>
					)}
				</div>
			</section>

			{/* FAQ Section */}
			<section className="py-16 bg-surface px-4">
				<div className="max-w-3xl mx-auto">
					<h2 className="text-2xl font-semibold text-center mb-8">
						Frequently asked questions
					</h2>
					<div className="space-y-6">
						{faqs.map((faq) => (
							<div key={faq.q}>
								<h3 className="font-medium mb-2">{faq.q}</h3>
								<p className="text-muted-foreground">{faq.a}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="border-t py-8 px-4">
				<div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
					<SalonMagikLogo size="sm" />
					<div className="flex items-center gap-6 text-sm text-muted-foreground">
						<Link
							to="/support"
							className="hover:text-foreground transition-colors"
						>
							Support
						</Link>
						<Link
							to="/terms"
							className="hover:text-foreground transition-colors"
						>
							Terms
						</Link>
						<Link
							to="/privacy"
							className="hover:text-foreground transition-colors"
						>
							Privacy
						</Link>
					</div>
					<p className="text-sm text-muted-foreground">
						© {new Date().getFullYear()} Salon Magik
					</p>
				</div>
			</footer>
		</div>
	);
}
