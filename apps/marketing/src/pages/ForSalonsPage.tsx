import { Link } from "react-router-dom";
import { MarketingLayout } from "@/components/MarketingLayout";

const MARKETS = [
  {
    id: "solo",
    emoji: "✂️",
    color: "white" as const,
    label: "Solo stylist",
    headline: "You are the business. Salon Magik is your back office.",
    tags: ["Self-booking link", "Auto reminders", "Revenue tracking"],
  },
  {
    id: "small",
    emoji: "💇🏾‍♀️",
    color: "dark" as const,
    label: "Small salon (2–6 staff)",
    headline: "Full team, full visibility. Every chair on one calendar.",
    tags: ["Team calendars", "Commission tracking", "Role access"],
  },
  {
    id: "chain",
    emoji: "🏢",
    color: "gold" as const,
    label: "Multi-location chain",
    headline: "You shouldn't need a spreadsheet to know how your business is doing.",
    tags: ["Multi-branch view", "Shared client records", "Per-location reports"],
  },
  {
    id: "studio",
    emoji: "💅🏾",
    color: "white" as const,
    label: "Nail, lash & brow studio",
    headline: "Clients come back because you remember everything. Now it's automatic.",
    tags: ["Client notes", "Visit history", "Reactivation messages"],
  },
  {
    id: "freelance",
    emoji: "🤸🏾",
    color: "dark" as const,
    label: "Freelance & mobile stylist",
    headline: "Work from home, rent a chair, go mobile — your booking link travels with you.",
    tags: ["Personal booking link", "Anywhere access", "Client history"],
  },
  {
    id: "tattoo",
    emoji: "🎨",
    color: "gold" as const,
    label: "Tattoo & piercing studio",
    headline: "Long sessions, custom work, big deposits. Handle the art — we'll handle the calendar.",
    tags: ["Deposit collection", "Duration blocking", "Client reference notes"],
  },
];

const COLOR_STYLES = {
  white: {
    card: "bg-brand-cream border border-brand-ink/8",
    label: "text-brand-purple",
    headline: "text-brand-ink",
    tag: "bg-white/80 text-brand-ink",
  },
  dark: {
    card: "bg-brand-ink",
    label: "text-brand-yellow",
    headline: "text-white",
    tag: "bg-white/15 text-white",
  },
  gold: {
    card: "bg-brand-yellow",
    label: "text-brand-purple-deep/70",
    headline: "text-brand-purple-deep",
    tag: "bg-black/10 text-brand-purple-deep",
  },
};

export default function ForSalonsPage() {
  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="bg-brand-purple px-8 pb-16 pt-20 text-center">
        <div className="mb-5 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-yellow">
          <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
          Who it's for
        </div>
        <h1 className="mx-auto max-w-[700px] font-serif text-[clamp(32px,4.5vw,50px)] font-medium leading-[1.1] tracking-[-0.4px] text-white">
          Built for every type of beauty business.
        </h1>
        <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-relaxed text-brand-lilac">
          Whether you're a solo stylist or running multiple branches, Salon Magik adapts to how you work.
        </p>
      </section>

      {/* Market cards */}
      <section className="bg-brand-cream px-8 py-[72px]">
        <div className="mx-auto max-w-[1080px]">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MARKETS.map((m) => {
              const s = COLOR_STYLES[m.color];
              return (
                <div
                  key={m.id}
                  className={`flex flex-col rounded-[22px] p-7 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ${s.card}`}
                >
                  <div className="mb-4 text-[40px] leading-none">{m.emoji}</div>
                  <div className={`mb-2 text-[11.5px] font-medium uppercase tracking-[0.07em] ${s.label}`}>
                    {m.label}
                  </div>
                  <p className={`font-serif text-[18px] font-medium leading-[1.35] ${s.headline}`}>
                    {m.headline}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {m.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-[11px] py-[5px] text-[12px] font-medium ${s.tag}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-purple-deep px-8 py-[72px] text-center">
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
        <div className="mt-5">
          <Link to="/pricing" className="text-[14px] text-white/50 hover:text-white">
            See pricing →
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
