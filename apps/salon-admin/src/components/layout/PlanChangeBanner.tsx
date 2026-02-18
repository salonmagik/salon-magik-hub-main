import { useMemo, useState } from "react";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { usePlanChangeNotifications } from "@/hooks/usePlanChangeNotifications";

export function PlanChangeBanner() {
  const [open, setOpen] = useState(false);
  const { latestUnseen, markOpened, dismiss, isLoading } = usePlanChangeNotifications();

  const summary = useMemo(() => {
    if (!latestUnseen?.change_summary_json) return "Your subscription plan has been updated.";
    const changes = latestUnseen.change_summary_json.changes;
    if (!Array.isArray(changes) || changes.length === 0) {
      return "Your subscription plan has been updated.";
    }
    return `Updated: ${changes.join(", ")}.`;
  }, [latestUnseen]);

  if (isLoading || !latestUnseen) return null;

  return (
    <>
      <div className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 lg:mx-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Your plan has been updated</p>
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await dismiss(latestUnseen.notification_id);
              }}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await markOpened(latestUnseen.notification_id);
                setOpen(true);
              }}
            >
              View changelog
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Plan Change Changelog</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <strong>Reason:</strong> {latestUnseen.reason || "No reason provided"}
            </div>
            <div>
              <strong>Effective:</strong>{" "}
              {latestUnseen.rolled_out_at
                ? new Date(latestUnseen.rolled_out_at).toLocaleString()
                : latestUnseen.rollout_at
                  ? new Date(latestUnseen.rollout_at).toLocaleString()
                  : "Immediate"}
            </div>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(latestUnseen.change_summary_json || {}, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
