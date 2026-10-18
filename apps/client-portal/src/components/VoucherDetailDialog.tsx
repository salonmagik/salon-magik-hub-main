import { format } from "date-fns";
import type { ClientVoucher } from "@/hooks";
import { isVoucherUnused } from "@/hooks";
import { formatCurrency } from "@shared/currency";
import { voucherStatusMeta } from "@/lib/bookingsOrdersUi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Button } from "@ui/button";
import { Ticket } from "lucide-react";

interface VoucherDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: ClientVoucher | null;
  tenantPhone?: string | null;
}

// Lighter reuse of the same dialog shell as Package/Product detail: header,
// key facts, one action. There is no in-app redemption flow in the client
// portal today (vouchers are applied at checkout on the salon's booking
// site), so "Use now" calls the salon, same as the other dialogs' actions.
export function VoucherDetailDialog({ open, onOpenChange, voucher, tenantPhone }: VoucherDetailDialogProps) {
  if (!voucher) return null;

  const unused = isVoucherUnused(voucher);
  const meta = voucherStatusMeta(voucher.status, unused);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            {formatCurrency(voucher.balance, voucher.tenantCurrency)}
          </DialogTitle>
          <DialogDescription>
            Code {voucher.code}
            {voucher.tenantName ? ` · ${voucher.tenantName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
          <div className="flex items-center justify-between rounded-xl border border-dashed border-[#D9D2E6] p-4">
            <div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", meta.className)}>{meta.label}</span>
              <p className="mt-2 text-xs text-muted-foreground">
                {voucher.expires_at ? `Expires ${format(new Date(voucher.expires_at), "MMM d, yyyy")}` : "No expiry"}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-xs text-muted-foreground">Original value</p>
              <p className="font-semibold">{formatCurrency(voucher.amount, voucher.tenantCurrency)}</p>
            </div>
          </div>

          {unused && (
            <Button className="w-full" disabled={!tenantPhone} asChild={!!tenantPhone}>
              {tenantPhone ? <a href={`tel:${tenantPhone}`}>Use now</a> : <span>Use now</span>}
            </Button>
          )}
          {unused && !tenantPhone && (
            <p className="text-center text-xs text-muted-foreground">
              Contact your salon to redeem this voucher.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
