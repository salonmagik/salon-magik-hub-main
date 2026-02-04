import { useClientAuth } from "@/hooks/client/useClientAuth";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, CreditCard, Bell, Gift, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientDashboard() {
  const { customers, isLoading } = useClientAuth();

  // Get the first customer's name for greeting (they may have multiple salon accounts)
  const customerName = customers[0]?.full_name?.split(" ")[0] || "there";

  return (
    <ClientSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back, {customerName}!
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your bookings and account across {customers.length} salon{customers.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Next Appointment */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Next Appointment
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    No upcoming appointments
                  </p>
                  <Button variant="link" className="p-0 h-auto mt-2" asChild>
                    <Link to="/client/bookings">
                      View all bookings
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Outstanding Fees */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Outstanding Fees
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600">$0.00</div>
                  <p className="text-xs text-muted-foreground">
                    No outstanding fees
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Notifications
              </CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">
                    Unread messages
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Purse Balances per Salon */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Store Credits</CardTitle>
            <CardDescription>
              Your purse balance at each salon
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : customers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No salon accounts found
              </p>
            ) : (
              <div className="space-y-3">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {customer.tenant.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{customer.tenant.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {customer.visit_count} visit{customer.visit_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">$0.00</p>
                      <p className="text-xs text-muted-foreground">Balance</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
            <Link to="/client/bookings">
              <Calendar className="h-5 w-5" />
              <span>View Bookings</span>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
            <Link to="/client/history">
              <Clock className="h-5 w-5" />
              <span>View History</span>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
            <Link to="/client/refunds">
              <Gift className="h-5 w-5" />
              <span>Refunds & Credits</span>
            </Link>
          </Button>
        </div>
      </div>
    </ClientSidebar>
  );
}
