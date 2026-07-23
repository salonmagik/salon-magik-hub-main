import { MarketingLayout } from "@/components/MarketingLayout";
import {
  Scissors, Waves, Zap, Leaf, Wind, Layers, Smile, User, Palette, Crown,
  Gem, Pen, Sparkles, Feather, Minus, Wand2, Heart, Droplets, PenLine, Sun,
  Flame, Activity, TrendingUp, Paintbrush, HeartPulse, Pencil, MapPin,
  Shield, Star,
  type LucideIcon,
} from "lucide-react";

interface BizType {
  icon: LucideIcon;
  name: string;
  tagline: string;
}

const ROW_1: BizType[] = [
  { icon: Scissors, name: "Hair Salons",             tagline: "Cuts, colour, and styling all in one place"   },
  { icon: Waves,    name: "Braiding Studios",         tagline: "Knotless, box braids, and cornrows"           },
  { icon: Zap,      name: "Barbershops",              tagline: "Cuts, fades, and clean shaves"                },
  { icon: Leaf,     name: "Loc Studios",              tagline: "Installation, maintenance, and retouching"    },
  { icon: Wind,     name: "Natural Hair Salons",      tagline: "Wash and go, twists, and protective styles"   },
  { icon: Layers,   name: "Weave & Extensions",       tagline: "Sew-ins, clip-ins, and frontal installs"      },
  { icon: Smile,    name: "Kids' Hair Salons",        tagline: "Gentle cuts in a welcoming space"             },
  { icon: User,     name: "Men's Grooming Lounges",   tagline: "Full grooming experience for men"             },
  { icon: Palette,  name: "Hair Colour Studios",      tagline: "Colour, highlights, and balayage"             },
  { icon: Crown,    name: "Afro Hair Salons",         tagline: "Celebrating natural texture, every time"      },
];

const ROW_2: BizType[] = [
  { icon: Gem,      name: "Nail Salons",              tagline: "Manicures, pedicures, and gel sets"           },
  { icon: Pen,      name: "Nail Art Studios",         tagline: "Custom nail art and creative sets"            },
  { icon: Sparkles, name: "Lash Studios",             tagline: "Classic, hybrid, and volume extensions"       },
  { icon: Feather,  name: "Brow Studios",             tagline: "Shaping, tinting, and lamination"             },
  { icon: Minus,    name: "Threading & Waxing",       tagline: "Precise hair removal, face and body"          },
  { icon: Wand2,    name: "Makeup Artists",           tagline: "Full face, events, and editorial looks"       },
  { icon: Heart,    name: "Bridal Beauty Suites",     tagline: "Head-to-toe prep for your big day"            },
  { icon: Droplets, name: "Skincare Studios",         tagline: "Facials, peels, and glow treatments"          },
  { icon: PenLine,  name: "Microblading & PMU",       tagline: "Semi-permanent brows, lips, and liner"        },
  { icon: Sun,      name: "Facials & Glow Studios",   tagline: "Deep cleansing, hydration, and radiance"      },
];

const ROW_3: BizType[] = [
  { icon: Flame,      name: "Spas & Wellness",              tagline: "Full-body relaxation and renewal"           },
  { icon: Activity,   name: "Massage Studios",               tagline: "Therapeutic, deep tissue, and relaxation"   },
  { icon: TrendingUp, name: "Body Contouring",               tagline: "Non-surgical slimming and sculpting"        },
  { icon: Paintbrush, name: "Waxing Studios",                tagline: "Smooth results from top to toe"             },
  { icon: HeartPulse, name: "Medspas",                       tagline: "Aesthetic treatments with clinical care"    },
  { icon: Pencil,     name: "Tattoo & Piercing Studios",     tagline: "Custom art and precision piercing"          },
  { icon: MapPin,     name: "Mobile & Freelance Stylists",   tagline: "Your stylist, wherever you need them"       },
  { icon: Shield,     name: "Aesthetic Clinics",             tagline: "Evidence-based beauty treatments"           },
  { icon: Star,       name: "Tanning Studios",               tagline: "Spray tans and golden-hour glow"           },
  { icon: Zap,        name: "Laser & Hair Removal",          tagline: "Permanent reduction and smooth skin"        },
];

const ROWS = [
  { items: ROW_1, border: "#F4C84E",                                    duration: "70s",  reverse: false },
  { items: ROW_2, border: "rgba(46,31,78,0.28)",                        duration: "85s",  reverse: true  },
  { items: ROW_3, border: "linear-gradient(135deg,#2E1F4E,#F4C84E)",    duration: "75s",  reverse: false },
];

function BizCard({ icon: Icon, name, tagline, border }: BizType & { border: string }) {
  return (
    <div style={{ background: border, padding: "1px", borderRadius: "18px", flexShrink: 0, overflow: "hidden" }}>
      <div className="w-[220px] bg-white p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-purple/8">
          <Icon className="h-[18px] w-[18px] text-brand-purple" strokeWidth={1.6} />
        </div>
        <p className="mt-3.5 text-[14.5px] font-semibold leading-tight text-brand-ink">{name}</p>
        <p className="mt-1.5 text-[12px] leading-snug text-brand-ink/50">{tagline}</p>
      </div>
    </div>
  );
}

export default function WhosItForPage() {
  return (
		<MarketingLayout>
			{/* Hero */}
			<section className="px-8 pb-12 pt-16 text-center">
				<h1 className="mx-auto max-w-[700px] font-serif text-[clamp(32px,4.5vw,50px)] font-medium leading-[1.1] tracking-[-0.4px] text-brand-ink">
					30+ business types. One platform.
				</h1>
				<p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-relaxed text-brand-ink/55">
					Whether you're cutting, braiding, doing nails, or running a medspa.
					Salon Magik runs the back office while you focus on the craft.
				</p>
			</section>

			{/* Marquee rows */}
			<section className="overflow-hidden bg-white pb-[90px] pt-8">
				<div className="flex flex-col gap-4">
					{ROWS.map(({ items, border, duration, reverse }, rowIdx) => {
						const doubled = [...items, ...items];
						return (
							<div key={rowIdx} className="relative py-2">
								<div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent" />
								<div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent" />
								<div
									className="feature-marquee flex gap-4 [width:max-content]"
									style={{
										animationDuration: duration,
										animationDirection: reverse ? "reverse" : "normal",
									}}
								>
									{doubled.map((item, i) => (
										<BizCard key={i} border={border} {...item} />
									))}
								</div>
							</div>
						);
					})}
				</div>
			</section>
		</MarketingLayout>
	);
}
