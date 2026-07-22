import { useState, useEffect, useRef } from "react";
import { cn } from "@shared/utils";

/* ── Scattered background salon-icon SVGs (purple stroke, low opacity) ── */
const S = "#2E1F4E";

function BgScissors() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <circle cx="8" cy="22" r="4.5" stroke={S} strokeWidth="2" />
      <circle cx="8" cy="10" r="4.5" stroke={S} strokeWidth="2" />
      <line x1="11.5" y1="19.5" x2="27" y2="7" stroke={S} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="11.5" y1="12.5" x2="27" y2="25" stroke={S} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function BgComb() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <rect x="3" y="8" width="26" height="8" rx="2" stroke={S} strokeWidth="2" />
      {[7, 11, 15, 19, 23].map((x) => (
        <line key={x} x1={x} y1="16" x2={x} y2="25" stroke={S} strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  );
}
function BgBlowDryer() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <ellipse cx="13" cy="13" rx="9" ry="7" stroke={S} strokeWidth="2" />
      <path d="M21 10 L27 8 L27 18 L21 16" stroke={S} strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 19 Q7 23 7 27" stroke={S} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function BgMirror() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <ellipse cx="16" cy="12" rx="9" ry="10" stroke={S} strokeWidth="2" />
      <line x1="16" y1="22" x2="16" y2="29" stroke={S} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="11" y1="29" x2="21" y2="29" stroke={S} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function BgNailPolish() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
      <rect x="11" y="3" width="10" height="7" rx="2" stroke={S} strokeWidth="2" />
      <line x1="16" y1="7" x2="16" y2="11" stroke={S} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 10 Q9 12 9 15 L9 26 Q9 29 16 29 Q23 29 23 26 L23 15 Q23 12 21 10 Z" stroke={S} strokeWidth="2" />
    </svg>
  );
}

interface BgIconDef {
  C: () => React.ReactElement;
  size: number;
  rotate: number;
  opacity: number;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

const BG_ICONS: BgIconDef[] = [
  { C: BgScissors,   size: 22, top: "7%",    left: "2%",    rotate: 22,  opacity: 0.08 },
  { C: BgMirror,     size: 18, top: "16%",   right: "2.5%", rotate: -12, opacity: 0.07 },
  { C: BgComb,       size: 20, top: "60%",   left: "1.5%",  rotate: -22, opacity: 0.07 },
  { C: BgBlowDryer,  size: 24, bottom: "10%",right: "2%",   rotate: 14,  opacity: 0.07 },
  { C: BgNailPolish, size: 16, bottom: "28%",right: "4.5%", rotate: -5,  opacity: 0.06 },
  { C: BgScissors,   size: 14, top: "80%",   left: "6.5%",  rotate: -38, opacity: 0.05 },
];

/* ── Shared helpers ─────────────────────────────────────────────── */
function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-purple">
      <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
      {children}
    </div>
  );
}

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-purple text-[11px] text-brand-yellow">
      ✓
    </span>
  );
}

function MockPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-brand-ink/6 bg-white p-7 shadow-[0_40px_80px_rgba(46,31,78,0.12)]">
      {children}
    </div>
  );
}

function CardDots({ active }: { active: number }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-colors duration-300",
            i === active ? "bg-brand-purple" : "bg-brand-cream-dim",
          )}
        />
      ))}
    </div>
  );
}

type AvatarCfg =
  | { kind: "initials"; text: string; bg: string; textColor: string }
  | { kind: "emoji"; char: string; bg: string };

function PanelRow({ avatar, label, pill, pillStyle }: {
  avatar: AvatarCfg;
  label: string;
  pill: string;
  pillStyle: "confirmed" | "pending";
}) {
  return (
    <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px] last:border-0">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full", avatar.bg)}>
          {avatar.kind === "initials" ? (
            <span className={cn("text-[10.5px] font-semibold tracking-tight", avatar.textColor)}>
              {avatar.text}
            </span>
          ) : (
            <span className="text-[15px] leading-none">{avatar.char}</span>
          )}
        </div>
        <span className="text-[14px] text-brand-ink/80">{label}</span>
      </div>
      <span className={cn(
        "rounded-full px-[10px] py-1 text-[11.5px]",
        pillStyle === "confirmed" && "bg-brand-purple/8 text-brand-purple",
        pillStyle === "pending"   && "bg-brand-yellow/25 text-[#7A5E12]",
      )}>
        {pill}
      </span>
    </div>
  );
}

