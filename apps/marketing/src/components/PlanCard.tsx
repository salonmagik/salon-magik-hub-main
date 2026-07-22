import { Link } from "react-router-dom";
import { cn } from "@shared/utils";
import type { Plan, PlanFeature, PlanLimit } from "@/hooks/usePlans";

export interface PlanCardProps {
  plan: Plan;
  price: number | null;
  monthlyPrice: number | null;
  savingsPct: number | null;
  features: PlanFeature[];
  limit?: PlanLimit | null;
  isAnnual: boolean;
  isWaitlistMode: boolean;
  onWaitlistClick?: () => void;
  symbol: string;
  salonAppUrl: string;
  /** compact=true: max 5 items total + "View all details" link */
  compact?: boolean;
}

function Check() {
  return (
    <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-brand-purple text-[10px] text-brand-yellow">
      ✓
    </span>
  );
}

function limitItems(limit: PlanLimit): { id: string; feature_text: string }[] {
  return [
    {
      id: "_loc",
      feature_text: limit.max_locations === 1 ? "1 location" : `Up to ${limit.max_locations} locations`,
    },
    {
      id: "_staff",
      feature_text: limit.max_staff === 1 ? "Owner only" : `Up to ${limit.max_staff} staff`,
    },
    {
      id: "_msg",
      feature_text: `${limit.monthly_messages} messages / month`,
    },
  ];
}

export function PlanCard({
  plan,
  price,
  monthlyPrice,
  savingsPct,
  features,
  limit,
  isAnnual,
  isWaitlistMode,
  onWaitlistClick,
  symbol,
  salonAppUrl,
  compact = false,
}: PlanCardProps) {
  const capacity = limit ? limitItems(limit) : [];
  const allItems = [...capacity, ...features];
  const displayedItems = compact ? allItems.slice(0, 5) : allItems;

  const ctaClass = (filled: boolean) =>
    cn(
      "block w-full rounded-full py-[13px] text-center text-[14.5px] font-medium transition-colors",
      filled
        ? "bg-brand-ink text-white hover:bg-brand-purple"
        : "border-[1.5px] border-brand-purple text-brand-purple hover:bg-brand-lilac-bg",
    );

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-[20px] border-[1.5px] bg-white px-7 py-8",
        plan.is_recommended
          ? "border-brand-purple shadow-[0_30px_60px_rgba(46,31,78,0.14)]"
          : "border-brand-ink/8",
      )}
    >
      {plan.is_recommended && (
        <span className="absolute -top-[13px] left-7 rounded-full bg-brand-purple px-3 py-[5px] text-[11.5px] tracking-[0.03em] text-white">
          Most set up for teams
        </span>
      )}

      <div className="font-serif text-[22px] text-brand-ink">{plan.name}</div>
      <div className="mt-1.5 text-[13.5px] text-brand-ink/50">{plan.description}</div>

      <div className="mt-5">
        {price != null ? (
          <>
            <div className="font-serif text-[40px] leading-none text-brand-ink">
              {symbol}
              {price.toLocaleString()}
              <span className="font-sans text-[14px] text-brand-ink/50"> / month</span>
            </div>
            {isAnnual && savingsPct ? (
              <div className="mt-1.5 text-[12.5px] font-medium text-brand-yellow line-through decoration-brand-yellow/60">
                {symbol}
                {monthlyPrice?.toLocaleString()}/mo without annual
              </div>
            ) : (
              <div className="mt-1 text-[12.5px] text-brand-ink/45">
                Save up to {savingsPct ?? "—"}% with annual billing
              </div>
            )}
          </>
        ) : (
          <div className="font-serif text-[32px] leading-none text-brand-ink">Custom</div>
        )}
      </div>

      <ul className={cn("mt-6 flex flex-col gap-[13px]", !compact && "mb-8 flex-1")}>
        {displayedItems.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-[14.5px] text-brand-ink/75">
            <Check />
            {item.feature_text}
          </li>
        ))}
      </ul>

      {compact && (
        <>
          <Link
            to="/pricing"
            className="mb-6 mt-4 block text-[13px] font-medium text-brand-purple hover:underline"
          >
            View all details →
          </Link>
          <div className="flex-1" />
        </>
      )}

      {isWaitlistMode ? (
        compact ? (
          <button
            type="button"
            onClick={onWaitlistClick}
            className={ctaClass(plan.is_recommended)}
          >
            Start free
          </button>
        ) : (
          <Link to="/#waitlist" className={ctaClass(plan.is_recommended)}>
            Join waitlist
          </Link>
        )
      ) : (
        <a
          href={`${salonAppUrl}/signup?plan=${plan.slug}`}
          className={ctaClass(plan.is_recommended)}
        >
          Start free
        </a>
      )}
    </div>
  );
}
