import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Dialog, DialogDescription } from "@ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@ui/input-otp";
import {
  ArtifactDialogContent,
  ArtifactDialogHeader,
  ArtifactDialogFooter,
  ARTIFACT_DIALOG_BODY_PADDING,
} from "@/components/dialogs/ArtifactDialogChrome";
import { cn } from "@shared/utils";
import { AlertTriangle } from "lucide-react";
import type { useSafetyControls } from "../../hooks/useSafetyControls";

interface KillSwitchConfirmDialogProps {
  safety: ReturnType<typeof useSafetyControls>;
}

export function KillSwitchConfirmDialog({ safety }: KillSwitchConfirmDialogProps) {
  const { pendingKillSwitchState } = safety;

  return (
    <Dialog open={safety.killSwitchDialogOpen} onOpenChange={safety.setKillSwitchDialogOpen}>
      <ArtifactDialogContent className="max-w-[420px]">
        <div className="px-6 pb-0 pt-6 text-center">
          <div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive-bg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <ArtifactDialogHeader className="block space-y-0 p-0 text-center">
            <h2 className="text-[15px] font-bold">
              Confirm: {pendingKillSwitchState ? "enable" : "disable"} kill switch
            </h2>
          </ArtifactDialogHeader>
          <DialogDescription className="mt-1 text-[12.5px] text-muted-foreground">
            {pendingKillSwitchState
              ? "This blocks every write across the entire platform, immediately, for every salon. Re-enter your 2FA code to confirm."
              : "This restores normal platform operations. Re-enter your 2FA code to confirm."}
          </DialogDescription>
        </div>

        <div className={cn(ARTIFACT_DIALOG_BODY_PADDING, "items-center")}>
          {pendingKillSwitchState && (
            <div className="space-y-1.5">
              <Label className="text-[11.5px] font-semibold text-muted-foreground">Reason (required)</Label>
              <Textarea
                value={safety.killSwitchReason}
                onChange={(event) => safety.setKillSwitchReason(event.target.value)}
                placeholder="e.g., Emergency maintenance, security incident..."
              />
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <InputOTP
              maxLength={6}
              value={safety.killSwitchTotpToken}
              onChange={(value) => safety.setKillSwitchTotpToken(value)}
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
          {safety.killSwitchSecurityError && (
            <p className="text-sm text-destructive">{safety.killSwitchSecurityError}</p>
          )}
        </div>

        <ArtifactDialogFooter>
          <Button variant="outline" onClick={() => safety.setKillSwitchDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={pendingKillSwitchState ? "destructive" : "default"}
            onClick={safety.confirmKillSwitch}
            disabled={safety.toggleKillSwitchMutation.isPending}
          >
            {safety.toggleKillSwitchMutation.isPending
              ? "Verifying..."
              : pendingKillSwitchState
              ? "Enable kill switch"
              : "Disable kill switch"}
          </Button>
        </ArtifactDialogFooter>
      </ArtifactDialogContent>
    </Dialog>
  );
}
