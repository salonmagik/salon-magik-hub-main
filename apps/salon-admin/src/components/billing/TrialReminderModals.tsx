import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calendar, Clock, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTrialEnforcement } from "@/hooks/useTrialEnforcement";
import { usePromoTrialBonusEligibility } from "@/hooks/usePromoTrialBonus";
import { usePermissions } from "@/hooks/usePermissions";

type Threshold = "7d" | "3d" | "24h";

const THRESHOLD_HOURS: Record<Threshold, number> = { "7d": 24 * 7, "3d": 24 * 3, "24h": 24 };

function seenKey(tenantId: string, threshold: Threshold) {
  return `salonmagik:trial-modal-seen:${tenantId}:${threshold}`;
}

/**
 * Auto-triggers, once per threshold per tenant (tracked in localStorage —
 * this is a client-side "have I nagged this browser about it" nudge, not a
 * billing record), a reminder modal at 7 days / 3 days / 24 hours before
 * trial end. Only the 7-day modal mentions the promo bonus, and only while
 * still eligible for it — by the 3-day mark the apply-window has typically
 * already closed.
 */
export function TrialReminderModals() {
  const { currentTenant } = useAuth();
  const { trialStatus, startUpgradeCheckout } = useTrialEnforcement();
  const { eligible: promoEligible, config: promoConfig } = usePromoTrialBonusEligibility();
  const { hasPermission } = usePermissions();
  const [activeThreshold, setActiveThreshold] = useState<Threshold | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hoursRemaining = useMemo(() => {
    if (!trialStatus.isTrialing || !trialStatus.expiresAt) return null;
    return (new Date(trialStatus.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
  }, [trialStatus.isTrialing, trialStatus.expiresAt]);

  useEffect(() => {
    if (!currentTenant?.id || hoursRemaining === null || hoursRemaining < 0) return;

    // Furthest-out unmet threshold first — if the tenant hasn't been seen in
    // a while, they get the oldest-due reminder rather than skipping to the
    // most urgent one.
    const due = (["7d", "3d", "24h"] as Threshold[]).find(
      (t) => hoursRemaining <= THRESHOLD_HOURS[t] && !localStorage.getItem(seenKey(currentTenant.id, t)),
    );
    if (due) setActiveThreshold(due);
  }, [currentTenant?.id, hoursRemaining]);

  if (!activeThreshold || !currentTenant?.id) return null;

  const dismiss = () => {
    localStorage.setItem(seenKey(currentTenant.id, activeThreshold), "1");
    setActiveThreshold(null);
  };

  const handleUpgrade = async () => {
    setIsLoading(true);
    const result = await startUpgradeCheckout();
    setIsLoading(false);
    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
    // On failure the tenant just stays on this modal — the header/full-page
    // trial banner (TrialBanner) already surfaces a toast with the reason if
    // they try again from there.
  };

  const copy: Record<Threshold, { icon: React.ElementType; iconBg: string; title: string; body: string }> = {
    "7d": {
      icon: Clock,
      iconBg: "bg-primary/10 text-primary",
      title: "Your trial wraps up in 7 days",
      body: "Whenever you're ready, upgrading takes about 2 minutes and everything stays exactly as it is — your bookings, your customers, your setup.",
    },
    "3d": {
      icon: Calendar,
      iconBg: "bg-warning-bg text-warning-foreground",
      title: "3 days left on your trial",
      body: "To keep running your salon without any interruption, upgrade before then. It only takes a couple of minutes, and everything you've set up stays exactly as is.",
    },
    "24h": {
      icon: AlertTriangle,
      iconBg: "bg-destructive/10 text-destructive",
      title: "Your trial ends tomorrow",
      body: "To stay in full control of your bookings, customers, and storefront without any gap, upgrade today. Once your trial ends, your booking page pauses until you do.",
    },
  };

  const c = copy[activeThreshold];
  const Icon = c.icon;
  const showPromoMention = activeThreshold === "7d" && promoEligible && promoConfig && hasPermission("promo_trial_bonus");

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${c.iconBg}`}>
            <Icon className="h-6 w-6" />
          </div>
          <DialogTitle className="font-serif text-xl">{c.title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{c.body}</p>

        {showPromoMention && (
          <div className="rounded-[10px] bg-primary/10 px-3.5 py-3 text-[13px] text-primary">
            🎁 Got a promo code? Apply it now for{" "}
            <b className="font-semibold">+{promoConfig.bonusDays} extra trial days</b> on top of your plan.
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleUpgrade} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Upgrade my plan
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            {activeThreshold === "24h" ? "I understand" : "Remind me later"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
