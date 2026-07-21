import { usePlans } from "@/hooks";

interface CTASectionProps {
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
}

export function CTASection({ isWaitlistMode, onWaitlistClick }: CTASectionProps) {
  const { data: plans } = usePlans();
  const trialDays = plans?.find((p) => p.is_recommended)?.trial_days ?? plans?.[0]?.trial_days ?? 14;
  const defaultSalonAppUrl = import.meta.env.DEV ? "http://localhost:8080" : "https://app.salonmagik.com";
  const salonAppUrl = (import.meta.env.VITE_SALON_APP_URL || defaultSalonAppUrl).replace(/\/$/, "");

  return (
    <section
      className="relative overflow-hidden bg-brand-purple-deep px-8 pt-[80px] pb-[72px] text-center text-white"
      style={{
        /* decorative yellow glow top-right */
      }}
    >
      {/* Decorative glow */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(244,200,78,0.18), transparent 70%)" }}
      />

      <div className="relative">
        <div className="mb-4 flex items-center justify-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.08em] text-brand-yellow">
          <span className="inline-block h-[1.5px] w-[18px] bg-brand-yellow" />
          Ready when you are
        </div>

        <h2 className="mx-auto mb-5 max-w-[640px] font-serif text-[clamp(28px,4vw,42px)] font-medium leading-[1.18] tracking-[-0.3px] text-white">
          {isWaitlistMode ? "Be among the first." : "Give your salon a calmer week."}
        </h2>

        <p className="mx-auto mb-9 max-w-[480px] text-[16.5px] text-white/55">
          {isWaitlistMode
            ? "We're in private beta. Get exclusive early access and special launch pricing."
            : `Set up takes about ten minutes. No credit card, no contracts, no learning curve. ${trialDays}-day free trial.`}
        </p>

        {isWaitlistMode ? (
          <button
            type="button"
            onClick={onWaitlistClick}
            className="inline-block rounded-full bg-brand-yellow px-7 py-[15px] text-[15.5px] font-medium text-brand-purple-deep transition-transform hover:-translate-y-0.5"
          >
            Get exclusive access
          </button>
        ) : (
          <a
            href={`${salonAppUrl}/signup`}
            className="inline-block rounded-full bg-brand-yellow px-7 py-[15px] text-[15.5px] font-medium text-brand-purple-deep transition-transform hover:-translate-y-0.5"
          >
            Start free today
          </a>
        )}
      </div>
    </section>
  );
}
