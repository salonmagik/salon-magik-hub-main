import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { usePlanChangeNotifications } from "@/hooks/usePlanChangeNotifications";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";

type PriceDelta = {
  currency: string;
  previous_monthly_price: number | null;
  new_monthly_price: number;
  previous_annual_price: number | null;
  new_annual_price: number;
};

function formatMoney(currency: string, amount: number) {
  return `${getCurrencySymbol(currency)}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function describePriceDeltas(deltas: PriceDelta[]): string[] {
  return deltas
    .filter((d) => d.previous_monthly_price !== null && d.previous_monthly_price !== d.new_monthly_price)
    .map(
      (d) =>
        `${d.currency}: ${formatMoney(d.currency, d.previous_monthly_price as number)} → ${formatMoney(d.currency, d.new_monthly_price)}/mo`,
    );
}

export function PlanChangeBanner() {
  const [open, setOpen] = useState(false);
  const { latestUnseen, markSeen, markOpened, dismiss } = usePlanChangeNotifications();
  const announcedRef = useRef<string | null>(null);

  const priceDeltas = (latestUnseen?.change_summary_json?.price_deltas as PriceDelta[] | undefined) || [];
  const priceLines = useMemo(() => describePriceDeltas(priceDeltas), [priceDeltas]);
  const effectiveAt = latestUnseen?.rolled_out_at || latestUnseen?.rollout_at;

  const description = priceLines.length > 0 ? priceLines.join(" · ") : "Your subscription plan has been updated.";

  useEffect(() => {
    if (!latestUnseen || announcedRef.current === latestUnseen.notification_id) return;
    announcedRef.current = latestUnseen.notification_id;

    toast("Your plan pricing has changed", {
      description: effectiveAt
        ? `${description} — effective ${new Date(effectiveAt).toLocaleDateString()}`
        : description,
      duration: 10000,
      action: {
        label: "View details",
        onClick: () => {
          void markOpened(latestUnseen.notification_id);
          setOpen(true);
        },
      },
      onDismiss: () => {
        void markSeen(latestUnseen.notification_id);
      },
      onAutoClose: () => {
        void markSeen(latestUnseen.notification_id);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestUnseen?.notification_id]);

  if (!latestUnseen) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Plan Change Details</DialogTitle>
        </DialogHeader>
        <div className={cn(DIALOG_BODY_PADDING, "space-y-3")}>
          <div>
            <strong>Reason:</strong> {latestUnseen.reason || "No reason provided"}
          </div>
          <div>
            <strong>Effective:</strong> {effectiveAt ? new Date(effectiveAt).toLocaleString() : "Immediate"}
          </div>
          {priceLines.length > 0 && (
            <div>
              <strong>Price change:</strong>
              <ul className="ml-4 mt-1 list-disc">
                {priceLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await dismiss(latestUnseen.notification_id);
                setOpen(false);
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
