import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { DateRangePicker, type DateRangePreset } from "@ui/date-range-picker";
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  MoreHorizontal,
} from "lucide-react";
import { useProductFulfillment, type FulfillmentItem, type ProductFulfillmentType } from "@/hooks/useProductFulfillment";
import { useOrderByBookingReference } from "@/hooks/useOrderByBookingReference";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@shared/utils";

const statusConfig = {
  pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
  ready: { label: "Ready", variant: "default" as const, icon: Package },
  fulfilled: { label: "Fulfilled", variant: "outline" as const, icon: CheckCircle2 },
};

type FulfillmentTypeFilter = "all" | ProductFulfillmentType;

const RANGE_PRESETS: DateRangePreset[] = [
  { label: "Today", getRange: () => { const now = new Date(); return { from: now, to: now }; } },
  { label: "Last 7 days", getRange: () => { const now = new Date(); return { from: subDays(now, 6), to: now }; } },
  { label: "Last 30 days", getRange: () => { const now = new Date(); return { from: subDays(now, 29), to: now }; } },
  { label: "This month", getRange: () => { const now = new Date(); return { from: startOfMonth(now), to: endOfMonth(now) }; } },
];

export function ProductFulfillmentTab() {
  const { currentTenant } = useAuth();
  const { items, stats, isLoading, updateStatus } = useProductFulfillment();
  const currency = currentTenant?.currency || "USD";
  const [typeFilter, setTypeFilter] = useState<FulfillmentTypeFilter>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightedProductIds, setHighlightedProductIds] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // Deep-link support: a notification (or the Product Order detail dialog's
  // "Go to Fulfillment" CTA) points here with ?orderId=<booking_reference>.
  // Mirrors the pattern in AppointmentsPage.tsx -- fetch the order directly
  // (instead of trusting it's already in `items`' default view), derive its
  // date so the date-range filter doesn't hide it, and if any of its lines
  // are already fulfilled, lift the hardcoded fulfilled-filter for just
  // those lines so a notification about an already-fulfilled order is
  // still visible.
  const orderId = searchParams.get("orderId");
  const { order: highlightedOrder } = useOrderByBookingReference(orderId);

  useEffect(() => {
    if (!orderId || !highlightedOrder) return;

    setHighlightedProductIds(new Set(highlightedOrder.products.map((p) => p.id)));
    setDateRange({ from: new Date(highlightedOrder.createdAt), to: new Date(highlightedOrder.createdAt) });
    setTypeFilter("all");

    const next = new URLSearchParams(searchParams);
    next.delete("orderId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, highlightedOrder]);

  useEffect(() => {
    if (highlightedProductIds.size === 0) return;
    const firstId = highlightedProductIds.values().next().value;
    const row = firstId ? rowRefs.current[firstId] : null;
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedProductIds, items]);

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      NGN: "₦",
      GHS: "₵",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  // Filter out fulfilled items from the main view (show pending and ready),
  // then apply the fulfillment-type and date-range filters on top.
  const activeItems = useMemo(() => {
    return items.filter((i) => {
      if (i.fulfillment_status === "fulfilled" && !highlightedProductIds.has(i.id)) return false;
      if (typeFilter !== "all" && i.fulfillment_type !== typeFilter) return false;
      if (dateRange.from || dateRange.to) {
        const createdAt = new Date(i.created_at);
        const inRange =
          (!dateRange.from || createdAt >= startOfDay(dateRange.from)) &&
          (!dateRange.to || createdAt <= endOfDay(dateRange.to));
        if (!inRange && !highlightedProductIds.has(i.id)) return false;
      }
      return true;
    });
  }, [items, typeFilter, dateRange, highlightedProductIds]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const statCards: Array<{ key: keyof typeof stats; label: string; icon: typeof Clock; bg: string; color: string }> = [
    { key: "pending", label: "Pending", icon: Clock, bg: "bg-warning/20", color: "text-warning-foreground" },
    { key: "ready", label: "Ready", icon: Package, bg: "bg-primary/20", color: "text-primary" },
    { key: "completedToday", label: "Completed Today", icon: CheckCircle2, bg: "bg-success/20", color: "text-success" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(({ key, label, icon: Icon, bg, color }) => {
          const count = stats[key];
          return (
            <Card key={key}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", bg)}>
                  <Icon className={cn("w-5 h-5", color)} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{count.pickup + count.delivery}</p>
                  <p className="text-xs text-muted-foreground">
                    {count.pickup} pickup · {count.delivery} delivery
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {([
            { key: "all", label: "All" },
            { key: "pickup", label: "Pickup" },
            { key: "delivery", label: "Delivery" },
          ] as const).map((option) => (
            <button
              key={option.key}
              onClick={() => setTypeFilter(option.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm transition-colors",
                typeFilter === option.key ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onChange={(range) => setDateRange(range)}
          onClear={() => setDateRange({})}
          clearLabel="All time"
          placeholder="All time"
          presets={RANGE_PRESETS}
          className="h-10 w-[138px] shrink-0 rounded-[10px] bg-white shadow-sm sm:w-auto sm:min-w-[200px]"
        />
      </div>

      {activeItems.length === 0 ? (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No pending product orders</p>
          <p className="text-sm text-muted-foreground mt-1">
            Products purchased during bookings will appear here
          </p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeItems.map((item: FulfillmentItem) => {
                const config = statusConfig[item.fulfillment_status as keyof typeof statusConfig];
                const StatusIcon = config?.icon || Clock;

                return (
                  <TableRow
                    key={item.id}
                    ref={(el) => {
                      rowRefs.current[item.id] = el;
                    }}
                    className={cn(highlightedProductIds.has(item.id) && "bg-primary/5 ring-1 ring-primary/30")}
                  >
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(item.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">{item.customer_name}</TableCell>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell>{formatCurrency(Number(item.total_price))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 capitalize">
                        {item.fulfillment_type === "delivery" ? (
                          <Truck className="w-3 h-3" />
                        ) : (
                          <Package className="w-3 h-3" />
                        )}
                        {item.fulfillment_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={config?.variant || "secondary"}
                        className="gap-1"
                      >
                        <StatusIcon className="w-3 h-3" />
                        {config?.label || item.fulfillment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {item.fulfillment_status === "pending" && (
                            <DropdownMenuItem
                              onClick={() => updateStatus(item.id, "ready")}
                            >
                              <Package className="w-4 h-4 mr-2" />
                              {item.fulfillment_type === "delivery" ? "Mark Ready for Delivery" : "Mark Ready for Pickup"}
                            </DropdownMenuItem>
                          )}
                          {(item.fulfillment_status === "pending" ||
                            item.fulfillment_status === "ready") && (
                            <DropdownMenuItem
                              onClick={() => updateStatus(item.id, "fulfilled")}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              {item.fulfillment_type === "delivery" ? "Mark Delivered" : "Mark Picked Up"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
