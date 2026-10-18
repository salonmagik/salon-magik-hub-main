import { useState, useEffect, useMemo } from "react";
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
import { User, Phone, Package } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrderByBookingReference, type OrderServiceLine } from "@/hooks/useOrderByBookingReference";
import { supabase } from "@/lib/supabase";

export interface EntitlementItem {
  id: string;
  total_quantity: number;
  remaining_quantity: number;
  service: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
}

export interface Entitlement {
  id: string;
  package_id: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  items: EntitlementItem[];
}

interface PackagePurchaseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingReference: string | null;
  // Supplied by the caller only when the current page/tab isn't already
  // the Purchases tab -- when omitted, the dialog shows just a Close
  // button instead of a redundant "go to where you already are" CTA.
  // The resolved entitlement id (best-effort match on the first package
  // line) is passed through so the destination can deep-link straight to
  // that purchase row; it may be undefined if no entitlement was found.
  onNavigateToPurchases?: (purchaseId?: string) => void;
}

// Sessions-used progress per package is tracked in
// customer_package_entitlements / customer_package_entitlement_items, not
// on the appointment_services row itself -- that row only records which
// package was bought and its price. Best-effort match: the most recently
// created entitlement for this customer + package around the purchase, not
// a guaranteed one-to-one join (there's no column linking an entitlement
// directly back to the purchase appointment or booking_reference), so
// session progress is omitted rather than guessed wrong if none is found.
export function usePackageEntitlements(customerId: string | null, packageLines: OrderServiceLine[]) {
  const [entitlements, setEntitlements] = useState<Record<string, Entitlement | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const packageIdsKey = useMemo(
    () => Array.from(new Set(packageLines.map((line) => line.package_id).filter(Boolean))).join(","),
    [packageLines],
  );

  useEffect(() => {
    const packageIds = packageIdsKey ? packageIdsKey.split(",") : [];
    if (!customerId || packageIds.length === 0) {
      setEntitlements({});
      return;
    }
    let cancelled = false;

    setIsLoading(true);
    supabase
      .from("customer_package_entitlements" as never)
      .select(
        "id, package_id, status, starts_at, expires_at, created_at, items:customer_package_entitlement_items(id, total_quantity, remaining_quantity, service:services(id, name), product:products(id, name))",
      )
      .eq("customer_id", customerId)
      .in("package_id", packageIds)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load package entitlements:", error);
          setIsLoading(false);
          return;
        }
        const byPackageId: Record<string, Entitlement | null> = {};
        for (const row of (data || []) as unknown as Entitlement[]) {
          if (!byPackageId[row.package_id]) {
            byPackageId[row.package_id] = row;
          }
        }
        setEntitlements(byPackageId);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, packageIdsKey]);

  return { entitlements, isLoading };
}

// Shows every package purchased in one checkout, reassembled from the
// shared booking_reference (see useOrderByBookingReference). Multiple
// packages in one order each get their own session-progress block.
export function PackagePurchaseDetailDialog({ open, onOpenChange, bookingReference, onNavigateToPurchases }: PackagePurchaseDetailDialogProps) {
  const { currentTenant } = useAuth();
  const { order, isLoading } = useOrderByBookingReference(open ? bookingReference : null);
  const { entitlements } = usePackageEntitlements(order?.customerId ?? null, order?.packages ?? []);
  const currency = currentTenant?.currency || "USD";

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = { NGN: "₦", GHS: "₵", USD: "$", EUR: "€", GBP: "£" };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  const handleGoToPurchases = () => {
    onOpenChange(false);
    const firstPackageLine = order?.packages[0];
    const entitlementId = firstPackageLine?.package_id ? entitlements[firstPackageLine.package_id]?.id : undefined;
    onNavigateToPurchases?.(entitlementId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3 text-2xl">
            <span>Purchase details</span>
            <Badge className="bg-emerald-100 text-emerald-800">Package purchase</Badge>
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
              <p className="text-sm text-muted-foreground">This purchase could not be found.</p>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e1f3ec] text-[#268766]">
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

                {order.packages.map((line) => {
                  const entitlement = line.package_id ? entitlements[line.package_id] : null;
                  return (
                    <div key={line.id} className="rounded-[14px] border border-border/60 bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <p className="font-medium">{line.service_name}</p>
                        </div>
                        <p className="font-semibold">{formatCurrency(Number(line.price))}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Purchased {format(new Date(order.createdAt), "MMM d, yyyy")}
                        {entitlement?.expires_at && ` · Valid until ${format(new Date(entitlement.expires_at), "MMM d, yyyy")}`}
                      </p>

                      {entitlement && entitlement.items.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {entitlement.items.map((item) => {
                            const used = item.total_quantity - item.remaining_quantity;
                            const pct = item.total_quantity > 0 ? Math.round((used / item.total_quantity) * 100) : 0;
                            return (
                              <div key={item.id}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span>{item.service?.name || item.product?.name || "Item"}</span>
                                  <span className="text-muted-foreground">
                                    {used} / {item.total_quantity} used
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full bg-[#268766]" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-3">Session progress not available yet.</p>
                      )}
                    </div>
                  );
                })}

                <div className="space-y-2 rounded-[14px] border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(order.totalAmount)}</span>
                  </div>
                  {order.storeCreditPaid > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Paid via store credit</span>
                      <span>{formatCurrency(order.storeCreditPaid)}</span>
                    </div>
                  )}
                  {order.storeCreditPaid > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Received</span>
                      <span>{formatCurrency(order.otherPaid)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-dashed pt-2">
                    <span className="text-sm text-muted-foreground">Total paid</span>
                    <span className="font-semibold text-lg">{formatCurrency(order.amountPaid || order.totalAmount)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full px-6" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onNavigateToPurchases && (
            <Button className="rounded-full px-7" onClick={handleGoToPurchases}>
              Go to Purchases
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
