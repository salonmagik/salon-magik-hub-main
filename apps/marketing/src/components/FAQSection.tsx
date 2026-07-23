import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@shared/utils";

const faqs = [
  {
    q: "Do I need a card to start?",
    a: "No. Every plan starts with a 14-day free trial and no card is required to begin.",
  },
  {
    q: "Can my clients book without downloading an app?",
    a: "Yes. Clients book through your own link — no app download and no account required on their end.",
  },
  {
    q: "Can I move between plans as my team grows?",
    a: "Yes, you can upgrade or downgrade at any time from your settings. Your data, clients and history move with you.",
  },
  {
    q: "Do you support mobile money and cards?",
    a: "Yes, both are supported at checkout, and you can track the split between them from your payments dashboard.",
  },
  {
    q: "Is WhatsApp messaging supported?",
    a: "Not yet — it's on our roadmap. Today, messaging runs through SMS and email broadcasts, plus automatic birthday and reactivation messages.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-brand-cream-dim px-8 py-[100px]">
      <div className="mx-auto max-w-[760px]">
        <h2 className="mb-11 text-center font-serif text-[clamp(26px,3vw,34px)] font-medium tracking-[-0.3px] text-brand-ink">
          Questions, answered.
        </h2>

        <div>
          {faqs.map((faq, i) => (
            <div key={i} className="border-b border-brand-ink/10">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between py-[22px] text-left text-[16px] font-medium text-brand-ink"
              >
                {faq.q}
                <span
                  className={cn(
                    "ml-5 flex-shrink-0 text-[20px] text-brand-purple transition-transform duration-200",
                    open === i && "rotate-45",
                  )}
                >
                  +
                </span>
              </button>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  open === i ? "max-h-40 pb-5" : "max-h-0",
                )}
              >
                <p className="max-w-[620px] text-[14.5px] leading-[1.7] text-brand-ink/62">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/faq"
            className="inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-purple transition-colors hover:text-brand-purple-deep"
          >
            View more questions →
          </Link>
        </div>
      </div>
    </section>
  );
}
