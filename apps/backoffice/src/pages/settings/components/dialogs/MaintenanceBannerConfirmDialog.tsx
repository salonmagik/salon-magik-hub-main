import { Button } from "@ui/button";
import { Dialog, DialogDescription } from "@ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import {
  ArtifactDialogContent,
  ArtifactDialogHeader,
  ArtifactDialogFooter,
  ArtifactDialogTitle,
  ARTIFACT_DIALOG_BODY_PADDING,
} from "@/components/dialogs/ArtifactDialogChrome";
import { cn } from "@shared/utils";
import { Megaphone } from "lucide-react";
import type { useSafetyControls } from "../../hooks/useSafetyControls";

interface MaintenanceBannerConfirmDialogProps {
  safety: ReturnType<typeof useSafetyControls>;
}

export function MaintenanceBannerConfirmDialog({ safety }: MaintenanceBannerConfirmDialogProps) {
  return (
    <Dialog open={safety.maintBannerDialogOpen} onOpenChange={safety.setMaintBannerDialogOpen}>
      <ArtifactDialogContent className="max-w-[420px]">
        <div className="px-6 pb-0 pt-6 text-center">
          <div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-warning-bg">
            <Megaphone className="h-5 w-5 text-warning" />
          </div>
          <ArtifactDialogHeader className="block space-y-0 p-0 text-center">
            <ArtifactDialogTitle className="text-[15px] font-bold">Confirm: save maintenance banner</ArtifactDialogTitle>
          </ArtifactDialogHeader>
          <DialogDescription className="mt-1 text-[12.5px] text-muted-foreground">
            Confirm with your 2FA code to apply changes
            {safety.maintEnabled ? " and activate the banner" : ""}.
          </DialogDescription>
        </div>

        <div className={cn(ARTIFACT_DIALOG_BODY_PADDING, "items-center")}>
          <div className="flex flex-col items-center gap-1">
            <InputOTP
              maxLength={6}
              value={safety.maintTotpToken}
              onChange={(value) => safety.setMaintTotpToken(value)}
            >
              <InputOTPGroup className="gap-[7px]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-[48px] w-[40px] rounded-[8px] border first:rounded-[8px] last:rounded-[8px] first:border-l"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          {safety.maintSecurityError && (
            <p className="text-sm text-destructive">{safety.maintSecurityError}</p>
          )}
        </div>

        <ArtifactDialogFooter>
          <Button variant="outline" onClick={() => safety.setMaintBannerDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={safety.confirmSaveMaintenanceBanner}
            disabled={safety.saveMaintenanceBannerMutation.isPending}
          >
            {safety.saveMaintenanceBannerMutation.isPending ? "Saving..." : "Confirm & save"}
          </Button>
        </ArtifactDialogFooter>
      </ArtifactDialogContent>
    </Dialog>
  );
}
