interface FeatureCard {
  emoji: string;
  title: string;
  tagline: string;
}

const FEATURES: FeatureCard[] = [
  { emoji: "🎂", title: "Birthday messages",       tagline: "Auto-sent the morning of, no effort needed"           },
  { emoji: "🔄", title: "Client reactivation",     tagline: "Automatic nudges to clients who've gone quiet"        },
  { emoji: "🏢", title: "Multi-branch",            tagline: "One dashboard for all your locations"                 },
  { emoji: "🌐", title: "Custom domain",           tagline: "Your booking page on your own URL"                    },
  { emoji: "📱", title: "Client portal",           tagline: "Clients view their history and rebook themselves"     },
  { emoji: "✅", title: "Approval-gated bookings", tagline: "Review and confirm every request before it's set"     },
  { emoji: "📦", title: "Prepaid packages",        tagline: "Sell bundles of sessions — clients pay upfront"       },
  { emoji: "🏆", title: "Staff leaderboard",       tagline: "Top earner and per-stylist performance at a glance"   },
  { emoji: "🎟️", title: "Vouchers & gift cards",  tagline: "Sell, share, and redeem in-app"                       },
  { emoji: "📣", title: "SMS broadcast",           tagline: "Send promos to your entire client list in one go"    },
  { emoji: "💳", title: "Mobile money & cards",    tagline: "MoMo, cards, and cash — all tracked in one place"    },
  { emoji: "💎", title: "VIP client tracking",     tagline: "Instantly spot your most loyal and highest-value clients" },
  { emoji: "🎨", title: "Custom booking page",     tagline: "Your brand colours, banner image, and domain"        },
  { emoji: "💬", title: "WhatsApp (coming soon)",  tagline: "Send messages on the channel clients already use"    },
  { emoji: "📊", title: "Revenue dashboard",       tagline: "Inflows, top services, and growth trends over time"  },
  { emoji: "🔐", title: "Role-based access",       tagline: "Control exactly what each staff member can see"      },
  { emoji: "⚖️", title: "Outstanding balances",   tagline: "Track what clients owe and collect with one click"   },
  { emoji: "🗂️", title: "Team calendars",         tagline: "All staff schedules side-by-side in one view"        },
  { emoji: "📅", title: "Online booking",          tagline: "Clients book 24/7 — no app download required"        },
  { emoji: "⏰", title: "Appointment reminders",   tagline: "Email and SMS before every visit, automatically"     },
  { emoji: "💰", title: "Deposit collection",      tagline: "Secure deposits at the time of booking"              },
  { emoji: "🛍️", title: "Products storefront",   tagline: "Sell retail products alongside your services"         },
  { emoji: "📋", title: "Daily digest",            tagline: "Morning email summary of every appointment ahead"    },
  { emoji: "📝", title: "Client notes",            tagline: "Preferences, allergies, and visit history saved"     },
  { emoji: "🖼️", title: "Booking page themes",   tagline: "Default or ecommerce layout — switch any time"        },
  { emoji: "💌", title: "Email campaigns",         tagline: "Personalised messages to filtered client lists"      },
];

// Slim border: purple / yellow / purple-to-yellow gradient, repeating
const BORDER_BG = [
  "rgba(46, 31, 78, 0.35)",                                    // purple
  "#F4C84E",                                                    // yellow
  "linear-gradient(135deg, #2E1F4E, #F4C84E)",                 // gradient
];

function Card({ emoji, title, tagline, index }: FeatureCard & { index: number }) {
  const border = BORDER_BG[index % 3];
  return (
    // 1-px border via wrapper gradient trick — works for solid and gradient borders
    <div
      style={{ background: border, padding: "1px", borderRadius: "18px", flexShrink: 0 }}
    >
      <div className="w-[220px] rounded-[17px] bg-brand-cream p-5 shadow-[0_6px_20px_rgba(0,0,0,0.07)]">
        <span className="text-[26px] leading-none">{emoji}</span>
        <p className="mt-3 text-[14.5px] font-semibold leading-tight text-brand-ink">{title}</p>
        <p className="mt-1.5 text-[12px] leading-snug text-brand-ink/55">{tagline}</p>
      </div>
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

      <div className="relative">
        {/* Fade masks */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-brand-cream to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-brand-cream to-transparent" />

        <div className="py-4">
          <div className="feature-marquee flex gap-4 [width:max-content]">
            {doubled.map((f, i) => (
              <Card key={i} index={i % FEATURES.length} {...f} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