/* ── Feature data ───────────────────────────────────────────────── */
const FEATURES: {
  tag: string;
  heading: string;
  description: string;
  bullets: string[];
  renderPanel: (active: number) => React.ReactNode;
}[] = [
  {
    tag: "Booking",
    heading: "Clients book themselves. Your calendar fills itself.",
    description:
      "Share one link. Clients pick a service, a stylist and a time that works, and it lands straight on your calendar. No back-and-forth required.",
    bullets: [
      "Real-time availability across every stylist",
      "Automatic deposits for high-demand slots",
      "Reminders that cut no-shows in half",
    ],
    renderPanel: (active) => (
      <MockPanel>
        <div className="mb-5 flex items-center justify-between">
          <span className="font-serif text-[18px] text-brand-ink">Today's schedule</span>
          <CardDots active={active} />
        </div>
        <PanelRow avatar={{ kind: "initials", text: "AK", bg: "bg-brand-lilac",      textColor: "text-brand-purple-deep" }} label="Ama K. · Silk press"        pill="Confirmed"       pillStyle="confirmed" />
        <PanelRow avatar={{ kind: "initials", text: "KB", bg: "bg-brand-yellow",     textColor: "text-brand-purple-deep" }} label="Kwesi B. · Fade & line up"  pill="Confirmed"       pillStyle="confirmed" />
        <PanelRow avatar={{ kind: "initials", text: "ET", bg: "bg-brand-purple",     textColor: "text-white"             }} label="Efua T. · Gel manicure"     pill="Pending deposit" pillStyle="pending"   />
        <PanelRow avatar={{ kind: "initials", text: "NY", bg: "bg-brand-cream-dim",  textColor: "text-brand-ink"         }} label="Nana Y. · Full color"       pill="Confirmed"       pillStyle="confirmed" />
      </MockPanel>
    ),
  },
  {
    tag: "Messaging",
    heading: "Reach clients before they drift, not after.",
    description:
      "Send personalised SMS and email campaigns to your full client list, or let targeted messages go out automatically — a nudge to clients who've gone quiet, a reminder before their visit, a birthday treat. WhatsApp coming soon.",
    bullets: [
      "SMS and email broadcasts to any segment of your client list",
      "Automatic reactivation messages for clients gone quiet",
      "Appointment reminders that cut no-shows in half",
    ],
    renderPanel: (active) => (
      <MockPanel>
        <div className="mb-5 flex items-center justify-between">
          <span className="font-serif text-[18px] text-brand-ink">Targeted messaging</span>
          <CardDots active={active} />
        </div>
        <PanelRow avatar={{ kind: "emoji", char: "🎉",     bg: "bg-brand-yellow/20" }} label="Birthday promotion"             pill="Auto-sent"   pillStyle="confirmed" />
        <PanelRow avatar={{ kind: "emoji", char: "🤸🏽‍♂️", bg: "bg-brand-lilac/40"  }} label="Reactivation · 60 days inactive" pill="214 sent"    pillStyle="confirmed" />
        <PanelRow avatar={{ kind: "emoji", char: "🚀",     bg: "bg-brand-purple/10" }} label="Weekend promo broadcast"        pill="Scheduled"   pillStyle="pending"   />
        <PanelRow avatar={{ kind: "emoji", char: "📍",     bg: "bg-brand-cream-dim" }} label="Appointment reminder"           pill="Auto-sent"   pillStyle="confirmed" />
      </MockPanel>
    ),
  },
  {
    tag: "Clients",
    heading: "Every client remembered. No one slips through the cracks.",
    description:
      "See every customer's visit history, flag your VIPs, and automatically identify who's gone quiet — then pull them back with one targeted message.",
    bullets: [
      "Full visit history and outstanding balance per client",
      "VIP tagging and inactive client detection",
      "One-click reactivation campaigns by SMS or email",
    ],
    renderPanel: (active) => (
      <MockPanel>
        <div className="mb-5 flex items-center justify-between">
          <span className="font-serif text-[18px] text-brand-ink">Your clients</span>
          <CardDots active={active} />
        </div>
        <PanelRow avatar={{ kind: "initials", text: "AK", bg: "bg-brand-yellow",    textColor: "text-brand-purple-deep" }} label="Ama K. · 12 visits"         pill="VIP"             pillStyle="confirmed" />
        <PanelRow avatar={{ kind: "initials", text: "ET", bg: "bg-brand-lilac",     textColor: "text-brand-purple-deep" }} label="Efua T. · Inactive 45 days" pill="Send nudge →"    pillStyle="pending"   />
        <PanelRow avatar={{ kind: "initials", text: "KB", bg: "bg-brand-purple",    textColor: "text-white"             }} label="Kwesi B. · 1 visit"         pill="New"             pillStyle="confirmed" />
        <PanelRow avatar={{ kind: "initials", text: "NY", bg: "bg-brand-cream-dim", textColor: "text-brand-ink"         }} label="Nana Y. · Owes ₵45"        pill="Outstanding"     pillStyle="pending"   />
      </MockPanel>
    ),
  },
  {
    tag: "Reports",
    heading: "Know your numbers. No spreadsheet required.",
    description:
      "A live revenue dashboard shows you daily and monthly inflow, your top-performing services and staff, and how this period compares to the last — all in one place.",
    bullets: [
      "Daily and monthly revenue with period-over-period comparison",
      "Top services and staff performance ranked by revenue",
      "Payment method breakdown and new vs returning clients",
    ],
    renderPanel: (active) => (
      <MockPanel>
        <div className="mb-5 flex items-center justify-between">
          <span className="font-serif text-[18px] text-brand-ink">This month</span>
          <CardDots active={active} />
        </div>
        <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px]">
          <span className="text-[14px] text-brand-ink/80">Inflow</span>
          <div className="flex items-center gap-2">
            <span className="font-serif text-[18px] text-brand-ink">₵18,640</span>
            <span className="rounded-full bg-[#dcfce7] px-[8px] py-0.5 text-[11px] font-medium text-[#166534]">↑ 12%</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px]">
          <span className="text-[14px] text-brand-ink/80">Completed appointments</span>
          <span className="font-serif text-[18px] text-brand-ink">94</span>
        </div>
        <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px]">
          <span className="text-[14px] text-brand-ink/80">Top service</span>
          <span className="rounded-full bg-brand-purple/8 px-[10px] py-1 text-[11.5px] text-brand-purple">Silk press · 28 bookings</span>
        </div>
        <div className="flex items-center justify-between py-[14px]">
          <span className="text-[14px] text-brand-ink/80">Top earner</span>
          <span className="rounded-full bg-brand-yellow/25 px-[10px] py-1 text-[11.5px] text-[#7A5E12]">Akua · ₵3,200</span>
        </div>
      </MockPanel>
    ),
  },
];

