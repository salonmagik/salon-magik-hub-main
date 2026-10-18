import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientBookings } from "@/hooks";
import type { ClientAppointmentWithDetails } from "@/hooks";
import { cn } from "@shared/utils";
import { Skeleton } from "@ui/skeleton";
import { UpcomingAppointmentDialog } from "@/components/UpcomingAppointmentDialog";
import { monthDayChip } from "@/lib/bookingsOrdersUi";

export default function ClientUpcomingPage() {
  const { bookings: upcomingRaw, isLoading } = useClientBookings("upcoming");
  // Same filter as the Bookings & Orders dashboard: this list is real
  // scheduled appointments only, not dateless product/package orders or
  // appointments still awaiting a time slot.
  const upcoming = useMemo(
    () => upcomingRaw.filter((booking) => Boolean(booking.scheduled_start)),
    [upcomingRaw],
  );
  const [selected, setSelected] = useState<ClientAppointmentWithDetails | null>(null);

  return (
    <ClientSidebar>
      <div className="space-y-6 pb-10">
        <div className="space-y-3.5">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/bookings" className="hover:underline">Bookings &amp; Orders</Link>
            <span>/</span>
            <span className="font-semibold text-[#2E1F4E]">Upcoming</span>
          </nav>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#2E1F4E]">Upcoming</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {upcoming.length} {upcoming.length === 1 ? "booking" : "bookings"}. Tap one to see its details.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-[14px] border border-[#EAE4D8] bg-white p-8 text-center text-sm text-muted-foreground">
            No upcoming bookings
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {upcoming.map((booking) => {
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
                  onClick={() => setSelected(booking)}
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
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        booking={selected}
      />
    </ClientSidebar>
  );
}
