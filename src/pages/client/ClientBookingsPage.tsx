import { useState } from "react";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { useClientBookings } from "@/hooks/client/useClientBookings";
import type { ClientAppointmentWithDetails } from "@/hooks/client/useClientBookings";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, MapPin, Store, XCircle } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/currency";

type BookingFilter = "upcoming" | "completed" | "cancelled";

function BookingCard({ booking }: { booking: ClientAppointmentWithDetails }) {
  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800",
    started: "bg-yellow-100 text-yellow-800",
    paused: "bg-orange-100 text-orange-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const paymentColors: Record<string, string> = {
    deposit_paid: "bg-yellow-100 text-yellow-800",
    fully_paid: "bg-green-100 text-green-800",
    pay_at_salon: "bg-blue-100 text-blue-800",
    refunded_full: "bg-purple-100 text-purple-800",
    refunded_partial: "bg-purple-100 text-purple-800",
  };

  const getPaymentLabel = (status: string) => {
    switch (status) {
      case "deposit_paid": return "Deposit Paid";
      case "fully_paid": return "Paid";
      case "pay_at_salon": return "Pay at Salon";
      case "refunded_full": return "Refunded";
      case "refunded_partial": return "Partially Refunded";
      default: return status;
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Left side - Main info */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={statusColors[booking.status] || "bg-muted"}>
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </Badge>
              <Badge className={paymentColors[booking.payment_status] || "bg-muted"}>
                {getPaymentLabel(booking.payment_status)}
              </Badge>
            </div>

            {/* Salon name */}
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{booking.tenant?.name || "Salon"}</span>
            </div>

            {/* Date/Time */}
            {booking.scheduled_start && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(booking.scheduled_start), "EEEE, MMMM d, yyyy")}</span>
              </div>
            )}
            {booking.scheduled_start && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{format(new Date(booking.scheduled_start), "h:mm a")}</span>
                {booking.scheduled_end && (
                  <span>- {format(new Date(booking.scheduled_end), "h:mm a")}</span>
                )}
              </div>
            )}

            {/* Location */}
            {booking.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{booking.location.name}, {booking.location.city}</span>
              </div>
            )}

            {/* Services */}
            {booking.services && booking.services.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-1">Services:</p>
                <div className="flex flex-wrap gap-1">
                  {booking.services.map((service) => (
                    <Badge key={service.id} variant="secondary" className="text-xs">
                      {service.service_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right side - Amount */}
          <div className="text-right">
            <p className="text-lg font-semibold">
              {formatCurrency(booking.total_amount, booking.tenant?.currency || "USD")}
            </p>
            {booking.amount_paid > 0 && booking.amount_paid < booking.total_amount && (
              <p className="text-xs text-muted-foreground">
                Paid: {formatCurrency(booking.amount_paid, booking.tenant?.currency || "USD")}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingsList({ filter }: { filter: BookingFilter }) {
  const { bookings, isLoading, error } = useClientBookings(filter);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Failed to load bookings</p>
        </CardContent>
      </Card>
    );
  }

  if (bookings.length === 0) {
    const messages: Record<BookingFilter, string> = {
      upcoming: "No upcoming appointments",
      completed: "No completed appointments",
      cancelled: "No cancelled appointments",
    };

    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">{messages[filter]}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingCard key={booking.id} booking={booking} />
      ))}
    </div>
  );
}

export default function ClientBookingsPage() {
  const [activeTab, setActiveTab] = useState<BookingFilter>("upcoming");

  return (
    <ClientSidebar>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Bookings</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your appointments
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as BookingFilter)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming" className="gap-2">
              <Calendar className="h-4 w-4 hidden sm:inline" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <Clock className="h-4 w-4 hidden sm:inline" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-2">
              <XCircle className="h-4 w-4 hidden sm:inline" />
              Cancelled
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            <BookingsList filter="upcoming" />
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            <BookingsList filter="completed" />
          </TabsContent>

          <TabsContent value="cancelled" className="mt-4">
            <BookingsList filter="cancelled" />
          </TabsContent>
        </Tabs>
      </div>
    </ClientSidebar>
  );
}
