import {
  Cake, RefreshCw, Building2, Globe, LayoutDashboard, ClipboardCheck,
  Package, Tag, Megaphone, CreditCard, Star, Palette, MessageCircle,
  TrendingUp, ShieldCheck, Wallet, CalendarDays, CalendarCheck,
  Bell, Banknote, ShoppingBag, Newspaper, FileText, Layers, Mail,
  type LucideIcon,
} from "lucide-react";

interface FeatureCard {
  icon: LucideIcon;
  title: string;
  tagline: string;
}

const FEATURES: FeatureCard[] = [
  { icon: CalendarCheck,   title: "Online booking",           tagline: "Clients book 24/7 — no app download required"           },
  { icon: Bell,            title: "Appointment reminders",    tagline: "Email and SMS before every visit, automatically"        },
  { icon: Cake,            title: "Birthday messages",        tagline: "Auto-sent the morning of, no effort needed"             },
  { icon: RefreshCw,       title: "Client reactivation",      tagline: "Automatic nudges to clients who've gone quiet"          },
  { icon: Building2,       title: "Multi-branch",             tagline: "One dashboard for all your locations"                   },
  { icon: Globe,           title: "Custom domain",            tagline: "Your booking page on your own URL"                      },
  { icon: LayoutDashboard, title: "Client portal",            tagline: "Clients view their history and rebook themselves"       },
  { icon: ClipboardCheck,  title: "Approval-gated bookings",  tagline: "Review and confirm every request before it's set"      },
  { icon: Package,         title: "Prepaid packages",         tagline: "Sell bundles of sessions — clients pay upfront"         },
  { icon: Tag,             title: "Vouchers",                 tagline: "Create and redeem discount vouchers in-app"             },
  { icon: Megaphone,       title: "SMS broadcast",            tagline: "Send promos to your entire client list in one go"      },
  { icon: CreditCard,      title: "Mobile money & cards",     tagline: "MoMo, cards, and cash — all tracked in one place"      },
  { icon: Star,            title: "VIP client tracking",      tagline: "Instantly spot your most loyal and highest-value clients" },
  { icon: Palette,         title: "Custom booking page",      tagline: "Your brand colours, banner image, and domain"          },
  { icon: MessageCircle,   title: "WhatsApp (coming soon)",   tagline: "Send messages on the channel clients already use"      },
  { icon: TrendingUp,      title: "Revenue dashboard",        tagline: "Inflows, top services, and growth trends over time"    },
  { icon: ShieldCheck,     title: "Role-based access",        tagline: "Control exactly what each staff member can see"        },
  { icon: Wallet,          title: "Outstanding balances",     tagline: "Track what clients owe and collect with one click"     },
  { icon: CalendarDays,    title: "Team calendars",           tagline: "All staff schedules side-by-side in one view"          },
  { icon: Banknote,        title: "Deposit collection",       tagline: "Secure deposits at the time of booking"                },
  { icon: ShoppingBag,     title: "Products storefront",      tagline: "Sell retail products alongside your services"          },
  { icon: Newspaper,       title: "Daily digest",             tagline: "Morning email summary of every appointment ahead"      },
  { icon: FileText,        title: "Client notes",             tagline: "Preferences, allergies, and visit history saved"       },
  { icon: Layers,          title: "Booking page themes",      tagline: "Default or ecommerce layout — switch any time"         },
  { icon: Mail,            title: "Email campaigns",          tagline: "Personalised messages to filtered client lists"        },
];

const BORDER_BG = [
  "rgba(46, 31, 78, 0.3)",                          // purple
  "#F4C84E",                                         // yellow
  "linear-gradient(135deg, #2E1F4E, #F4C84E)",      // gradient
];

function Card({ icon: Icon, title, tagline, index }: FeatureCard & { index: number }) {
  const border = BORDER_BG[index % 3];
  return (
    <div style={{ background: border, padding: "1px", borderRadius: "18px", flexShrink: 0 }}>
      <div className="w-[220px] rounded-[17px] bg-brand-cream p-5 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-purple/8">
          <Icon className="h-[18px] w-[18px] text-brand-purple" strokeWidth={1.6} />
        </div>
        <p className="mt-3.5 text-[14.5px] font-semibold leading-tight text-brand-ink">{title}</p>
        <p className="mt-1.5 text-[12px] leading-snug text-brand-ink/50">{tagline}</p>
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
