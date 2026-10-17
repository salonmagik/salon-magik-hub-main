import { format } from "date-fns";
import type { ClientProductOrder } from "@/hooks";
import { formatCurrency } from "@shared/currency";
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
import { Check, ShoppingBag } from "lucide-react";

interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ClientProductOrder | null;
  tenantPhone?: string | null;
}

const STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "pending_ready", label: "Pending at the salon" },
  { key: "fulfilled", label: "Fulfilled" },
] as const;

function stepIndexFor(status: string): number {
  if (status === "fulfilled") return 2;
  if (status === "ready" || status === "pending") return 1;
  return 0;
}

export function ProductDetailDialog({ open, onOpenChange, order, tenantPhone }: ProductDetailDialogProps) {
  if (!order) return null;

  const cancelled = order.fulfillment_status === "cancelled";
  const activeStep = stepIndexFor(order.fulfillment_status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            {order.product_name}
          </DialogTitle>
          <DialogDescription>
            Ordered {format(new Date(order.created_at), "MMM d, yyyy")}
            {order.tenantName ? ` · ${order.tenantName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-6")}>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</p>
            {cancelled ? (
              <div className="rounded-xl border border-black/10 p-4">
                <span className="rounded-full bg-[#FEE2E2] px-2.5 py-1 text-xs font-medium text-[#991B1B]">
                  Order cancelled
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-black/10 p-4">
                {STEPS.map((step, index) => {
                  const done = index < activeStep || (index === activeStep && index === 2);
                  const current = index === activeStep && index !== 2;
                  return (
                    <div key={step.key}>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                            done ? "bg-[#E8F8EE] text-[#15834B]" : current ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#F0ECE1] text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="h-3 w-3" /> : index + 1}
                        </div>
                        <div className={cn(index > activeStep && "opacity-45")}>
                          <p className="text-sm font-semibold">{step.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {index === 0
                              ? format(new Date(order.created_at), "MMM d, yyyy, h:mm a")
                              : index === 1
                                ? current
                                  ? "Being prepared"
                                  : done
                                    ? "Done"
                                    : "Not yet"
                                : order.fulfilled_at
                                  ? format(new Date(order.fulfilled_at), "MMM d, yyyy, h:mm a")
                                  : "Not yet"}
                          </p>
                        </div>
                      </div>
                      {index < STEPS.length - 1 && (
                        <div className="ml-[10px] h-5 w-0.5 bg-[#EAE4D8]" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Order details</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Amount paid</p>
                <p className="font-semibold">{formatCurrency(order.total_price, order.tenantCurrency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quantity</p>
                <p className="font-semibold">{order.quantity}</p>
              </div>
            </div>
          </div>

          <Button className="w-full" disabled={!tenantPhone} asChild={!!tenantPhone}>
            {tenantPhone ? <a href={`tel:${tenantPhone}`}>Contact the salon</a> : <span>Contact the salon</span>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