/* ── Auto-cycling section ───────────────────────────────────────── */
const CYCLE_MS = 4500;

export function FeaturesSection() {
  const [active, setActive] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setInterval>>();
  const fadingRef = useRef(false);
  const activeRef = useRef(0);
  fadingRef.current = fading;
  activeRef.current = active;

  const startCycle = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (fadingRef.current) return;
      const next = (activeRef.current + 1) % FEATURES.length;
      setFading(true);
      setTimeout(() => { setActive(next); setFading(false); }, 190);
    }, CYCLE_MS);
  };

  useEffect(() => { startCycle(); return () => clearInterval(timerRef.current); }, []);

  const f = FEATURES[active];

  return (
    <section className="relative overflow-hidden bg-brand-cream px-8 py-[100px]">
      {/* Scattered salon icons — decorative */}
      {BG_ICONS.map(({ C, size, rotate, opacity, top, bottom, left, right }, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute select-none"
          style={{ top, bottom, left, right, width: size, height: size, transform: `rotate(${rotate}deg)`, opacity }}
        >
          <C />
        </span>
      ))}

      <div className="mx-auto max-w-[1180px]">
        {/* Content — crossfades on cycle */}
        <div
          className={cn(
            "grid grid-cols-1 items-center gap-16 transition-[opacity,transform] duration-[190ms] md:grid-cols-2",
            fading ? "translate-y-[5px] opacity-0" : "translate-y-0 opacity-100",
          )}
        >
          <div>
            <SectionTag>{f.tag}</SectionTag>
            <h2 className="mb-[18px] font-serif text-[clamp(26px,3vw,36px)] font-medium leading-[1.18] tracking-[-0.3px] text-brand-ink">
              {f.heading}
            </h2>
            <p className="mb-7 max-w-[420px] text-[16.5px] leading-[1.7] text-brand-ink/65">{f.description}</p>
            <ul className="flex flex-col gap-[14px]">
              {f.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-[15px] text-brand-ink/80">
                  <Check />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div>{f.renderPanel(active)}</div>
        </div>
      </div>
    </section>
  );
}
