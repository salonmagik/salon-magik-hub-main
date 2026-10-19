import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientBookings } from "@/hooks";
import type { ClientAppointmentWithDetails } from "@/hooks";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { UpcomingAppointmentDialog } from "@/components/UpcomingAppointmentDialog";
import { monthDayChip } from "@/lib/bookingsOrdersUi";

function EmptySection({ message }: { message: string }) {
  return (
    <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

type BookingTab = "upcoming" | "past" | "unpaid";

const TABS: { key: BookingTab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "unpaid", label: "Needs payment" },
];

export default function ClientBookingsPage() {
  const [tab, setTab] = useState<BookingTab>("upcoming");
  const { bookings: upcomingRaw, isLoading: upcomingLoading } = useClientBookings("upcoming");
  const { bookings: pastRaw, isLoading: pastLoading } = useClientBookings("completed");
  const { bookings: unpaidRaw, isLoading: unpaidLoading } = useClientBookings("unpaid");

  // useClientBookings("upcoming") deliberately also returns bookings with no
  // scheduled_start (originally meant to keep an unscheduled item visible
  // elsewhere), but "Upcoming" here means a real appointment with a real
  // date, that's the whole point of the section. A product/package order or
  // an appointment still awaiting a time slot belongs on Orders/Packages
  // or gets scheduled first, not shown here as a dateless "--" card.
  const upcoming = useMemo(
    () => upcomingRaw.filter((booking) => Boolean(booking.scheduled_start)),
    [upcomingRaw],
  );
  const [selectedBooking, setSelectedBooking] = useState<ClientAppointmentWithDetails | null>(null);

  const countByTab: Record<BookingTab, number> = {
    upcoming: upcoming.length,
    past: pastRaw.length,
    unpaid: unpaidRaw.length,
  };
  const bookingsByTab: Record<BookingTab, ClientAppointmentWithDetails[]> = {
    upcoming,
    past: pastRaw,
    unpaid: unpaidRaw,
  };
  const loadingByTab: Record<BookingTab, boolean> = {
    upcoming: upcomingLoading,
    past: pastLoading,
    unpaid: unpaidLoading,
  };
  const emptyMessageByTab: Record<BookingTab, string> = {
    upcoming: "No upcoming bookings",
    past: "No past bookings yet",
    unpaid: "Nothing needs payment right now",
  };

  const activeBookings = bookingsByTab[tab];
  const isLoading = loadingByTab[tab];

  return (
    <ClientSidebar>
      <div className="space-y-5 pb-10">
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-[-0.5px] text-[#2E1F4E]">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every appointment you've scheduled, across every salon.</p>
        </div>

        <div className="flex w-fit gap-1 rounded-xl bg-[#F1ECE1] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
                tab === t.key ? "bg-white text-[#2E1F4E] shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label} &middot; {countByTab[t.key]}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-[14px]" />
            ))}
          </div>
        ) : activeBookings.length === 0 ? (
          <EmptySection message={emptyMessageByTab[tab]} />
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {activeBookings.map((booking) => {
              const fromPackage = (booking.services || []).some((s) => !!s.package_id);
              const title = booking.services && booking.services.length > 0 ? booking.services[0].service_name : "Appointment";
              const chip = fromPackage
                ? { label: "Package session", className: "text-[#268766] bg-[#E1F3EC]" }
                : { label: "Service", className: "text-[#2E1F4E] bg-[#F3EDFF]" };
              const dateChip = booking.scheduled_start ? monthDayChip(booking.scheduled_start) : null;
              return (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => setSelectedBooking(booking)}
                  className="flex cursor-pointer items-start gap-3.5 rounded-[14px] border border-[#EAE4D8] bg-white p-4 text-left transition-shadow hover:shadow-md"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F3EDFF]">
                    <span className="text-[10px] font-bold uppercase text-[#2E1F4E]">{dateChip?.month ?? "--"}</span>
                    <span className="font-serif text-[17px] font-semibold leading-none text-[#2E1F4E]">{dateChip?.day ?? "--"}</span>
                  </div>
                  <div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", chip.className)}>
                      {chip.label}
                    </span>
                    <p className="mt-1.5 text-sm font-semibold text-[#2E1F4E]">{title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {booking.scheduled_start && format(new Date(booking.scheduled_start), "h:mm a")}
                      {booking.location ? ` · ${booking.location.name}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <UpcomingAppointmentDialog
        open={!!selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        booking={selectedBooking}
      />
    </ClientSidebar>
  );
}
