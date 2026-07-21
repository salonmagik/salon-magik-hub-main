import { Link } from "react-router-dom";
import { MarketingLayout } from "@/components/MarketingLayout";

const markets = [
  {
    id: "solo",
    emoji: "✂️",
    label: "Solo stylist or freelancer",
    headline: "Run your whole book from your phone.",
    blurb:
      "You're the receptionist, the stylist, and the accountant. Salon Magik handles the scheduling and reminders so you can focus on the work, not the admin.",
    problems: [
      "Clients book over WhatsApp, calls get missed, dates get confused",
      "No easy way to send a reminder before a no-show",
      "Tracking what you earned last week means scrolling through chat history",
    ],
    features: [
      "Personal booking link — clients self-book without calling you",
      "Automatic appointment reminders (SMS + email) so no-shows drop",
      "Daily revenue summary so you always know where your money is",
      "Client notes so you remember every preference",
    ],
  },
  {
    id: "small",
    emoji: "💇🏾‍♀️",
    label: "Small salon (2–6 staff)",
    headline: "Give each stylist their own calendar without the chaos.",
    blurb:
      "Managing a team means managing schedules, commissions, and client handoffs. Salon Magik keeps every chair visible and every payment tracked in one place.",
    problems: [
      "Double-bookings happen because schedules live in separate notebooks",
      "Clients don't know which stylist to book — or who's available",
      "End-of-month commissions take hours to calculate manually",
    ],
    features: [
      "Per-stylist calendars with a unified view for the owner",
      "Online booking that shows live availability per team member",
      "Commission tracking built into every appointment",
      "Role-based access so staff see only what they need",
    ],
  },
  {
    id: "chain",
    emoji: "🏢",
    label: "Multi-location chain",
    headline: "One dashboard across every branch.",
    blurb:
      "When you're running more than one location, visibility is everything. Salon Magik gives you a consolidated view of revenue, staff, and clients without switching between apps.",
    problems: [
      "No way to compare performance across branches without a spreadsheet",
      "Client records are stuck at one location — can't follow the client",
      "Each branch manager is doing their own thing with different tools",
    ],
    features: [
      "Multi-branch dashboard with per-location revenue and bookings",
      "Shared client records that follow clients across locations",
      "Chain-level staff management with per-branch reporting",
      "Consolidated payments and payout tracking",
    ],
  },
  {
    id: "studio",
    emoji: "💅🏾",
    label: "Nail, lash & brow studios",
    headline: "Precision services need a precise booking system.",
    blurb:
      "Your services are detailed and your clients are regulars. Salon Magik makes rebooking easy and keeps your client history clean so you always know what they had last time.",
    problems: [
      "Clients forget what shape or colour they had last visit",
      "Managing long service times means gaps or overlapping bookings",
      "No easy way to upsell add-ons at the point of booking",
    ],
    features: [
      "Service catalog with duration controls for long appointments",
      "Client notes and visit history per client",
      "Add-on services that attach to bookings at checkout",
      "Reactivation messages for clients who haven't been back",
    ],
  },
];

export default function ForSalonsPage() {
  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="bg-brand-purple px-8 py-20">
        <div className="mx-auto max-w-[760px] text-center">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-[14px] text-white/50 transition-colors hover:text-white">
            ← Back to home
          </Link>
          <div className="mb-5 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-yellow">
            <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
            Who it's for
          </div>
          <h1 className="font-serif text-[clamp(32px,4.5vw,50px)] font-medium leading-[1.1] tracking-[-0.4px] text-white">
            Built for every type of beauty business.
          </h1>
          <p className="mt-5 text-[18px] leading-relaxed text-brand-lilac">
            Whether you're a solo stylist or running multiple branches, Salon Magik adapts to how you work.
          </p>
        </div>
      </section>

      {/* Market sections */}
      <section className="bg-brand-cream px-8 py-[80px]">
        <div className="mx-auto max-w-[1040px] space-y-[72px]">
          {markets.map((m, i) => (
            <div
              key={m.id}
              className={`grid items-start gap-10 md:grid-cols-2 ${i % 2 === 1 ? "md:[direction:rtl] [&>*]:[direction:ltr]" : ""}`}
            >
              {/* Copy side */}
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[32px]">{m.emoji}</span>
                  <span className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">{m.label}</span>
                </div>
                <h2 className="font-serif text-[clamp(22px,2.5vw,30px)] font-medium leading-[1.2] tracking-[-0.3px] text-brand-ink">
                  {m.headline}
                </h2>
                <p className="mt-4 text-[15.5px] leading-relaxed text-brand-ink/60">{m.blurb}</p>
              </div>

              {/* Problems + Features side */}
              <div className="space-y-5">
                <div className="rounded-[18px] border border-red-100 bg-red-50/60 p-5">
                  <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-red-600/70">The problem</div>
                  <ul className="space-y-2">
                    {m.problems.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-[14px] text-brand-ink/70">
                        <span className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[18px] border border-green-100 bg-green-50/60 p-5">
                  <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-green-700/70">How Salon Magik helps</div>
                  <ul className="space-y-2">
                    {m.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[14px] text-brand-ink/70">
                        <span className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-yellow" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-purple-deep px-8 py-[80px] text-center">
        <h2 className="font-serif text-[clamp(26px,3.5vw,38px)] font-medium leading-[1.15] tracking-[-0.3px] text-white">
          Ready to run your business with less chaos?
        </h2>
        <p className="mt-4 text-[16px] text-brand-lilac">No card needed. Up and running in under 10 minutes.</p>
        <a
          href={`${salonAppUrl}/signup`}
          className="mt-8 inline-block rounded-full bg-brand-yellow px-8 py-[15px] text-[15.5px] font-medium text-brand-purple-deep transition-transform hover:-translate-y-0.5"
        >
          Start free
        </a>
      </section>
    </MarketingLayout>
  );
}
