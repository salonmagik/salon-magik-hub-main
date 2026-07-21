import { useEffect, useState, Fragment } from "react";
import { Link } from "react-router-dom";
import { usePlans, usePlanFeatures, usePlanLimits } from "@/hooks/usePlans";
import { usePlanPricing, getCurrencySymbol } from "@/hooks/usePlanPricing";
import { useWaitlistMode } from "@/hooks/useFeatureFlags";
import { SalonMagikLogo } from "@/components/SalonMagikLogo";
import { cn } from "@shared/utils";

const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD ($)" },
  { code: "NGN", label: "NGN (₦)" },
  { code: "GHS", label: "GHS (₵)" },
];
const PRICING_CURRENCY_STORAGE_KEY = "pricing_currency_preference";

const defaultSalonAppUrl =
  typeof import.meta !== "undefined" && import.meta.env?.DEV
    ? "http://localhost:8080"
    : "https://app.salonmagik.com";
const salonAppUrl = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SALON_APP_URL) ||
  defaultSalonAppUrl
).replace(/\/$/, "");

const faqs = [
  {
    q: "Is there a free trial?",
    a: (trialDays: number) =>
      `Yes! All plans include a ${trialDays}-day free trial. No credit card required to start.`,
  },
  {
    q: "Can I change plans later?",
    a: () => "Absolutely. Upgrade or downgrade anytime. Changes take effect on your next billing cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: () =>
      "We accept all major credit cards. In Nigeria and Ghana we also support Paystack for local cards and bank transfers.",
  },
  {
    q: "What are communication credits?",
    a: () =>
      "Credits are used for SMS and WhatsApp notifications to your clients. Each plan includes a monthly allocation, and you can purchase more if needed.",
  },
  {
    q: "Do you offer refunds?",
    a: () => "Yes. If you're not satisfied within the first 30 days, contact support for a full refund.",
  },
];

