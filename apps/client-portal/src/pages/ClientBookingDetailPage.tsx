import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ClientSidebar } from "@/components/ClientSidebar";
import { useClientAuth } from "@/hooks";
import { supabase } from "@/lib/supabase";
import type { ClientAppointmentWithDetails } from "@/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import { Separator } from "@ui/separator";
import { BookingActions } from "@/components/BookingActions";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  Store, 
  User,
  CreditCard,
  FileText,
  Package
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-800" },
  started: { label: "In Progress", className: "bg-yellow-100 text-yellow-800" },
  paused: { label: "Paused", className: "bg-orange-100 text-orange-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

const paymentConfig: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "bg-gray-100 text-gray-800" },
  deposit_paid: { label: "Deposit Paid", className: "bg-yellow-100 text-yellow-800" },
  fully_paid: { label: "Paid", className: "bg-green-100 text-green-800" },
  pay_at_salon: { label: "Pay at Salon", className: "bg-blue-100 text-blue-800" },
  refunded_full: { label: "Refunded", className: "bg-purple-100 text-purple-800" },
  refunded_partial: { label: "Partially Refunded", className: "bg-purple-100 text-purple-800" },
};

export default function ClientBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, isAuthenticated } = useClientAuth();
  const [booking, setBooking] = useState<ClientAppointmentWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customerIds = customers.map((c) => c.id);

  useEffect(() => {
    async function fetchBooking() {
      if (!isAuthenticated || !id || customerIds.length === 0) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("appointments")
          .select(`
            *,
            services:appointment_services(*),
            products:appointment_products(*),
            tenant:tenants(*),
            location:locations(*)
          `)
          .eq("id", id)
          .in("customer_id", customerIds)
          .single();

        if (fetchError) throw fetchError;
        setBooking(data as ClientAppointmentWithDetails);
      } catch (err) {
        console.error("Error fetching booking:", err);
        setError("Booking not found or access denied");
      } finally {
        setIsLoading(false);
      }
    }

    fetchBooking();
  }, [id, isAuthenticated, customerIds.join(",")]);

  const handleActionComplete = async () => {
    // Refetch booking after action
    if (!id) return;
    const { data } = await supabase
      .from("appointments")
      .select(`
        *,
        services:appointment_services(*),
        products:appointment_products(*),
        tenant:tenants(*),
        location:locations(*)
      `)
      .eq("id", id)
      .single();
    
    if (data) setBooking(data as ClientAppointmentWithDetails);
  };

  if (isLoading) {
    return (
      <ClientSidebar>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        </div>
      </ClientSidebar>
    );
  }

  if (error || !booking) {
    return (
      <ClientSidebar>
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => navigate("/client/bookings")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Bookings
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{error || "Booking not found"}</p>
            </CardContent>
          </Card>
        </div>
      </ClientSidebar>
    );
  }

  const currency = booking.tenant?.currency || "USD";
  const status = statusConfig[booking.status] || { label: booking.status, className: "bg-muted" };
  const payment = paymentConfig[booking.payment_status] || { label: booking.payment_status, className: "bg-muted" };

  const services = booking.services || [];
  const products = (booking as any).products || [];
  const servicesTotalDuration = services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  return (
    <ClientSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/client/bookings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Booking Details</h1>
            <p className="text-sm text-muted-foreground">
              {booking.tenant?.name || "Salon"}
            </p>
          </div>
        </div>

        {/* Status Cards */}
        <div className="flex flex-wrap gap-2">
          <Badge className={status.className}>{status.label}</Badge>
          <Badge className={payment.className}>{payment.label}</Badge>
          {booking.is_walk_in && <Badge variant="outline">Walk-in</Badge>}
        </div>

        {/* Booking Actions */}
        {["scheduled", "started", "paused"].includes(booking.status) && (
          <BookingActions 
            booking={booking} 
            onActionComplete={handleActionComplete}
          />
        )}

        {/* Date & Time */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Date & Time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {booking.scheduled_start ? (
              <>
                <p className="font-medium">
                  {format(new Date(booking.scheduled_start), "EEEE, MMMM d, yyyy")}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(new Date(booking.scheduled_start), "h:mm a")}
                    {booking.scheduled_end && (
                      <> - {format(new Date(booking.scheduled_end), "h:mm a")}</>
                    )}
                  </span>
                </div>
                {servicesTotalDuration > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Duration: ~{servicesTotalDuration} minutes
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Unscheduled appointment</p>
            )}
          </CardContent>
        </Card>

        {/* Location */}
        {booking.location && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{booking.location.name}</p>
              <p className="text-sm text-muted-foreground">
                {booking.location.address && `${booking.location.address}, `}
                {booking.location.city}, {booking.location.country}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Services */}
        {services.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {services.map((service) => (
                  <div key={service.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{service.service_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {service.duration_minutes} min
                      </p>
                    </div>
                    <p className="font-medium">
                      {formatCurrency(service.price, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products */}
        {products.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {products.map((product: any) => (
                  <div key={product.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty: {product.quantity}
                      </p>
                    </div>
                    <p className="font-medium">
                      {formatCurrency(product.total_price, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{formatCurrency(booking.total_amount, currency)}</span>
            </div>
            
            {booking.deposit_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deposit</span>
                <span>{formatCurrency(booking.deposit_amount, currency)}</span>
              </div>
            )}
            
            {booking.purse_amount_used > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Store Credit Used</span>
                <span className="text-green-600">-{formatCurrency(booking.purse_amount_used, currency)}</span>
              </div>
            )}
            
            <Separator />
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="font-medium">{formatCurrency(booking.amount_paid, currency)}</span>
            </div>
            
            {booking.amount_paid < booking.total_amount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance Due</span>
                <span className="font-medium text-destructive">
                  {formatCurrency(booking.total_amount - booking.amount_paid, currency)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {booking.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {booking.notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Cancellation Reason */}
        {booking.status === "cancelled" && booking.cancellation_reason && (
          <Card className="border-destructive/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive">Cancellation Reason</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{booking.cancellation_reason}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientSidebar>
  );
}
