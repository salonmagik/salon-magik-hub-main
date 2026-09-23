import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { Badge } from "@ui/badge";
import { AlertCircle, RotateCcw, Building2, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@shared/utils";
import { formatCurrency } from "@shared/currency";
import type { SalonWithdrawal } from "@/hooks/useWithdrawals";
import type { PayoutDestination } from "@/hooks/usePayoutDestinations";

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", label: "Pending" },
  completed: { bg: "bg-success/10", text: "text-success", label: "Completed" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", label: "Failed" },
  reversed: { bg: "bg-warning-bg", text: "text-warning-foreground", label: "Reversed" },
};

function getSalonFacingStatus(status: string | null | undefined): string {
  return status === "awaiting_otp" ? "pending" : status || "pending";
}

interface WithdrawalDetailDialogProps {
  withdrawal: SalonWithdrawal | null;
  destination: PayoutDestination | undefined;
  onOpenChange: (open: boolean) => void;
}

export function WithdrawalDetailDialog({ withdrawal, destination, onOpenChange }: WithdrawalDetailDialogProps) {
  if (!withdrawal) return null;

  const status = getSalonFacingStatus(withdrawal.status);
  const style = statusStyles[status] || statusStyles.pending;
  const isFailed = status === "failed";
  const isReversed = status === "reversed";
  const isPending = status === "pending";
  const isMomo = destination?.destination_type === "mobile_money";
  const destName = destination
    ? (isMomo ? destination.momo_provider : destination.bank_name) || "Payout account"
    : "Payout account";
  const destAccount = destination ? (isMomo ? destination.momo_number : destination.account_number) : null;

  return (
    <Dialog open={!!withdrawal} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>{formatCurrency(Number(withdrawal.amount), withdrawal.currency)}</span>
            <Badge className={cn("text-xs shrink-0", style.bg, style.text)}>{style.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-5")}>
          {isFailed && (
            <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">This withdrawal couldn't be completed</p>
                <p className="text-xs text-destructive/90 mt-0.5">
                  {withdrawal.failure_reason || "Contact support for details."}
                </p>
              </div>
            </div>
          )}

          {isReversed && (
            <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning-bg p-3">
              <RotateCcw className="h-4 w-4 shrink-0 mt-0.5 text-warning-foreground" />
              <div>
                <p className="text-sm font-medium text-warning-foreground">Reversed by the payout provider</p>
                <p className="text-xs text-warning-foreground/90 mt-0.5">
                  The full amount has been returned to your salon balance.
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Destination</p>
            <div className="flex items-center gap-3 rounded-lg bg-surface p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                {isMomo ? <Smartphone className="h-4 w-4 text-muted-foreground" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="text-sm font-medium">{destName}</p>
                {destAccount && <p className="text-xs text-muted-foreground mt-0.5">•• {destAccount.slice(-4)}</p>}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Amount breakdown</p>
            <div className="rounded-lg border divide-y text-sm">
              <div className="flex justify-between px-3 py-2.5">
                <span className="text-muted-foreground">Withdrawal amount</span>
                <span className="font-medium">{formatCurrency(Number(withdrawal.amount), withdrawal.currency)}</span>
              </div>
              {withdrawal.fee_version && (
                <>
                  <div className="flex justify-between px-3 py-2.5">
                    <span className="text-muted-foreground">Quoted transfer fee</span>
                    <span>{formatCurrency(Number(withdrawal.transfer_fee), withdrawal.currency)}</span>
                  </div>
                  {Number(withdrawal.stamp_duty) > 0 && (
                    <div className="flex justify-between px-3 py-2.5">
                      <span className="text-muted-foreground">Stamp duty</span>
                      <span>{formatCurrency(Number(withdrawal.stamp_duty), withdrawal.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-3 py-2.5 bg-surface font-medium">
                    <span>Deducted from balance</span>
                    <span>{formatCurrency(Number(withdrawal.wallet_debited), withdrawal.currency)}</span>
                  </div>
                </>
              )}
            </div>
            {withdrawal.fee_reconciliation_required && (
              <p className="text-xs text-amber-700 mt-1.5">Transfer reversed; provider fee refund awaiting reconciliation.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Timeline</p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-1">
                  <p className="text-sm font-medium">Requested</p>
                  {withdrawal.requested_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(withdrawal.requested_at), "MMM d, yyyy 'at' h:mm a")}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <div className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: isPending ? "hsl(var(--border))" : isFailed ? "hsl(var(--destructive))" : isReversed ? "hsl(var(--warning))" : "hsl(var(--success))" }} />
                <div>
                  <p className="text-sm font-medium">{style.label}</p>
                  {isPending && <p className="text-xs text-muted-foreground mt-0.5">We'll email you the moment this clears.</p>}
                </div>
              </div>
            </div>
          </div>

          {(withdrawal.paystack_transfer_code || withdrawal.paystack_reference) && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Reference</p>
              <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                <span className="text-xs font-mono text-muted-foreground">{withdrawal.paystack_transfer_code || withdrawal.paystack_reference}</span>
                <span className="text-[11px] text-muted-foreground/70">for support</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
