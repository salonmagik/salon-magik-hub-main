import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientTransactions, useClientBookings } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { CreditCard, Calendar, ArrowUpRight, ArrowDownLeft, Store } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";

export default function ClientHistoryPage() {
  const { transactions, isLoading: txLoading } = useClientTransactions();
  const { bookings, isLoading: bookingsLoading } = useClientBookings("completed");

  const typeLabels: Record<string, string> = {
    payment: "Payment",
    deposit: "Deposit",
    refund: "Refund",
    purse_topup: "Purse Top-up",
    purse_redemption: "Purse Redemption",
  };

  const getTypeColor = (type: string) => {
    if (type === "refund" || type === "purse_redemption") return "text-green-600";
    return "text-foreground";
  };

  const getTypeIcon = (type: string) => {
    if (type === "refund" || type === "purse_topup") {
      return <ArrowDownLeft className="h-4 w-4 text-green-600" />;
    }
    return <ArrowUpRight className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">History</h1>
          <p className="text-muted-foreground mt-1">
            View your transaction and booking history
          </p>
        </div>

        <Tabs defaultValue="transactions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transactions" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="bookings" className="gap-2">
              <Calendar className="h-4 w-4" />
              Past Bookings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>
                  All your past transactions across salons
                </CardDescription>
              </CardHeader>
              <CardContent>
                {txLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between items-center">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-6 w-20" />
                      </div>
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No transaction history
                  </p>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            {getTypeIcon(tx.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {typeLabels[tx.type] || tx.type}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {tx.method}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Store className="h-3 w-3" />
                              {tx.tenant?.name || "Salon"}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(tx.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${getTypeColor(tx.type)}`}>
                            {tx.type === "refund" ? "+" : ""}
                            {formatCurrency(tx.amount, tx.currency)}
                          </p>
                          <Badge
                            variant="secondary"
                            className={tx.status === "completed" ? "bg-green-100 text-green-800" : ""}
                          >
                            {tx.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle>Past Bookings</CardTitle>
                <CardDescription>
                  Completed appointments history
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bookingsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : bookings.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No completed bookings
                  </p>
                ) : (
                  <div className="space-y-4">
                    {bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="p-4 rounded-lg border"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Store className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{booking.tenant?.name}</span>
                            </div>
                            {booking.scheduled_start && (
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(booking.scheduled_start), "EEEE, MMMM d, yyyy")}
                              </p>
                            )}
                            {booking.services && booking.services.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {booking.services.map((s) => (
                                  <Badge key={s.id} variant="secondary" className="text-xs">
                                    {s.service_name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {formatCurrency(booking.total_amount, booking.tenant?.currency || "USD")}
                            </p>
                            <Badge className="bg-green-100 text-green-800">Completed</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ClientSidebar>
  );
}
