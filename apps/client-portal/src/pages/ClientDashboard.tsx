import { useEffect, useMemo, useState } from "react";
import { useClientAuth, useClientBookings, useClientPurse, useClientNotifications } from "@/hooks";
import { ClientSidebar } from "@/components/ClientSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Calendar, CreditCard, Bell, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";

export default function ClientDashboard() {
  const { customers, isLoading: authLoading } = useClientAuth();
  const { bookings, nextAppointment, isLoading: bookingsLoading } = useClientBookings("upcoming");
  const { purses, purseGroups, hasMultipleCountries, totalBalance, isLoading: purseLoading } = useClientPurse();
  const { unreadCount, isLoading: notificationsLoading } = useClientNotifications();
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);

  const isLoading = authLoading || bookingsLoading || purseLoading || notificationsLoading;
  const activePurseGroup = useMemo(() => {
    if (!purseGroups.length) return null;
    return purseGroups.find((group) => group.countryCode === selectedCountryCode) || purseGroups[0];
  }, [purseGroups, selectedCountryCode]);

  useEffect(() => {
    if (!purseGroups.length) {
      setSelectedCountryCode(null);
      return;
    }
    setSelectedCountryCode((prev) => (prev && purseGroups.some((group) => group.countryCode === prev) ? prev : purseGroups[0].countryCode));
  }, [purseGroups]);

  // Get the first customer's name for greeting (they may have multiple salon accounts)
  const customerName = customers[0]?.full_name?.split(" ")[0] || "there";

  // Compute outstanding balance from live appointment data.
  // customers.outstanding_balance is a cached column that isn't maintained by the
  // booking/payment flow, so computing directly from appointments is more accurate.
  const totalOutstanding = useMemo(() => {
    return bookings.reduce((sum, b) => {
      if (b.status === "cancelled") return sum;
      if (["fully_paid", "refunded_full"].includes(b.payment_status)) return sum;
      return sum + Math.max(Number(b.total_amount || 0) - Number(b.amount_paid || 0), 0);
    }, 0);
  }, [bookings]);

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
              {totalOutstanding > 0 ? (
                <p className="text-sm text-muted-foreground mt-1">
                  Across {customers.length} salon{customers.length !== 1 ? "s" : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">No outstanding fees</p>
              )}
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
              {hasMultipleCountries
                ? "View your purse balance by country and salon"
                : "Your purse balance at each salon"}
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
                {hasMultipleCountries && activePurseGroup && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Country</span>
                    <Select value={activePurseGroup.countryCode} onValueChange={setSelectedCountryCode}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {purseGroups.map((group) => (
                          <SelectItem key={group.countryCode} value={group.countryCode}>
                            {group.countryLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {customers
                  .filter((customer) => {
                    if (!activePurseGroup) return true;
                    const purse = purses.find((entry) => entry.customer_id === customer.id);
                    return purse
                      ? String(purse.tenant.country || "").toUpperCase() === activePurseGroup.countryCode
                      : false;
                  })
                  .map((customer) => {
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

                {((hasMultipleCountries ? activePurseGroup?.totalBalance : totalBalance) || 0) > 0 && (
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="font-medium">
                      {hasMultipleCountries && activePurseGroup
                        ? `${activePurseGroup.countryLabel} Total`
                        : "Total Balance"}
                    </span>
                    {((hasMultipleCountries ? activePurseGroup?.totalBalance : totalBalance) !== null) && (
                      <span className="font-semibold text-lg">
                        {formatCurrency(
                          Number(hasMultipleCountries ? activePurseGroup?.totalBalance : totalBalance),
                          hasMultipleCountries
                            ? activePurseGroup?.currency || customers[0]?.tenant?.currency || "USD"
                            : customers[0]?.tenant?.currency || "USD",
                        )}
                      </span>
                    )}
                  </div>
                )}

                {hasMultipleCountries && activePurseGroup?.totalBalance === null && (
                  <p className="text-xs text-muted-foreground">
                    Total balance is hidden because this country group contains multiple currencies.
                  </p>
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
