import { cn } from "@shared/utils";

interface FeatureCard {
  emoji: string;
  title: string;
  tagline: string;
  color: "purple" | "yellow" | "dark" | "white";
}

const FEATURES: FeatureCard[] = [
  // Purple — features unique to Salon Magik
  { emoji: "🎂", title: "Birthday messages",       tagline: "Auto-sent the morning of, no effort needed",          color: "purple" },
  { emoji: "🔄", title: "Client reactivation",     tagline: "Automatic nudges to clients who've gone quiet",       color: "purple" },
  { emoji: "🏢", title: "Multi-branch",            tagline: "One dashboard for all your locations",                color: "purple" },
  { emoji: "🌐", title: "Custom domain",           tagline: "Your booking page on your own URL",                   color: "purple" },
  { emoji: "📱", title: "Client portal",           tagline: "Clients view their history and rebook themselves",    color: "purple" },
  { emoji: "✅", title: "Approval-gated bookings", tagline: "Review and confirm every request before it's set",    color: "purple" },
  { emoji: "📦", title: "Prepaid packages",        tagline: "Sell bundles of sessions — clients pay upfront",      color: "purple" },
  { emoji: "🏆", title: "Staff leaderboard",       tagline: "Top earner and per-stylist performance at a glance",  color: "purple" },

  // Yellow — standout capabilities
  { emoji: "🎟️", title: "Vouchers & gift cards",   tagline: "Sell, share, and redeem in-app",                     color: "yellow" },
  { emoji: "📣", title: "SMS broadcast",           tagline: "Send promos to your entire client list in one go",   color: "yellow" },
  { emoji: "💳", title: "Mobile money & cards",    tagline: "Flexible payments at checkout — MoMo, cards, cash",  color: "yellow" },
  { emoji: "💎", title: "VIP client tracking",     tagline: "Instantly spot your most loyal and highest-value clients", color: "yellow" },
  { emoji: "🎨", title: "Custom booking page",     tagline: "Your brand colours, banner image, and domain",       color: "yellow" },
  { emoji: "💬", title: "WhatsApp (coming soon)",  tagline: "Send messages on the channel clients already use",   color: "yellow" },

  // Dark — core business tools
  { emoji: "📊", title: "Revenue dashboard",       tagline: "Inflows, top services, and growth trends over time", color: "dark"   },
  { emoji: "🔐", title: "Role-based access",       tagline: "Control exactly what each staff member can see",     color: "dark"   },
  { emoji: "⚖️", title: "Outstanding balances",    tagline: "Track what clients owe and collect with one click",  color: "dark"   },
  { emoji: "🗂️", title: "Team calendars",          tagline: "All staff schedules side-by-side in one view",      color: "dark"   },

  // White — everyday essentials
  { emoji: "📅", title: "Online booking",          tagline: "Clients book 24 / 7 — no app download required",    color: "white"  },
  { emoji: "⏰", title: "Appointment reminders",   tagline: "Email and SMS before every visit, automatically",    color: "white"  },
  { emoji: "💰", title: "Deposit collection",      tagline: "Secure deposits at the time of booking",            color: "white"  },
  { emoji: "🛍️", title: "Products storefront",    tagline: "Sell retail products alongside your services",       color: "white"  },
  { emoji: "📋", title: "Daily digest",            tagline: "Morning email summary of every appointment ahead",  color: "white"  },
  { emoji: "📝", title: "Client notes",            tagline: "Preferences, allergies, and visit history saved",   color: "white"  },
  { emoji: "🖼️", title: "Booking page themes",    tagline: "Default or ecommerce layout — switch any time",     color: "white"  },
  { emoji: "💌", title: "Email campaigns",         tagline: "Send personalised messages to filtered client lists", color: "white" },
];

function Card({ emoji, title, tagline, color }: FeatureCard) {
  const bg = {
    purple: "bg-brand-purple text-white",
    yellow: "bg-brand-yellow text-brand-purple-deep",
    dark:   "bg-brand-ink text-white",
    white:  "bg-white text-brand-ink border border-brand-ink/8",
  }[color];

  const subtitleColor = {
    purple: "text-white/65",
    yellow: "text-brand-purple-deep/65",
    dark:   "text-white/55",
    white:  "text-brand-ink/55",
  }[color];

  return (
    <div
      className={cn("w-[230px] flex-shrink-0 rounded-[18px] p-5 shadow-[0_8px_28px_rgba(0,0,0,0.10)]", bg)}
      style={{ transform: "rotate(5deg)", transformOrigin: "top left" }}
    >
      <span className="text-[28px] leading-none">{emoji}</span>
      <p className="mt-3 text-[15px] font-semibold leading-tight">{title}</p>
      <p className={cn("mt-1.5 text-[12.5px] leading-snug", subtitleColor)}>{tagline}</p>
    </div>
  );
}

export function FeaturesSection() {
  const doubled = [...FEATURES, ...FEATURES];

  return (
    <section className="overflow-hidden bg-brand-cream py-[90px]">
      <div className="mx-auto mb-12 max-w-[700px] px-8 text-center">
        <div className="mb-4 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
          <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
          Everything you need
        </div>
        <h2 className="font-serif text-[clamp(28px,3.5vw,40px)] font-medium leading-[1.18] tracking-[-0.3px] text-brand-ink">
          Built for the way salons actually work.
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-relaxed text-brand-ink/58">
          From the first booking to the follow-up message, every part of your client experience runs through one place.
        </p>
      </div>

      {/* Marquee track — cards drift left on a loop */}
      <div className="relative">
        {/* Fade masks at edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-brand-cream to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-brand-cream to-transparent" />

        <div className="pb-14 pt-6">
          <div className="feature-marquee flex gap-5 [width:max-content]">
            {doubled.map((f, i) => (
              <Card key={i} {...f} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
