import { MarketingLayout } from "@/components/MarketingLayout";
import { Scissors, Users, Building2, Gem, MapPin, PenLine, type LucideIcon } from "lucide-react";

type CardColor = "white" | "dark" | "gold";

const MARKETS: {
  id: string;
  icon: LucideIcon;
  color: CardColor;
  label: string;
  headline: string;
  tags: string[];
}[] = [
  {
    id: "solo",
    icon: Scissors,
    color: "white",
    label: "Solo stylist",
    headline: "You are the business. Salon Magik is your back office.",
    tags: ["Self-booking link", "Auto reminders", "Revenue tracking"],
  },
  {
    id: "small",
    icon: Users,
    color: "dark",
    label: "Small salon (2–6 staff)",
    headline: "Full team, full visibility. Every chair on one calendar.",
    tags: ["Team calendars", "Revenue reports", "Role access"],
  },
  {
    id: "chain",
    icon: Building2,
    color: "gold",
    label: "Multi-location chain",
    headline: "You shouldn't need a spreadsheet to know how your business is doing.",
    tags: ["Multi-branch view", "Shared client records", "Per-location reports"],
  },
  {
    id: "studio",
    icon: Gem,
    color: "white",
    label: "Nail, lash & brow studio",
    headline: "Clients come back because you remember everything. Now it's automatic.",
    tags: ["Client notes", "Visit history", "Reactivation messages"],
  },
  {
    id: "freelance",
    icon: MapPin,
    color: "dark",
    label: "Freelance & mobile stylist",
    headline: "Work from home, rent a chair, go mobile. Your booking link travels with you!",
    tags: ["Personal booking link", "Anywhere access", "Client history"],
  },
  {
    id: "tattoo",
    icon: PenLine,
    color: "gold",
    label: "Tattoo & piercing studio",
    headline: "Long sessions, custom work, big deposits. Handle the art, we'll handle the calendar.",
    tags: ["Deposit collection", "Duration blocking", "Client reference notes"],
  },
];

const COLOR_STYLES: Record<CardColor, {
  card: string;
  label: string;
  headline: string;
  tag: string;
  iconBg: string;
  iconColor: string;
}> = {
  white: {
    card: "bg-brand-cream border border-brand-ink/8",
    label: "text-brand-purple",
    headline: "text-brand-ink",
    tag: "bg-white/80 text-brand-ink",
    iconBg: "bg-brand-purple/8",
    iconColor: "text-brand-purple",
  },
  dark: {
    card: "bg-brand-ink",
    label: "text-brand-yellow",
    headline: "text-white",
    tag: "bg-white/15 text-white",
    iconBg: "bg-white/10",
    iconColor: "text-white",
  },
  gold: {
    card: "bg-brand-yellow",
    label: "text-brand-purple-deep/70",
    headline: "text-brand-purple-deep",
    tag: "bg-black/10 text-brand-purple-deep",
    iconBg: "bg-brand-purple-deep/8",
    iconColor: "text-brand-purple-deep",
  },
};

export default function WhosItForPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="px-8 py-16 text-center">
        <h1 className="mx-auto max-w-[700px] font-serif text-[clamp(32px,4.5vw,50px)] font-medium leading-[1.1] tracking-[-0.4px] text-brand-ink">
          Built for every type of beauty business.
        </h1>
        <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-relaxed text-brand-ink/55">
          Whether you're a solo stylist or running multiple branches, Salon
          Magik adapts to how you work.
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
                  <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-[11px] ${s.iconBg}`}>
                    <m.icon className={`h-5 w-5 ${s.iconColor}`} strokeWidth={1.6} />
                  </div>
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
    </MarketingLayout>
  );
}
