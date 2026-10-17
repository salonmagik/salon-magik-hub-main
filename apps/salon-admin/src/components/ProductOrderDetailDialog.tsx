import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { User, Phone, Package, Truck, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrderByBookingReference } from "@/hooks/useOrderByBookingReference";

const fulfillmentStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  ready: { label: "Ready", className: "bg-primary/10 text-primary" },
  fulfilled: { label: "Fulfilled", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-800" },
};

interface ProductOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingReference: string | null;
}

// Shows every product purchased in one checkout, reassembled from the
// shared booking_reference (see useOrderByBookingReference) instead of
// relying on the single appointment row the notification happened to
// point at -- fixes a product-only order that had more than one product
// line previously only ever showing its first line item.
export function ProductOrderDetailDialog({ open, onOpenChange, bookingReference }: ProductOrderDetailDialogProps) {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const { order, isLoading } = useOrderByBookingReference(open ? bookingReference : null);
  const currency = currentTenant?.currency || "USD";

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { NGN: "₦", GHS: "₵", USD: "$", EUR: "€", GBP: "£" };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  const handleGoToFulfillment = () => {
    onOpenChange(false);
    navigate("/salon/products?subtab=fulfillment");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3 text-2xl">
            <span>Order details</span>
            <Badge className="bg-amber-100 text-amber-800">Product order</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
          <div className="space-y-4 px-5 py-5 sm:px-8">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !order ? (
              <p className="text-sm text-muted-foreground">This order could not be found.</p>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f1eafa] text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{order.customer?.full_name || "Walk-in Customer"}</p>
                    {order.customer?.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {order.customer.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[14px] border border-border/60 bg-card p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Reference</p>
                    <p className="font-mono text-sm font-medium mt-1">{order.bookingReference}</p>
                  </div>
                  <div className="rounded-[14px] border border-border/60 bg-card p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Fulfillment</p>
                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5 capitalize">
                      {order.products[0]?.fulfillment_type === "delivery" ? (
                        <Truck className="w-3.5 h-3.5" />
                      ) : (
                        <Package className="w-3.5 h-3.5" />
                      )}
                      {order.products[0]?.fulfillment_type || "pickup"}
                    </p>
                  </div>
                </div>

                <div className="rounded-[14px] border border-border/60 bg-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                    <p className="font-medium">Products</p>
                  </div>
                  <div className="space-y-2">
                    {order.products.map((product) => {
                      const statusConf = fulfillmentStatusConfig[product.fulfillment_status] || fulfillmentStatusConfig.pending;
                      return (
                        <div
                          key={product.id}
                          className="flex items-center justify-between gap-3 border-b border-dashed last:border-0 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#fff2ce] text-[#8a6510]">
                              <ShoppingBag className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{product.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Qty {product.quantity} x {formatCurrency(Number(product.unit_price))}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm">{formatCurrency(Number(product.total_price))}</p>
                            <Badge variant="secondary" className={`${statusConf.className} mt-1`}>
                              {statusConf.label}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[14px] border border-border/60 bg-card p-4">
                  <span className="text-sm text-muted-foreground">Total paid</span>
                  <span className="font-semibold text-lg">{formatCurrency(order.amountPaid || order.totalAmount)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full px-6" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="rounded-full px-7" onClick={handleGoToFulfillment}>
            Go to Fulfillment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
