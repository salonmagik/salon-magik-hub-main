import { useMemo } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { ArrowDownLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { ClientSidebar } from "@/components/ClientSidebar";
import {
  useClientAuth,
  useClientBalance,
  useClientBookings,
  useClientPurse,
  useClientTransactions,
  useClientVouchers,
  isVoucherUnused,
} from "@/hooks";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { buildPublicBookingUrl } from "@/lib/bookingUrl";

function bookingHeadline(
  booking: {
    services?: { service_name: string }[] | null;
    products?: { product_name: string }[] | null;
  },
  fallback: string,
) {
  if (booking.services && booking.services.length > 0) {
    return booking.services.map((service) => service.service_name).join(", ");
  }
  if (booking.products && booking.products.length > 0) {
    return booking.products.map((product) => product.product_name).join(", ");
  }
  return fallback;
}

const TX_TYPE_LABELS: Record<string, string> = {
  payment: "Payment",
  deposit: "Deposit",
  refund: "Refund",
  purse_topup: "Balance top-up",
  purse_redemption: "Salon balance used",
};

export default function ClientDashboard() {
  const { customers, isLoading: authLoading } = useClientAuth();
  const {
    bookings: upcomingRaw,
    nextAppointment,
    isLoading: upcomingLoading,
  } = useClientBookings("upcoming");
  // "Upcoming bookings" here means real scheduled appointments, not
  // dateless product/package orders or appointments still awaiting a time
  // slot (those showed as an empty "--" card before this filter).
  const bookings = useMemo(
    () => upcomingRaw.filter((booking) => Boolean(booking.scheduled_start)),
    [upcomingRaw],
  );
  const { packages, isLoading: packagesLoading } = useClientBalance();
  const { purses, isLoading: purseLoading } = useClientPurse();
  const { vouchers, isLoading: vouchersLoading } = useClientVouchers();
  const { transactions, isLoading: transactionsLoading } = useClientTransactions();

  const customerName = customers[0]?.full_name?.split(" ")[0] || "there";
  const nextService = nextAppointment ? bookingHeadline(nextAppointment, "your appointment") : "your appointment";
  const daysUntilNext =
    nextAppointment?.scheduled_start
      ? differenceInCalendarDays(
          new Date(nextAppointment.scheduled_start),
          new Date(),
        )
      : null;

  const activePackages = packages.filter((item) => item.status === "active");
  const totalRemainingSessions = activePackages.reduce(
    (sum, entitlement) =>
      sum + entitlement.items.reduce((itemSum, item) => itemSum + Number(item.remaining_quantity || 0), 0),
    0,
  );

  const storeCreditBySalon = useMemo(
    () =>
      customers.map((customer) => ({
        customer,
        purse: purses.find((entry) => entry.customer_id === customer.id),
      })),
    [customers, purses],
  );
  const totalStoreCredit = storeCreditBySalon.reduce((sum, entry) => sum + Number(entry.purse?.balance || 0), 0);
  const storeCreditCurrency = storeCreditBySalon[0]?.customer.tenant.currency;

  const unusedVoucherCount = vouchers.filter(isVoucherUnused).length;

  const recentActivity = transactions.slice(0, 4);

  const isLoading =
    authLoading ||
    upcomingLoading ||
    packagesLoading ||
    purseLoading ||
    vouchersLoading ||
    transactionsLoading;

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

        {bookings.length > 0 && (
          <section>
            <div className="mb-3.5 flex items-baseline justify-between">
              <h2 className="font-serif text-lg font-semibold">Upcoming bookings</h2>
              <Link
                to="/bookings"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              {bookings.slice(0, 2).map((booking) => {
                const date = booking.scheduled_start ? new Date(booking.scheduled_start) : null;
                return (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className="flex cursor-pointer items-start gap-3.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4 text-left transition-shadow hover:shadow-md"
                  >
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F3EDFF]">
                      <span className="text-[10px] font-bold uppercase text-[#2E1F4E]">{date ? format(date, "MMM") : "--"}</span>
                      <span className="font-serif text-[17px] font-semibold leading-none text-[#2E1F4E]">{date ? format(date, "dd") : "--"}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#2E1F4E]">{bookingHeadline(booking, "Salon appointment")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {booking.tenant?.name || "Salon"}
                        {date ? ` · ${format(date, "h:mm a")}` : ""}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3.5 font-serif text-lg font-semibold">Your entitlements</h2>
          {isLoading ? (
            <div className="grid gap-3.5 sm:grid-cols-3">
              <Skeleton className="h-[110px] rounded-[14px]" />
              <Skeleton className="h-[110px] rounded-[14px]" />
              <Skeleton className="h-[110px] rounded-[14px]" />
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-3">
              <Link
                to="/packages"
                className="group flex flex-col gap-2.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#E1F3EC] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#268766]">
                    Packages
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <div>
                  <p className="font-serif text-[22px] font-semibold leading-none">{totalRemainingSessions}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    session{totalRemainingSessions === 1 ? "" : "s"} left · {activePackages.length} active
                  </p>
                </div>
              </Link>

              <Link
                to="/store-credit"
                className="group flex flex-col gap-2.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8A6510]">
                    Store credit
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <div>
                  <p className="font-serif text-[22px] font-semibold leading-none">
                    {formatCurrency(totalStoreCredit, storeCreditCurrency)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    across {storeCreditBySalon.length} salon{storeCreditBySalon.length === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>

              <Link
                to="/vouchers"
                className="group flex flex-col gap-2.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#F3EDFF] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2E1F4E]">
                    Vouchers
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <div>
                  <p className="font-serif text-[22px] font-semibold leading-none">{unusedVoucherCount}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    unused voucher{unusedVoucherCount === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3.5 font-serif text-lg font-semibold">Salons you visit</h2>
          {authLoading ? (
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Skeleton className="h-[108px] rounded-[18px]" />
              <Skeleton className="h-[108px] rounded-[18px]" />
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-6 text-center text-sm text-muted-foreground">
              No salons are linked to your account yet.
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {customers.map((customer) => {
                const websiteUrl = buildPublicBookingUrl(customer.tenant.slug);
                const brandColor = customer.tenant.brand_color || "#2E1F4E";
                return (
                  <div
                    key={customer.id}
                    className="flex flex-col justify-between gap-2.5 rounded-[18px] border-2 bg-white p-4"
                    style={{ borderColor: brandColor }}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#2E1F4E]">{customer.tenant.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {customer.tenant.country || "Salon"} · {customer.visit_count || 0} visit
                        {customer.visit_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    {websiteUrl && (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#2E1F4E]"
                      >
                        Visit website
                        <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-semibold">Recent activity</h2>
            <Link
              to="/history"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-[#EAE4D8] bg-white">
            {transactionsLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Your transactions will appear here.
              </div>
            ) : (
              <div className="divide-y divide-[#F1ECE1]">
                {recentActivity.map((tx) => {
                  const isCredit = tx.type === "refund" || tx.type === "purse_topup";
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                          {isCredit ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {TX_TYPE_LABELS[tx.type] || tx.type}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {tx.tenant?.name || "Salon"} · {format(new Date(tx.created_at), "d MMM yyyy")}
                          </p>
                        </div>
                      </div>
                      <p className={cn("shrink-0 text-sm font-semibold", isCredit && "text-green-600")}>
                        {isCredit ? "+" : ""}
                        {formatCurrency(tx.amount, tx.currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </ClientSidebar>
  );
}
