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
import { User, Phone, Calendar, ShoppingBag, Package, Ticket } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrderByBookingReference } from "@/hooks/useOrderByBookingReference";
import { usePackageEntitlements } from "@/components/PackagePurchaseDetailDialog";

interface MixedPurchaseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingReference: string | null;
  // Each is supplied by the caller only when the current page/tab isn't
  // already the matching destination -- when omitted, that section's
  // button doesn't render instead of pointing at where the user already
  // is. purchaseId (passed to onNavigateToPurchases) is a best-effort
  // entitlement match on the first package line and may be undefined.
  onNavigateToAppointments?: (appointmentId: string) => void;
  onNavigateToFulfillment?: (orderId: string) => void;
  onNavigateToPurchases?: (purchaseId?: string) => void;
}

// A mixed order (any combination of two or more of service/package/product
// in one checkout) has no single appointment row that represents "the
// whole order" -- this is the standalone Order Summary modal the Routing
// Rules artboard calls for: no tab navigation, just every line item
// grouped by kind, reassembled from the shared booking_reference via
// useOrderByBookingReference.
export function MixedPurchaseDetailDialog({
  open,
  onOpenChange,
  bookingReference,
  onNavigateToAppointments,
  onNavigateToFulfillment,
  onNavigateToPurchases,
}: MixedPurchaseDetailDialogProps) {
  const { currentTenant } = useAuth();
  const { order, isLoading } = useOrderByBookingReference(open ? bookingReference : null);
  const { entitlements } = usePackageEntitlements(order?.customerId ?? null, order?.packages ?? []);
  const currency = currentTenant?.currency || "USD";

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { NGN: "₦", GHS: "₵", USD: "$", EUR: "€", GBP: "£" };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  const handleOpenAppointments = () => {
    onOpenChange(false);
    const appointmentId = order?.services[0]?.appointment_id;
    if (appointmentId) onNavigateToAppointments?.(appointmentId);
  };

  const handleOpenFulfillment = () => {
    onOpenChange(false);
    if (bookingReference) onNavigateToFulfillment?.(bookingReference);
  };

  const handleOpenPurchases = () => {
    onOpenChange(false);
    const firstPackageLine = order?.packages[0];
    const entitlementId = firstPackageLine?.package_id ? entitlements[firstPackageLine.package_id]?.id : undefined;
    onNavigateToPurchases?.(entitlementId);
  };

  const subtotal = order ? order.totalAmount + (order.voucher?.discount_amount || 0) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3 text-2xl">
            <span>Order summary</span>
            <Badge className="bg-indigo-100 text-indigo-800">Mixed order</Badge>
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
                  <div className="flex-1">
                    <p className="font-medium">{order.customer?.full_name || "Walk-in Customer"}</p>
                    {order.customer?.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {order.customer.phone}
                      </p>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{order.bookingReference}</p>
                </div>

                {order.services.length > 0 && (
                  <div className="rounded-[14px] border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Services</p>
                    </div>
                    <div className="space-y-2">
                      {order.services.map((service) => (
                        <div key={service.id} className="flex items-center justify-between text-sm border-b border-dashed last:border-0 py-1.5">
                          <div>
                            <p>{service.service_name}</p>
                            <p className="text-xs text-muted-foreground">{service.duration_minutes || 0} min</p>
                          </div>
                          <p className="font-medium">{formatCurrency(Number(service.price))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {order.products.length > 0 && (
                  <div className="rounded-[14px] border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Products</p>
                    </div>
                    <div className="space-y-2">
                      {order.products.map((product) => (
                        <div key={product.id} className="flex items-center justify-between text-sm border-b border-dashed last:border-0 py-1.5">
                          <div>
                            <p>
                              {product.product_name} <span className="text-muted-foreground">x{product.quantity}</span>
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">{product.fulfillment_type} - {product.fulfillment_status}</p>
                          </div>
                          <p className="font-medium">{formatCurrency(Number(product.total_price))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {order.packages.length > 0 && (
                  <div className="rounded-[14px] border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Packages</p>
                    </div>
                    <div className="space-y-2">
                      {order.packages.map((pkg) => (
                        <div key={pkg.id} className="flex items-center justify-between text-sm border-b border-dashed last:border-0 py-1.5">
                          <p>{pkg.service_name}</p>
                          <p className="font-medium">{formatCurrency(Number(pkg.price))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {order.voucher && (
                  <div className="flex items-center gap-2 rounded-[14px] bg-[#f1eafa] p-3">
                    <Ticket className="w-4 h-4 text-primary" />
                    <span className="flex-1 text-sm">Voucher applied</span>
                    <span className="text-sm font-medium text-primary">-{formatCurrency(Number(order.voucher.discount_amount))}</span>
                  </div>
                )}

                <div className="rounded-[14px] border border-border/60 bg-card p-4 space-y-1.5">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {order.voucher && order.voucher.discount_amount > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Voucher discount</span>
                      <span>-{formatCurrency(Number(order.voucher.discount_amount))}</span>
                    </div>
                  )}
                  {order.storeCreditPaid > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Paid via store credit</span>
                      <span>{formatCurrency(order.storeCreditPaid)}</span>
                    </div>
                  )}
                  {order.storeCreditPaid > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Received</span>
                      <span>{formatCurrency(order.otherPaid)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-sm font-medium">Total paid</span>
                    <span className="font-semibold text-lg">{formatCurrency(order.amountPaid || order.totalAmount)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {order.services.length > 0 && onNavigateToAppointments && (
                    <Button variant="outline" size="sm" className="rounded-full" onClick={handleOpenAppointments}>
                      Open in Appointments
                    </Button>
                  )}
                  {order.products.length > 0 && onNavigateToFulfillment && (
                    <Button variant="outline" size="sm" className="rounded-full" onClick={handleOpenFulfillment}>
                      Open in Fulfillment
                    </Button>
                  )}
                  {order.packages.length > 0 && onNavigateToPurchases && (
                    <Button variant="outline" size="sm" className="rounded-full" onClick={handleOpenPurchases}>
                      Open in Purchases
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full px-6 w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
