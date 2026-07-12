import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientBookings } from "@/hooks";
import type { ClientAppointmentWithDetails } from "@/hooks";
import { Card, CardContent } from "@ui/card";
import { Button } from "@ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Calendar, Clock, MapPin, Store, XCircle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";

type BookingFilter = "upcoming" | "completed" | "cancelled";
type ApprovalAwareBooking = ClientAppointmentWithDetails & {
  approval_status?: string | null;
};

function BookingCard({ booking }: { booking: ApprovalAwareBooking }) {
  const navigate = useNavigate();
  
  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800",
    started: "bg-yellow-100 text-yellow-800",
    paused: "bg-orange-100 text-orange-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const paymentColors: Record<string, string> = {
    unpaid: "bg-gray-100 text-gray-800",
    deposit_paid: "bg-yellow-100 text-yellow-800",
    fully_paid: "bg-green-100 text-green-800",
    refunded_full: "bg-purple-100 text-purple-800",
    refunded_partial: "bg-purple-100 text-purple-800",
  };

  const approvalColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    approved: "bg-emerald-100 text-emerald-900",
    reschedule_proposed: "bg-sky-100 text-sky-900",
    declined: "bg-rose-100 text-rose-900",
    not_required: "bg-slate-100 text-slate-800",
  };

  const getPaymentLabel = (status: string) => {
    switch (status) {
      case "unpaid": return "Unpaid";
      case "deposit_paid": return "Deposit Paid";
      case "fully_paid": return "Paid";
      case "refunded_full": return "Refunded";
      case "refunded_partial": return "Partially Refunded";
      default: return status;
    }
  };

  const getApprovalLabel = (status: string | null | undefined) => {
    switch (status) {
      case "pending": return "Awaiting approval";
      case "approved": return "Approved";
      case "reschedule_proposed": return "Reschedule proposed";
      case "declined": return "Declined";
      case "not_required":
      case undefined:
      case null:
        return "Confirmed";
      default:
        return status.replace(/_/g, " ");
    }
  };

  const balanceDue = Math.max(Number(booking.total_amount || 0) - Number(booking.amount_paid || 0), 0);
  const canCompletePayment =
    balanceDue > 0 &&
    booking.status !== "cancelled" &&
    !["fully_paid", "refunded_full"].includes(booking.payment_status) &&
    ["approved", "reschedule_accepted", "not_required", undefined, null].includes(booking.approval_status as any);

  return (
    <Card 
      className="mb-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => navigate(`/bookings/${booking.id}`)}
    >
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
              <Badge className={approvalColors[booking.approval_status || "not_required"] || "bg-muted"}>
                {getApprovalLabel(booking.approval_status)}
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

          {/* Right side - Amount & Arrow */}
          <div className="flex items-center gap-2">
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
            {canCompletePayment && (
              <Button
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/bookings/${booking.id}`);
                }}
              >
                Complete Payment
              </Button>
            )}
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
          <h1>My Bookings</h1>
          <p className="text-muted-foreground mt-2">
            View and manage your appointments across all salons
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as BookingFilter)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming">
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed
            </TabsTrigger>
            <TabsTrigger value="cancelled">
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
