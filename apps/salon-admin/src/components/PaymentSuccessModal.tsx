import { type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@ui/dialog";
import { Button } from "@ui/button";

export interface PaymentSuccessModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  detail?: ReactNode;
  primaryAction?: {
    label: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  closeLabel?: string;
}

export function PaymentSuccessModal({
  open,
  onClose,
  title,
  description,
  detail,
  primaryAction,
  closeLabel = "Done",
}: PaymentSuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col items-center gap-4 pt-2 pb-1 text-center">
          {/* Concentric circles + check */}
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-50">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-9 w-9 text-green-600" strokeWidth={1.8} />
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {detail && (
            <div className="w-full rounded-lg border bg-muted/30 px-4 py-3 text-sm text-left">
              {detail}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.loading}
              className="w-full sm:w-auto"
            >
              {primaryAction.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {primaryAction.label}
            </Button>
          )}
          <Button
            variant={primaryAction ? "ghost" : "default"}
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            {closeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