function Check() {
  return (
    <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-brand-purple text-[10px] text-brand-yellow">
      ✓
    </span>
  );
}

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { isWaitlistMode } = useWaitlistMode();

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: features } = usePlanFeatures();
  const { data: limits } = usePlanLimits();
  const { data: pricing, isLoading: pricingLoading } = usePlanPricing(currency);

  const isLoading = plansLoading || pricingLoading;
  const trialDays =
    plans?.find((p) => p.is_recommended)?.trial_days ?? plans?.[0]?.trial_days ?? 14;

  const getPlanPrice = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row) return null;
    if (isAnnual && row.annual_price > 0) return row.effective_monthly;
    return row.monthly_price;
  };

  const getPlanAnnualTotal = (planId: string) =>
    pricing?.find((p) => p.plan_id === planId)?.annual_price ?? 0;

  const getSavingsPct = (planId: string) => {
    const row = pricing?.find((p) => p.plan_id === planId);
    if (!row || !row.annual_price || !row.monthly_price) return null;
    const saving = ((row.monthly_price - row.annual_price / 12) / row.monthly_price) * 100;
    return saving > 0 ? Math.round(saving) : null;
  };

  const getPlanFeatures = (planId: string) =>
    (features ?? []).filter((f) => f.plan_id === planId).sort((a, b) => a.sort_order - b.sort_order);

  const getPlanLimit = (planId: string) =>
    limits?.find((l) => l.plan_id === planId);

  const formatAmount = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(Number(value))) return "0";
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

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
        if (isMounted) setCurrency("USD");
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const symbol = getCurrencySymbol(currency);

  return (
    <div className="min-h-screen bg-brand-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-brand-cream">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-[18px]">
          <Link to="/">
            <SalonMagikLogo size="md" />
          </Link>
          <div className="hidden items-center gap-9 md:flex">
            <Link to="/pricing" className="text-[15px] font-medium text-brand-ink">Pricing</Link>
            <Link to="/support" className="text-[15px] text-brand-ink/70 transition-colors hover:text-brand-ink">Support</Link>
          </div>
          <div className="flex items-center gap-5">
            {!isWaitlistMode && (
              <>
                <a
                  href={`${salonAppUrl}/login`}
                  className="hidden text-[15px] text-brand-ink transition-colors hover:text-brand-purple md:block"
                >
                  Log in
                </a>
                <a
                  href={`${salonAppUrl}/signup`}
                  className="rounded-full bg-brand-ink px-[22px] py-[11px] text-[14.5px] text-white transition-colors hover:bg-brand-purple"
                >
                  Start free
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 pb-0 pt-16 text-center">
        <div className="mx-auto max-w-[600px]">
          <div className="mb-4 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
            <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
            Pricing
          </div>
          <h1 className="font-serif text-[clamp(32px,4vw,48px)] font-medium leading-[1.12] tracking-[-0.4px] text-brand-ink">
            Simple, transparent pricing.
          </h1>
          <p className="mx-auto mt-4 max-w-[440px] text-[17px] leading-relaxed text-brand-ink/55">
            All plans include a {trialDays}-day free trial. No credit card required to start.
          </p>
        </div>

        {/* Toggles */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {/* Currency */}
          <div className="flex rounded-full border border-brand-ink/12 bg-white p-1">
            {SUPPORTED_CURRENCIES.map((c) => (
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
            ))}
          </div>

          {/* Billing */}
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
                {annual ? "Annual" : "Monthly"}
                {annual && (
                  <span className="ml-1.5 inline-block rounded-full bg-brand-yellow/20 px-[7px] py-[1px] text-[11px] text-brand-purple-deep">
                    save up to {getSavingsPct(plans?.[1]?.id ?? "") ?? "—"}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="px-8 pb-[80px] pt-[48px]">
        <div className="mx-auto max-w-[1180px]">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-[22px] md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[500px] animate-pulse rounded-[20px] bg-white/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-[22px] md:grid-cols-3">
              {(plans ?? []).map((plan) => {
                const price = getPlanPrice(plan.id);
                const annualTotal = getPlanAnnualTotal(plan.id);
                const planFeatures = getPlanFeatures(plan.id);
                const planLimit = getPlanLimit(plan.id);
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
                        Most popular
                      </span>
                    )}

                    <div className="font-serif text-[22px] text-brand-ink">{plan.name}</div>
                    <div className="mt-1.5 text-[13.5px] text-brand-ink/50">{plan.description}</div>

                    <div className="mt-5">
                      {price != null ? (
                        <>
                          <div className="font-serif text-[40px] leading-none text-brand-ink">
                            {symbol}{formatAmount(price)}
                            <span className="font-sans text-[14px] text-brand-ink/50"> / mo</span>
                          </div>
                          {isAnnual && annualTotal > 0 ? (
                            <div className="mt-1 text-[12.5px] text-brand-ink/45">
                              {symbol}{formatAmount(annualTotal)} billed annually
                            </div>
                          ) : (
                            <div className="mt-1 text-[12.5px] text-brand-ink/45">
                              {isAnnual ? "—" : `Save up to ${getSavingsPct(plan.id) ?? "—"}% annually`}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="font-serif text-[32px] leading-none text-brand-ink">Custom</div>
                      )}
                    </div>

                    {/* Limits */}
                    {planLimit && (
                      <div className="mt-5 rounded-[10px] bg-brand-lilac-bg px-4 py-3 text-[13px] text-brand-ink/70">
                        <div>{planLimit.max_locations === 1 ? "1 location" : `${planLimit.max_locations} locations`}</div>
                        <div className="mt-1">
                          {planLimit.max_staff === 1 ? "Owner only" : `Up to ${planLimit.max_staff} staff`}
                        </div>
                        <div className="mt-1">{planLimit.monthly_messages} messages / month</div>
                      </div>
                    )}

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
                        href="mailto:hello@salonmagik.com"
                        className="block w-full rounded-full border-[1.5px] border-brand-purple py-[13px] text-center text-[14.5px] font-medium text-brand-purple transition-colors hover:bg-brand-lilac-bg"
                      >
                        Talk to us
                      </a>
                    ) : isWaitlistMode ? (
                      <Link
                        to="/#waitlist"
                        className={cn(
                          "block w-full rounded-full py-[13px] text-center text-[14.5px] font-medium transition-colors",
                          plan.is_recommended
                            ? "bg-brand-ink text-white hover:bg-brand-purple"
                            : "border-[1.5px] border-brand-purple text-brand-purple hover:bg-brand-lilac-bg",
                        )}
                      >
                        Join waitlist
                      </Link>
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
                        Start free trial
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </section>

      {/* Comparison table */}
      <section className="bg-brand-cream-dim px-8 py-[80px]">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-12 text-center">
            <div className="mb-3 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
              <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
              Compare plans
            </div>
            <h2 className="font-serif text-[clamp(24px,3vw,34px)] font-medium tracking-[-0.3px] text-brand-ink">
              What's included in each plan
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th className="w-[42%] pb-6 text-left text-[13px] font-medium uppercase tracking-[0.06em] text-brand-ink/40">
                    Feature
                  </th>
                  {(plans ?? []).map((plan) => (
                    <th
                      key={plan.id}
                      className={cn(
                        "pb-6 text-center text-[14px] font-medium",
                        plan.is_recommended ? "text-brand-purple" : "text-brand-ink",
                      )}
                    >
                      {plan.name}
                      {plan.is_recommended && (
                        <span className="ml-2 inline-block rounded-full bg-brand-purple/10 px-2 py-0.5 text-[11px] text-brand-purple">
                          Popular
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-ink/[0.06]">
                {/* Capacity rows from DB limits */}
                {!isLoading && (
                  <>
                    <tr className="bg-brand-ink/[0.02]">
                      <td colSpan={4} className="px-0 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">
                        Capacity
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 text-[14.5px] text-brand-ink/75">Locations</td>
                      {(plans ?? []).map((plan) => {
                        const lim = getPlanLimit(plan.id);
                        return (
                          <td key={plan.id} className="py-4 text-center text-[14.5px] text-brand-ink">
                            {lim ? (lim.max_locations > 1 ? `Up to ${lim.max_locations}` : "1") : "—"}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="py-4 text-[14.5px] text-brand-ink/75">Staff accounts</td>
                      {(plans ?? []).map((plan) => {
                        const lim = getPlanLimit(plan.id);
                        return (
                          <td key={plan.id} className="py-4 text-center text-[14.5px] text-brand-ink">
                            {lim
                              ? lim.max_staff === 1
                                ? "Owner only"
                                : lim.max_staff >= 999
                                  ? "Unlimited"
                                  : `Up to ${lim.max_staff}`
                              : "—"}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="py-4 text-[14.5px] text-brand-ink/75">Messages / month</td>
                      {(plans ?? []).map((plan) => {
                        const lim = getPlanLimit(plan.id);
                        return (
                          <td key={plan.id} className="py-4 text-center text-[14.5px] text-brand-ink">
                            {lim ? lim.monthly_messages.toLocaleString() : "—"}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Feature category rows */}
                    {[
                      {
                        category: "Bookings",
                        rows: [
                          { label: "Online booking page", solo: true, studio: true, chain: true },
                          { label: "Client reminders (SMS)", solo: true, studio: true, chain: true },
                          { label: "Appointment management", solo: true, studio: true, chain: true },
                          { label: "Package & voucher sales", solo: true, studio: true, chain: true },
                          { label: "Recurring bookings", solo: false, studio: true, chain: true },
                        ],
                      },
                      {
                        category: "Business",
                        rows: [
                          { label: "Services & products catalog", solo: true, studio: true, chain: true },
                          { label: "Payment tracking", solo: true, studio: true, chain: true },
                          { label: "Sales reports", solo: true, studio: true, chain: true },
                          { label: "Staff performance reports", solo: false, studio: true, chain: true },
                          { label: "Multi-location dashboard", solo: false, studio: false, chain: true },
                        ],
                      },
                      {
                        category: "Team",
                        rows: [
                          { label: "Staff role management", solo: false, studio: true, chain: true },
                          { label: "Permission controls", solo: false, studio: true, chain: true },
                        ],
                      },
                      {
                        category: "Support",
                        rows: [
                          { label: "Email & chat support", solo: true, studio: true, chain: true },
                          { label: "Priority support", solo: false, studio: false, chain: true },
                          { label: "Dedicated onboarding", solo: false, studio: false, chain: true },
                        ],
                      },
                    ].map(({ category, rows }) => {
                      const planSlugs = (plans ?? []).map((p) => p.slug);
                      return (
                        <Fragment key={category}>
                          <tr className="bg-brand-ink/[0.02]">
                            <td colSpan={4} className="px-0 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">
                              {category}
                            </td>
                          </tr>
                          {rows.map((row) => (
                            <tr key={row.label}>
                              <td className="py-4 text-[14.5px] text-brand-ink/75">{row.label}</td>
                              {planSlugs.map((slug) => {
                                const val = slug === "solo" ? row.solo : slug === "studio" ? row.studio : row.chain;
                                return (
                                  <td key={slug} className="py-4 text-center">
                                    {val ? (
                                      <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-purple text-[11px] text-brand-yellow">✓</span>
                                    ) : (
                                      <span className="text-[20px] text-brand-ink/20">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="px-8 py-[80px]">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-10">
            <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
              <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
              Add-ons
            </div>
            <h2 className="font-serif text-[clamp(24px,3vw,34px)] font-medium tracking-[-0.3px] text-brand-ink">
              Extend your plan
            </h2>
            <p className="mt-2 text-[16px] text-brand-ink/55">
              Optional extras you can add to any plan, or unlock as your business grows.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {[
              {
                name: "Extra communication credits",
                desc: "Top up your SMS and notification credits when your monthly allocation runs low.",
                price: "Starting from ₵5 / bundle",
                available: true,
              },
              {
                name: "Location check-in for staff",
                desc: "Confirms a stylist is on-site before their shift starts. Requires GPS on staff devices.",
                available: false,
              },
              {
                name: "WhatsApp messaging",
                desc: "Send booking confirmations, reminders, and updates directly via WhatsApp.",
                available: false,
              },
              {
                name: "Custom booking domain",
                desc: "Use your own domain for your client-facing booking page (e.g., book.yoursalon.com).",
                available: false,
              },
            ].map((addon) => (
              <div
                key={addon.name}
                className={cn(
                  "rounded-[18px] border p-6",
                  addon.available
                    ? "border-brand-ink/8 bg-white"
                    : "border-dashed border-brand-ink/10 bg-brand-cream-dim",
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="font-serif text-[18px] font-medium text-brand-ink">{addon.name}</div>
                  {addon.available ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11.5px] font-medium text-emerald-700">
                      Available
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-brand-yellow/20 px-3 py-1 text-[11.5px] font-medium text-brand-purple">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-brand-ink/55">{addon.desc}</p>
                {addon.price && (
                  <p className="mt-3 text-[13.5px] font-medium text-brand-purple">{addon.price}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      {/* <section className="bg-brand-cream-dim px-8 py-[80px]">
        <div className="mx-auto max-w-[720px]">
          <h2 className="mb-10 font-serif text-[clamp(24px,3vw,32px)] font-medium text-brand-ink">
            Common questions
          </h2>
          <div className="divide-y divide-brand-ink/8">
            {faqs.map((faq, i) => (
              <div key={faq.q} className="py-5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left text-[16px] font-medium text-brand-ink"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {faq.q}
                  <span
                    className={cn(
                      "ml-4 flex-shrink-0 text-[20px] text-brand-purple transition-transform duration-200",
                      openFaq === i ? "rotate-45" : "",
                    )}
                  >
                    +
                  </span>
                </button>
                <div
                  className={cn(
                    "overflow-hidden text-[15px] leading-relaxed text-brand-ink/60 transition-all duration-200",
                    openFaq === i ? "mt-3 max-h-40" : "max-h-0",
                  )}
                >
                  {faq.a(trialDays)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* Footer */}
      <footer className="bg-brand-cream-dim px-8 py-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <span className="font-serif text-[18px] font-semibold text-brand-ink">Salon Magik</span>
          <div className="flex gap-6 text-[14px] text-brand-ink/60">
            <Link to="/support" className="transition-colors hover:text-brand-ink">Support</Link>
            <Link to="/terms" className="transition-colors hover:text-brand-ink">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-brand-ink">Privacy</Link>
          </div>
          <p className="text-[13px] text-brand-ink/40">© {new Date().getFullYear()} Salon Magik</p>
        </div>
      </footer>
    </div>
  );
}
