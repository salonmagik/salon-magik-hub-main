import { useClientAuth, useClientBookings, useClientPurse, useClientNotifications } from "@/hooks";
import { ClientSidebar } from "@/components/ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Calendar, CreditCard, Bell, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";

export default function ClientDashboard() {
  const { customers, isLoading: authLoading } = useClientAuth();
  const { nextAppointment, isLoading: bookingsLoading } = useClientBookings("upcoming");
  const { purses, totalBalance, isLoading: purseLoading } = useClientPurse();
  const { unreadCount, isLoading: notificationsLoading } = useClientNotifications();

  const isLoading = authLoading || bookingsLoading || purseLoading || notificationsLoading;

  // Get the first customer's name for greeting (they may have multiple salon accounts)
  const customerName = customers[0]?.full_name?.split(" ")[0] || "there";

  // Calculate total outstanding balance across all salons
  const totalOutstanding = customers.reduce((sum, c) => sum + Number(c.outstanding_balance || 0), 0);

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1>Welcome back, {customerName}</h1>
          <p className="text-muted-foreground mt-2">
            Manage your bookings, track payments, and stay updated across all your salons
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Next Appointment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : nextAppointment ? (
                <>
                  <p className="text-2xl font-bold">
                    {format(new Date(nextAppointment.scheduled_start!), "MMM d")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(nextAppointment.scheduled_start!), "h:mm a")} at{" "}
                    {nextAppointment.tenant?.name || "Salon"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No upcoming appointments</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Outstanding Fees
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold">
                  {formatCurrency(totalOutstanding, customers[0]?.tenant?.currency || "USD")}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Across {customers.length} salon{customers.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-bold">{unreadCount}</p>}
              <p className="text-sm text-muted-foreground mt-1">
                Unread updates
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Store Credits</CardTitle>
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
                {customers.map((customer) => {
                  const purse = purses.find((p) => p.customer_id === customer.id);
                  const balance = purse?.balance || 0;

                  return (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">{customer.tenant.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {customer.visit_count} visit{customer.visit_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatCurrency(balance, customer.tenant.currency)}
                      </p>
                    </div>
                  );
                })}

                {totalBalance > 0 && (
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="font-medium">Total Balance</span>
                    <span className="font-semibold text-lg">
                      {formatCurrency(totalBalance, customers[0]?.tenant?.currency || "USD")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <Button variant="outline" asChild>
                <Link to="/bookings">View All Bookings</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/history">Transaction History</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/notifications">Check Notifications</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientSidebar>
  );
}
