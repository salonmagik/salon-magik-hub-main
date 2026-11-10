import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import type { UseMutationResult } from "@tanstack/react-query";
import type { Plan } from "../../types";

interface DeletePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Plan | null;
  reason: string;
  setReason: (value: string) => void;
  totp: string;
  setTotp: (value: string) => void;
  mutation: UseMutationResult<{ status?: "deleted" | "archived" }, unknown, { planId: string; reason: string; totpCode: string }>;
  onSaved: () => void;
}

/** Legacy plan-deletion dialog. Preserved as-is; nothing in the current UI opens it
 *  since the product no longer exposes per-plan delete for the single base subscription. */
export function DeletePlanDialog({ open, onOpenChange, target, reason, setReason, totp, setTotp, mutation, onSaved }: DeletePlanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Delete Plan</DialogTitle>
          <DialogDescription>
            Delete is destructive. If the plan is in use, it will be archived instead.
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">Plan: {target?.name || "-"}</div>
            <p className="mt-1 text-muted-foreground">
              Confirm with your 2FA code to continue.
            </p>
          </div>

          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are you deleting this plan?" />
          </div>

          <div>
            <Label>2FA code</Label>
            <Input value={totp} onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || !target || !reason.trim() || totp.length !== 6}
            onClick={() => {
              if (!target) return;
              mutation.mutate(
                { planId: target.id, reason: reason.trim(), totpCode: totp },
                { onSuccess: onSaved },
              );
            }}
          >
            {mutation.isPending ? "Deleting..." : "Delete Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
