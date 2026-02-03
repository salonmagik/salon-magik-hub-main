import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { useProductFulfillment, type FulfillmentItem } from "@/hooks/useProductFulfillment";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const statusConfig = {
  pending: { label: "Pending", variant: "secondary" as const, icon: Clock },
  ready: { label: "Ready", variant: "default" as const, icon: Package },
  fulfilled: { label: "Fulfilled", variant: "outline" as const, icon: CheckCircle2 },
};

export function ProductFulfillmentTab() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const { items, stats, isLoading, updateStatus } = useProductFulfillment();
  const currency = currentTenant?.currency || "USD";

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

  // Filter out fulfilled items from main view (show pending and ready)
  const activeItems = items.filter((i) => i.fulfillment_status !== "fulfilled");

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/20">
              <Clock className="w-5 h-5 text-warning-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Pickup</p>
              <p className="text-2xl font-semibold">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ready for Pickup</p>
              <p className="text-2xl font-semibold">{stats.ready}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/20">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fulfilled Today</p>
              <p className="text-2xl font-semibold">{stats.fulfilledToday}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fulfillment Table */}
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
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeItems.map((item) => {
                const config = statusConfig[item.fulfillment_status as keyof typeof statusConfig];
                const StatusIcon = config?.icon || Clock;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(item.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">{item.customer_name}</TableCell>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell>{formatCurrency(Number(item.total_price))}</TableCell>
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
                              Mark Ready
                            </DropdownMenuItem>
                          )}
                          {(item.fulfillment_status === "pending" ||
                            item.fulfillment_status === "ready") && (
                            <DropdownMenuItem
                              onClick={() => updateStatus(item.id, "fulfilled")}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Mark Fulfilled
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => navigate("/salon/appointments")}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View Appointment
                          </DropdownMenuItem>
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
