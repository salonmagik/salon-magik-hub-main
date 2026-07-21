import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@shared/utils";
import { MarketingLayout } from "@/components/MarketingLayout";

const FAQ_CATEGORIES = [
  {
    category: "Getting started",
    items: [
      { q: "Do I need a card to start?", a: "No. Every plan starts with a 14-day free trial and no card is required to begin." },
      { q: "How long does setup take?", a: "Most salons are fully set up in under 10 minutes. Onboarding walks you through adding your services, hours, and first team member." },
      { q: "Can my clients book without downloading an app?", a: "Yes. Clients book through your own link — no app download and no account required on their end." },
      { q: "Do you support multiple languages?", a: "The platform currently runs in English. More language support is on our roadmap." },
    ],
  },
  {
    category: "Plans & billing",
    items: [
      { q: "Can I move between plans as my team grows?", a: "Yes, you can upgrade or downgrade at any time from your settings. Your data, clients and history move with you." },
      { q: "What happens when my trial ends?", a: "You'll be asked to choose a plan. If you don't, your account goes into read-only mode — nothing is deleted. You can reactivate any time." },
      { q: "Is there a discount for annual billing?", a: "Yes. Annual plans save you up to 8% compared to monthly billing, depending on your plan." },
      { q: "Can I get a refund?", a: "Yes. If you're not satisfied within the first 30 days of a paid plan, contact support for a full refund." },
    ],
  },
  {
    category: "Payments & money",
    items: [
      { q: "Do you support mobile money and cards?", a: "Yes, both are supported at checkout, and you can track the split between them from your payments dashboard." },
      { q: "What currencies do you support?", a: "We support GHS (Ghana cedis), NGN (Nigerian naira) and USD. Pricing is shown in your local currency." },
      { q: "Do you take a cut of my sales?", a: "No. Salon Magik doesn't take a percentage of your revenue. You pay a flat monthly or annual fee only." },
    ],
  },
  {
    category: "Features",
    items: [
      { q: "Is WhatsApp messaging supported?", a: "Not yet — it's on our roadmap. Today, messaging runs through SMS and email broadcasts, plus automatic birthday and reactivation messages." },
      { q: "Can I manage multiple locations?", a: "Yes. The Chain plan supports multiple branches with a unified dashboard, shared client records, and per-location reporting." },
      { q: "Does Salon Magik have a mobile app?", a: "The web app is fully responsive and works great on mobile. A dedicated native app is on our roadmap." },
      { q: "Can I customise my booking page?", a: "Yes — you can set your brand colour, upload a banner image, add a short bio, and toggle availability. More customisation options are coming." },
      { q: "Can clients pay online when booking?", a: "Yes. You can enable online payments so clients pay in full or leave a deposit at the time of booking." },
    ],
  },
  {
    category: "Team & staff",
    items: [
      { q: "How do staff members log in?", a: "Staff receive an invitation email. They create their own password and can only access what their role allows." },
      { q: "Can I control what each staff member sees?", a: "Yes. Studio and Chain plans include role-based permissions, so you control access to reports, transactions, and settings." },
      { q: "What happens if a staff member leaves?", a: "You can deactivate their account instantly. Their appointment history is preserved — nothing is lost." },
    ],
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-brand-ink/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-[20px] text-left text-[16px] font-medium text-brand-ink"
      >
        {q}
        <span className={cn("ml-5 flex-shrink-0 text-[20px] text-brand-purple transition-transform duration-200", open && "rotate-45")}>
          +
        </span>
      </button>
      <div className={cn("overflow-hidden transition-all duration-200", open ? "max-h-48 pb-5" : "max-h-0")}>
        <p className="max-w-[640px] text-[14.5px] leading-[1.7] text-brand-ink/62">{a}</p>
      </div>
    </div>
  );
}

export default function FAQPage() {
  return (
    <MarketingLayout>
      <section className="px-8 py-16">
        <div className="mx-auto max-w-[760px]">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-[14px] text-brand-ink/50 transition-colors hover:text-brand-ink">
            ← Back to home
          </Link>

          <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
            <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
            FAQ
          </div>
          <h1 className="font-serif text-[clamp(32px,4vw,44px)] font-medium leading-[1.12] tracking-[-0.4px] text-brand-ink">
            Questions, answered.
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-brand-ink/55">
            Can't find what you're looking for?{" "}
            <a href="mailto:support@salonmagik.com" className="text-brand-purple hover:underline">
              Email us
            </a>{" "}
            and we'll get back to you within 24 hours.
          </p>

          <div className="mt-14 space-y-12">
            {FAQ_CATEGORIES.map(({ category, items }) => (
              <div key={category}>
                <h2 className="mb-2 font-serif text-[20px] font-medium text-brand-ink">{category}</h2>
                <div>
                  {items.map((item) => <FAQItem key={item.q} {...item} />)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 rounded-[18px] bg-brand-lilac-bg px-8 py-8 text-center">
            <p className="font-serif text-[20px] font-medium text-brand-ink">Still stuck?</p>
            <p className="mt-2 text-[14.5px] text-brand-ink/55">Our support team is available Monday – Friday, 9am – 6pm WAT.</p>
            <a
              href="mailto:support@salonmagik.com"
              className="mt-5 inline-block rounded-full bg-brand-purple px-7 py-[13px] text-[15px] font-medium text-white transition-colors hover:bg-brand-purple-deep"
            >
              Contact support
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
