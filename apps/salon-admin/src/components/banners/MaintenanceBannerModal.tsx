import { Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { useBanners } from "./BannerContext";

export function MaintenanceBannerModal() {
  const { maintenanceBannerSetting, maintenanceModalOpen, closeMaintenanceModal } = useBanners();

  if (!maintenanceBannerSetting) return null;

  const { title, description, guidance, mode, scheduled_at } = maintenanceBannerSetting;
  const scheduledAt = mode === "scheduled" && scheduled_at ? new Date(scheduled_at) : null;

  return (
    <Dialog open={maintenanceModalOpen} onOpenChange={(open) => { if (!open) closeMaintenanceModal(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {scheduledAt && (
            <div className="rounded-lg bg-muted px-4 py-3">
              <p className="font-medium">Scheduled for</p>
              <p className="text-muted-foreground">{scheduledAt.toLocaleString()}</p>
            </div>
          )}

          {description && (
            <div>
              <p className="font-medium mb-1">What's happening</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{description}</p>
            </div>
          )}

          {guidance && (
            <div>
              <p className="font-medium mb-1">What you should know</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{guidance}</p>
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button className="w-full" onClick={closeMaintenanceModal}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
