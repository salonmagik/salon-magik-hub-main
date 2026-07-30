import { useState } from "react";
import { Gift, X } from "lucide-react";
import { usePromoTrialBonusEligibility } from "@/hooks/usePromoTrialBonus";
import { ApplyPromoCodeDialog } from "./ApplyPromoCodeDialog";

/**
 * Persistent (dismissible-but-reappears-next-session) nudge shown while a
 * tenant is still within the promo-bonus eligibility window. Lives in the
 * content area, below the header's own trial countdown chip — never
 * touches the sidebar or header.
 */
export function PromoTrialBonusBanner() {
  const { eligible, config, daysLeftInWindow } = usePromoTrialBonusEligibility();
  const [dismissed, setDismissed] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  if (!eligible || dismissed || !config) return null;

  return (
    <>
      <div className="mb-4 flex items-center gap-3.5 rounded-[14px] bg-gradient-to-br from-primary to-[#4A3878] p-4 text-white shadow-sm">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/15">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">
            Have a promo code? Use it in the next {daysLeftInWindow} day{daysLeftInWindow === 1 ? "" : "s"}.
          </p>
          <p className="text-[12.5px] text-white/70">
            Apply it before your window closes and get{" "}
            <b className="font-semibold text-accent">+{config.bonusDays} extra trial days</b> added on top.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setApplyOpen(true)}
            className="rounded-full bg-accent px-4 py-2 text-[12.5px] font-bold text-primary hover:brightness-105"
          >
            Apply code
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ApplyPromoCodeDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  );
}
