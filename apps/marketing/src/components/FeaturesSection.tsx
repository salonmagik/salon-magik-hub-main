import { cn } from "@shared/utils";

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

function MockPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-brand-ink/6 bg-white p-7 shadow-[0_40px_80px_rgba(46,31,78,0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelRow({
  avatar,
  label,
  pill,
  pillStyle,
}: {
  avatar: "a" | "b" | "c";
  label: string;
  pill: string;
  pillStyle: "confirmed" | "pending";
}) {
  const avatarBg = { a: "bg-brand-lilac", b: "bg-brand-yellow", c: "bg-brand-purple" }[avatar];
  return (
    <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px] last:border-0">
      <div className="flex items-center gap-3">
        <div className={cn("h-9 w-9 flex-shrink-0 rounded-full", avatarBg)} />
        <span className="text-[14px] text-brand-ink/80">{label}</span>
      </div>
      <span
        className={cn(
          "rounded-full px-[10px] py-1 text-[11.5px]",
          pillStyle === "confirmed" && "bg-brand-purple/8 text-brand-purple",
          pillStyle === "pending" && "bg-brand-yellow/25 text-[#7A5E12]",
        )}
      >
        {pill}
      </span>
    </div>
  );
}

function FeatureBlock({
  tag,
  heading,
  description,
  bullets,
  panel,
  reverse,
  bg,
}: {
  tag: string;
  heading: string;
  description: string;
  bullets: string[];
  panel: React.ReactNode;
  reverse?: boolean;
  bg?: string;
}) {
  return (
    <section className={cn("px-8 py-[120px]", bg)}>
      <div
        className={cn(
          "mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-20 md:grid-cols-2",
          reverse && "md:[&>*:first-child]:order-2 md:[&>*:last-child]:order-1",
        )}
      >
        <div>
          <SectionTag>{tag}</SectionTag>
          <h2 className="mb-[18px] font-serif text-[clamp(26px,3vw,36px)] font-medium leading-[1.18] tracking-[-0.3px] text-brand-ink">
            {heading}
          </h2>
          <p className="mb-7 max-w-[420px] text-[16.5px] leading-[1.7] text-brand-ink/65">{description}</p>
          <ul className="flex flex-col gap-[14px]">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[15px] text-brand-ink/80">
                <Check />
                {b}
              </li>
            ))}
          </ul>
        </div>
        {panel}
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <>
      <FeatureBlock
        tag="Booking"
        heading="Clients book themselves. Your calendar fills itself."
        description="Share one link. Clients pick a service, a stylist and a time that works, and it lands straight on your calendar. No back-and-forth required."
        bullets={[
          "Real-time availability across every stylist",
          "Automatic deposits for high-demand slots",
          "Reminders that cut no-shows in half",
        ]}
        panel={
          <MockPanel>
            <div className="mb-5 flex items-center justify-between">
              <span className="font-serif text-[18px] text-brand-ink">Today's schedule</span>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-brand-cream-dim" />)}
              </div>
            </div>
            <PanelRow avatar="a" label="Ama K. · Silk press" pill="Confirmed" pillStyle="confirmed" />
            <PanelRow avatar="b" label="Kwesi B. · Fade & line up" pill="Confirmed" pillStyle="confirmed" />
            <PanelRow avatar="c" label="Efua T. · Gel manicure" pill="Pending deposit" pillStyle="pending" />
            <PanelRow avatar="a" label="Nana Y. · Full color" pill="Confirmed" pillStyle="confirmed" />
          </MockPanel>
        }
      />

      <FeatureBlock
        tag="Messaging"
        heading="Reach clients before they drift, not after."
        description="Send SMS and email broadcasts for promos and slow days, or let targeted messages go out on their own: a birthday note, a nudge to clients who haven't booked in a while, a reminder before their visit."
        bullets={[
          "One broadcast to your full client list by SMS or email",
          "Automatic birthday messages, if you've collected the date",
          "Reactivation messages for clients who've gone quiet",
        ]}
        panel={
          <MockPanel>
            <div className="mb-5 flex items-center justify-between">
              <span className="font-serif text-[18px] text-brand-ink">Targeted messaging</span>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-brand-cream-dim" />)}
              </div>
            </div>
            <PanelRow avatar="b" label="Birthday message" pill="Auto-sent" pillStyle="confirmed" />
            <PanelRow avatar="c" label="Reactivation · 60 days inactive" pill="214 sent" pillStyle="confirmed" />
            <PanelRow avatar="a" label="Weekend promo broadcast" pill="Scheduled" pillStyle="pending" />
            <PanelRow avatar="b" label="Appointment reminder" pill="Auto-sent" pillStyle="confirmed" />
          </MockPanel>
        }
        reverse
        bg="bg-brand-cream-dim"
      />

      <FeatureBlock
        tag="Payments & packages"
        heading="Get paid on the spot. Sell packages without a spreadsheet."
        description="Take payment at checkout, track every cedi and naira in one ledger, and sell prepaid packages your clients can redeem automatically."
        bullets={[
          "Mobile money and card, all in one checkout",
          "Packages that deduct visits automatically",
          "One dashboard for daily and monthly totals",
        ]}
        panel={
          <MockPanel>
            <div className="mb-5 flex items-center justify-between">
              <span className="font-serif text-[18px] text-brand-ink">This month</span>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-brand-cream-dim" />)}
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px]">
              <span className="text-[14px] text-brand-ink/80">Total revenue</span>
              <span className="font-serif text-[18px] text-brand-ink">₵18,640</span>
            </div>
            <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px]">
              <span className="text-[14px] text-brand-ink/80">Packages sold</span>
              <span className="font-serif text-[18px] text-brand-ink">32</span>
            </div>
            <div className="flex items-center justify-between border-b border-brand-cream-dim py-[14px]">
              <span className="text-[14px] text-brand-ink/80">Mobile money</span>
              <span className="rounded-full bg-brand-purple/8 px-[10px] py-1 text-[11.5px] text-brand-purple">68%</span>
            </div>
            <div className="flex items-center justify-between py-[14px]">
              <span className="text-[14px] text-brand-ink/80">Card</span>
              <span className="rounded-full bg-brand-yellow/25 px-[10px] py-1 text-[11.5px] text-[#7A5E12]">32%</span>
            </div>
          </MockPanel>
        }
      />
    </>
  );
}
