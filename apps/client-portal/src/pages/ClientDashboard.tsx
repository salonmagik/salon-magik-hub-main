import { useMemo } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Store,
  WalletCards,
} from "lucide-react";
import { ClientSidebar } from "@/components/ClientSidebar";
import {
  useClientAuth,
  useClientBalance,
  useClientBookings,
  useClientPurse,
} from "@/hooks";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";

const paymentStatusLabels: Record<string, string> = {
  unpaid: "Payment pending",
  deposit_pending: "Deposit pending",
  deposit_paid: "Deposit paid",
  partially_paid: "Partially paid",
  fully_paid: "Paid",
  paid_offline: "Paid offline",
};

function bookingStatus(booking: {
  status: string;
  payment_status: string;
}) {
  if (booking.payment_status && paymentStatusLabels[booking.payment_status]) {
    return paymentStatusLabels[booking.payment_status];
  }
  return booking.status === "scheduled" ? "Confirmed" : booking.status;
}

export default function ClientDashboard() {
  const { customers, isLoading: authLoading } = useClientAuth();
  const {
    bookings,
    nextAppointment,
    isLoading: upcomingLoading,
  } = useClientBookings("upcoming");
  const { bookings: completedBookings, isLoading: historyLoading } =
    useClientBookings("completed");
  const { packages, isLoading: packagesLoading } = useClientBalance();
  const { purses, isLoading: purseLoading } = useClientPurse();

  const customerName = customers[0]?.full_name?.split(" ")[0] || "there";
  const activePackages = packages.filter((item) => item.status === "active");
  const nextService =
    nextAppointment?.services?.map((service) => service.service_name).join(", ") ||
    "your appointment";
  const daysUntilNext =
    nextAppointment?.scheduled_start
      ? differenceInCalendarDays(
          new Date(nextAppointment.scheduled_start),
          new Date(),
        )
      : null;

  const storeCreditBySalon = useMemo(
    () =>
      customers.map((customer) => ({
        customer,
        purse: purses.find((entry) => entry.customer_id === customer.id),
      })),
    [customers, purses],
  );

  const isLoading =
    authLoading ||
    upcomingLoading ||
    packagesLoading ||
    purseLoading ||
    historyLoading;

  return (
    <ClientSidebar>
      <div className="mx-auto w-full max-w-5xl space-y-10 pb-12">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#211337] to-[#382a3f] px-6 py-8 text-white shadow-sm sm:px-10 sm:py-12">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-3/5 bg-white/15" />
              <Skeleton className="h-5 w-2/5 bg-white/10" />
            </div>
          ) : (
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                  {nextAppointment && daysUntilNext !== null
                    ? `Hi ${customerName}, your next visit is ${
                        daysUntilNext === 0
                          ? "today"
                          : daysUntilNext === 1
                            ? "tomorrow"
                            : `in ${daysUntilNext} days`
                      }`
                    : `Hi ${customerName}, ready for your next visit?`}
                </h1>
                <p className="mt-3 max-w-3xl text-base text-white/70">
                  {nextAppointment?.scheduled_start
                    ? `${nextService} at ${nextAppointment.tenant?.name || "your salon"}, ${format(
                        new Date(nextAppointment.scheduled_start),
                        "EEE d MMM, h:mm a",
                      )}`
                    : "Your bookings, packages and salon balances are all in one place."}
                </p>
              </div>
              <Button
                asChild
                className="h-12 shrink-0 rounded-full bg-[#f6c744] px-8 text-base text-[#171115] hover:bg-[#ffd45c]"
              >
                <Link to="/bookings">
                  {nextAppointment ? "View my bookings" : "Find a booking"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl font-semibold">Upcoming bookings</h2>
              <Link
                to="/bookings"
                className="mt-1 inline-flex items-center gap-1 text-sm hover:text-primary"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {upcomingLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No upcoming bookings</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your next salon visit will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.slice(0, 3).map((booking) => {
                const date = booking.scheduled_start
                  ? new Date(booking.scheduled_start)
                  : null;
                const status = bookingStatus(booking);
                return (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className="group flex flex-col gap-5 rounded-3xl border bg-white p-5 transition hover:border-primary/30 hover:shadow-sm sm:flex-row sm:items-center"
                  >
                    <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#f3edff] text-primary">
                      <span className="font-serif text-2xl font-semibold">
                        {date ? format(date, "dd") : "—"}
                      </span>
                      <span className="text-xs uppercase">
                        {date ? format(date, "MMM") : ""}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-medium">
                        {booking.services?.map((service) => service.service_name).join(", ") ||
                          "Salon appointment"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.tenant?.name || "Salon"}
                        {date ? ` · ${format(date, "h:mm a")}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <Badge
                        className={cn(
                          "rounded-full border-0 px-4 py-1 font-normal capitalize",
                          status.toLowerCase().includes("pending")
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800",
                        )}
                      >
                        {status}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-serif text-2xl font-semibold">My packages</h2>
            <Link to="/balance" className="text-sm text-muted-foreground hover:text-primary">
              View balances
            </Link>
          </div>
          {packagesLoading ? (
            <Skeleton className="h-36 rounded-3xl" />
          ) : activePackages.length === 0 ? (
            <div className="rounded-3xl border bg-white p-7 text-sm text-muted-foreground">
              You do not have an active package yet.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {activePackages.map((entitlement) => {
                const total = entitlement.items.reduce(
                  (sum, item) => sum + Number(item.total_quantity || 0),
                  0,
                );
                const remaining = entitlement.items.reduce(
                  (sum, item) => sum + Number(item.remaining_quantity || 0),
                  0,
                );
                const used = Math.max(total - remaining, 0);
                const progress = total > 0 ? Math.min((used / total) * 100, 100) : 0;
                const salon = customers.find(
                  (customer) => customer.tenant_id === entitlement.tenant_id,
                )?.tenant;

                return (
                  <div key={entitlement.id} className="rounded-3xl border bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-medium">
                          {entitlement.package?.name || "Salon package"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {used} of {total} item{total === 1 ? "" : "s"} used
                          {salon ? ` · ${salon.name}` : ""}
                          {entitlement.expires_at
                            ? ` · expires ${format(new Date(entitlement.expires_at), "d MMM")}`
                            : ""}
                        </p>
                      </div>
                      <Badge className="rounded-full border-0 bg-[#f3edff] text-primary">
                        Active
                      </Badge>
                    </div>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#eee9e1]">
                      <div
                        className="h-full rounded-full bg-[#f5c542] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl font-semibold">Salons you visit</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your connected salon accounts
              </p>
            </div>
          </div>
          {authLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-64 rounded-3xl" />
              <Skeleton className="h-64 rounded-3xl" />
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-muted-foreground">
              No salons are linked to your account yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {customers.map((customer, index) => (
                <div
                  key={customer.id}
                  className="overflow-hidden rounded-3xl border bg-white shadow-sm"
                >
                  <div
                    className={cn(
                      "flex h-36 items-center justify-center",
                      index % 3 === 0
                        ? "bg-[#3c2861]"
                        : index % 3 === 1
                          ? "bg-[#f3bf3c]"
                          : "bg-[#7f70a5]",
                    )}
                  >
                    <Store className="h-10 w-10 text-white/85" />
                  </div>
                  <div className="p-6">
                    <p className="font-serif text-xl font-semibold">
                      {customer.tenant.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {customer.tenant.country || "Salon"} · {customer.visit_count || 0} visit
                      {customer.visit_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 className="font-serif text-2xl font-semibold">Visit history</h2>
              <Link to="/history" className="text-sm text-muted-foreground hover:text-primary">
                View all
              </Link>
            </div>
            <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
              {historyLoading ? (
                <div className="space-y-3 p-6">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : completedBookings.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Completed visits will appear here.
                </div>
              ) : (
                <div className="divide-y">
                  {completedBookings.slice(0, 5).map((booking) => (
                    <Link
                      to={`/bookings/${booking.id}`}
                      key={booking.id}
                      className="grid gap-2 p-5 transition hover:bg-muted/30 sm:grid-cols-[130px_1fr_1fr_auto] sm:items-center"
                    >
                      <span className="text-sm text-muted-foreground">
                        {booking.scheduled_start
                          ? format(new Date(booking.scheduled_start), "d MMM yyyy")
                          : "—"}
                      </span>
                      <span className="font-medium">
                        {booking.services?.[0]?.service_name || "Salon visit"}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {booking.tenant?.name || "Salon"}
                      </span>
                      <span className="font-serif font-semibold">
                        {formatCurrency(
                          booking.total_amount,
                          booking.tenant?.currency || "USD",
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 className="font-serif text-2xl font-semibold">Store credit</h2>
              <Link to="/balance" className="text-sm text-muted-foreground hover:text-primary">
                Manage
              </Link>
            </div>
            <div className="space-y-3 rounded-3xl border bg-white p-5 shadow-sm">
              {purseLoading ? (
                <Skeleton className="h-24" />
              ) : storeCreditBySalon.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No store credit balances yet.
                </p>
              ) : (
                storeCreditBySalon.map(({ customer, purse }) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-[#f7f3ed] p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-xl bg-white p-2.5 text-primary">
                        <WalletCards className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{customer.tenant.name}</p>
                        <p className="text-xs text-muted-foreground">Available balance</p>
                      </div>
                    </div>
                    <p className="shrink-0 font-serif text-lg font-semibold">
                      {formatCurrency(
                        Number(purse?.balance || 0),
                        customer.tenant.currency,
                      )}
                    </p>
                  </div>
                ))
              )}
              <Button variant="outline" asChild className="h-11 w-full rounded-full">
                <Link to="/balance">
                  View store credit
                  <Clock3 className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </ClientSidebar>
  );
}
