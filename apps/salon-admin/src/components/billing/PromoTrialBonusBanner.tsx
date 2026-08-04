import { useState } from "react";
import { ChevronDown, Gift, X } from "lucide-react";
import { usePromoTrialBonusEligibility } from "@/hooks/usePromoTrialBonus";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@shared/utils";
import { ApplyPromoCodeDialog } from "./ApplyPromoCodeDialog";

/**
 * Persistent (dismissible-but-reappears-next-session) nudge shown while a
 * tenant is still within the promo-bonus eligibility window. Lives in the
 * content area, below the header's own trial countdown chip — never
 * touches the sidebar or header.
 *
 * Applying a promo code is billing-adjacent, so this only renders for
 * roles with the promo_trial_bonus permission (owner + manager by default,
 * toggleable per-role/per-user from Staff → Roles & Permissions) — the
 * RPCs enforce the same gate server-side regardless of this check.
 */
export function PromoTrialBonusBanner() {
  const { eligible, config, daysLeftInWindow } = usePromoTrialBonusEligibility();
  const { hasPermission } = usePermissions();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  if (!eligible || dismissed || !config || !hasPermission("promo_trial_bonus")) return null;

  return (
    <>
      <div className="mb-4 rounded-[14px] bg-gradient-to-br from-primary to-[#4A3878] text-white shadow-sm sm:flex sm:items-center sm:gap-3.5 sm:p-4">
        {/* Collapsed row on mobile — tap to expand. Row layout unchanged from sm: up. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
          }}
          className="flex w-full items-center gap-2.5 p-3 text-left sm:hidden"
        >
          <div className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[8px] bg-white/15">
            <Gift className="h-3.5 w-3.5" />
          </div>
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
            Promo code available — {daysLeftInWindow} day{daysLeftInWindow === 1 ? "" : "s"} left
          </p>
          <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-white/75 transition-transform", expanded && "rotate-180")} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            aria-label="Dismiss"
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className={cn("px-3 pb-3 sm:hidden", !expanded && "hidden")}>
          <p className="text-[12.5px] text-white/70">
            Apply it before your window closes and get{" "}
            <b className="font-semibold text-accent">+{config.bonusDays} extra trial days</b> added on top.
          </p>
          <button
            type="button"
            onClick={() => setApplyOpen(true)}
            className="mt-2.5 w-full rounded-full bg-accent px-4 py-2 text-[12.5px] font-bold text-primary hover:brightness-105"
          >
            Apply code
          </button>
        </div>

        {/* sm: and up — original always-expanded single row */}
        <div className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/15 sm:flex">
          <Gift className="h-4 w-4" />
        </div>
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="text-[13.5px] font-semibold">
            Have a promo code? Use it in the next {daysLeftInWindow} day{daysLeftInWindow === 1 ? "" : "s"}.
          </p>
          <p className="text-[12.5px] text-white/70">
            Apply it before your window closes and get{" "}
            <b className="font-semibold text-accent">+{config.bonusDays} extra trial days</b> added on top.
          </p>
        </div>
        <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
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
