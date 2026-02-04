import { ClientSidebar } from "@/components/client/ClientSidebar";
import { useClientRefunds } from "@/hooks/client/useClientRefunds";
import { useClientPurse } from "@/hooks/client/useClientPurse";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCcw, Wallet, Clock, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/currency";

export default function ClientRefundsPage() {
  const { refunds, pendingRefunds, approvedRefunds, rejectedRefunds, isLoading: refundsLoading } = useClientRefunds();
  const { purses, totalBalance, isLoading: purseLoading } = useClientPurse();

  const isLoading = refundsLoading || purseLoading;

  const statusIcons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-4 w-4 text-yellow-600" />,
    approved: <CheckCircle className="h-4 w-4 text-green-600" />,
    completed: <CheckCircle className="h-4 w-4 text-green-600" />,
    rejected: <XCircle className="h-4 w-4 text-red-600" />,
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    completed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Refunds & Credits</h1>
          <p className="text-muted-foreground mt-1">
            Manage refund requests and store credits
          </p>
        </div>

        <Tabs defaultValue="refunds" className="space-y-4">
          <TabsList>
            <TabsTrigger value="refunds" className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Refund Requests
              {pendingRefunds.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pendingRefunds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="credits" className="gap-2">
              <Wallet className="h-4 w-4" />
              Store Credits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="refunds">
            <Card>
              <CardHeader>
                <CardTitle>Refund Requests</CardTitle>
                <CardDescription>
                  Your refund requests and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : refunds.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No refund requests
                  </p>
                ) : (
                  <div className="space-y-4">
                    {refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="flex items-start justify-between p-4 rounded-lg border"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {statusIcons[refund.status]}
                            <Badge className={statusColors[refund.status]}>
                              {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                            </Badge>
                            <Badge variant="outline">
                              {refund.refund_type === "store_credit" ? "Store Credit" : 
                               refund.refund_type === "original_method" ? "Original Method" : "Offline"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {refund.tenant?.name || "Salon"}
                          </p>
                          <p className="text-sm">{refund.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested {format(new Date(refund.created_at), "MMM d, yyyy")}
                          </p>
                          {refund.rejection_reason && (
                            <p className="text-sm text-red-600 mt-2">
                              Rejection reason: {refund.rejection_reason}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {formatCurrency(refund.amount, refund.tenant?.currency || "USD")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="credits">
            <Card>
              <CardHeader>
                <CardTitle>Store Credits</CardTitle>
                <CardDescription>
                  Credits received from refunds and promotions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : purses.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No store credits
                  </p>
                ) : (
                  <div className="space-y-4">
                    {purses.map((purse) => (
                      <div
                        key={purse.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Wallet className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{purse.tenant?.name || "Salon"}</p>
                            <p className="text-sm text-muted-foreground">
                              Last updated {format(new Date(purse.updated_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold">
                            {formatCurrency(purse.balance, purse.tenant?.currency || "USD")}
                          </p>
                          <p className="text-xs text-muted-foreground">Available</p>
                        </div>
                      </div>
                    ))}

                    {totalBalance > 0 && (
                      <div className="pt-4 border-t flex justify-between items-center">
                        <span className="font-medium">Total Store Credits</span>
                        <span className="font-semibold text-lg text-primary">
                          {formatCurrency(totalBalance, purses[0]?.tenant?.currency || "USD")}
                        </span>
                      </div>
                    )}
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
