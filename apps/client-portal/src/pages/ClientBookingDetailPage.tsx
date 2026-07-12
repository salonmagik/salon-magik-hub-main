import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
  Package,
  Gift,
  Truck,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@shared/currency";
import { startClientBookingPayment } from "@/lib/bookingPayments";

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
  refunded_full: { label: "Refunded", className: "bg-purple-100 text-purple-800" },
  refunded_partial: { label: "Partially Refunded", className: "bg-purple-100 text-purple-800" },
};

const approvalConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Awaiting salon approval", className: "bg-amber-100 text-amber-900" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-900" },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-900" },
  reschedule_proposed: { label: "Reschedule proposed", className: "bg-sky-100 text-sky-900" },
  reschedule_accepted: { label: "Reschedule accepted", className: "bg-emerald-100 text-emerald-900" },
  reschedule_declined: { label: "Reschedule declined", className: "bg-orange-100 text-orange-900" },
  not_required: { label: "Confirmed", className: "bg-slate-100 text-slate-800" },
};

type AppointmentProduct = {
  id: string;
  product_name: string;
  quantity: number;
  total_price: number;
};

type BookingLineMetadata = {
  line_item?: {
    type?: string | null;
    fulfillment_type?: string | null;
    schedule_mode?: string | null;
  } | null;
  gift?: {
    recipient?: {
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;
    shared_recipient?: boolean;
  } | null;
  delivery_address?: {
    line1?: string;
    city?: string;
    country?: string;
  } | null;
} | null;

type ClientApprovalBooking = ClientAppointmentWithDetails & {
  booking_reference?: string | null;
  approval_status?: string | null;
  approval_reason?: string | null;
  proposed_start?: string | null;
  proposed_end?: string | null;
  proposed_message?: string | null;
  customer_response_status?: string | null;
  booking_metadata?: BookingLineMetadata;
};

export default function ClientBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { customers, isAuthenticated } = useClientAuth();
  const [booking, setBooking] = useState<ClientAppointmentWithDetails | null>(null);
  type SiblingBooking = {
    id: string;
    status: string;
    scheduled_start: string | null;
    total_amount: number | null;
    amount_paid: number | null;
    payment_status: string;
    approval_status: string | null;
    location_id: string | null;
    location: { id: string; name: string; phone: string | null } | null;
  };
  const [relatedBookings, setRelatedBookings] = useState<SiblingBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [isRespondingToProposal, setIsRespondingToProposal] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const verifyCalledRef = useRef(false);

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
        const nextBooking = data as ClientApprovalBooking;
        setBooking(nextBooking);

        const bookingReference = nextBooking.booking_reference;
        if (bookingReference) {
          const { data: siblings } = await supabase
            .from("appointments")
            .select("id, status, scheduled_start, total_amount, amount_paid, payment_status, approval_status, location_id, location:locations(id, name, phone)")
            .eq("booking_reference", bookingReference)
            .in("customer_id", customerIds)
            .neq("id", id)
            .order("scheduled_start", { ascending: true, nullsFirst: false });

          setRelatedBookings((siblings as unknown as SiblingBooking[]) || []);
        } else {
          setRelatedBookings([]);
        }
      } catch (err) {
        console.error("Error fetching booking:", err);
        setError("Booking not found or access denied");
      } finally {
        setIsLoading(false);
      }
    }

    fetchBooking();
  }, [id, isAuthenticated, customerIds.join(",")]);

  // After a Paystack redirect (?reference= or ?trxref=), verify the payment and refetch.
  useEffect(() => {
    if (verifyCalledRef.current || !isAuthenticated) return;

    const params = new URLSearchParams(location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) return;

    verifyCalledRef.current = true;

    const runVerify = async () => {
      setIsVerifyingPayment(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const { data, error: fnError } = await supabase.functions.invoke("verify-booking-payment", {
          body: { reference },
        });

        if (fnError) {
          console.error("verify-booking-payment error:", fnError);
        } else if (data?.verified) {
          setPaymentVerified(true);
        }
      } catch (err) {
        console.error("Payment verification failed:", err);
      } finally {
        setIsVerifyingPayment(false);
        // Refetch the booking to reflect the updated payment status
        if (id) {
          const { data } = await supabase
            .from("appointments")
            .select(`*, services:appointment_services(*), products:appointment_products(*), tenant:tenants(*), location:locations(*)`)
            .eq("id", id)
            .single();
          if (data) setBooking(data as ClientAppointmentWithDetails);
        }
        // Strip Paystack params from the URL without a page reload
        const clean = new URLSearchParams(location.search);
        clean.delete("reference");
        clean.delete("trxref");
        const newSearch = clean.toString();
        window.history.replaceState({}, "", location.pathname + (newSearch ? `?${newSearch}` : ""));
      }
    };

    void runVerify();
  }, [isAuthenticated, location.search, id]);

  // After the booking loads, check if there is a processing payment intent for it.
  // This surfaces a "Check Payment Status" button when the Paystack redirect was lost.
  useEffect(() => {
    if (!id || !booking) return;
    supabase
      .from("payment_intents")
      .select("paystack_reference")
      .eq("appointment_id", id)
      .eq("status", "processing")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.paystack_reference) setPendingReference(data.paystack_reference);
        else setPendingReference(null);
      });
  }, [id, booking?.payment_status]);

  const handleCheckPaymentStatus = async () => {
    if (!pendingReference) return;
    setIsVerifyingPayment(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-booking-payment", {
        body: { reference: pendingReference },
      });
      if (fnError) throw fnError;
      if (data?.verified) {
        setPaymentVerified(true);
        setPendingReference(null);
        if (id) {
          const { data: refreshed } = await supabase
            .from("appointments")
            .select(`*, services:appointment_services(*), products:appointment_products(*), tenant:tenants(*), location:locations(*)`)
            .eq("id", id)
            .single();
          if (refreshed) setBooking(refreshed as ClientAppointmentWithDetails);
        }
      }
    } catch (err) {
      console.error("Check payment status failed:", err);
    } finally {
      setIsVerifyingPayment(false);
    }
  };

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
          <Button variant="ghost" onClick={() => navigate("/bookings")}>
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

  const approvalBooking = booking as ClientApprovalBooking;
  const currency = booking.tenant?.currency || "USD";
  const status = statusConfig[booking.status] || { label: booking.status, className: "bg-muted" };
  const payment = paymentConfig[booking.payment_status] || { label: booking.payment_status, className: "bg-muted" };
  const approvalStatus = approvalConfig[approvalBooking.approval_status || "not_required"] || {
    label: approvalBooking.approval_status || "Confirmed",
    className: "bg-muted",
  };

  const services = booking.services || [];
  const products = (booking as { products?: AppointmentProduct[] }).products || [];
  const servicesTotalDuration = services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const bookingReference = approvalBooking.booking_reference || null;
  const bookingMetadata = (approvalBooking.booking_metadata || null) as BookingLineMetadata;
  const giftRecipient = bookingMetadata?.gift?.recipient;
  const deliveryAddress = bookingMetadata?.delivery_address;
  const customerRecord = customers.find((item) => item.id === booking.customer_id) || null;
  const payableBookings = [
    {
      id: booking.id,
      total_amount: booking.total_amount,
      amount_paid: booking.amount_paid,
      payment_status: booking.payment_status,
      status: booking.status,
    },
    ...relatedBookings,
  ].filter((item) => {
    if (item.status === "cancelled") return false;
    if (["fully_paid", "refunded_full"].includes(item.payment_status)) return false;
    return Number(item.total_amount || 0) > Number(item.amount_paid || 0);
  });
  const outstandingAmount = payableBookings.reduce((sum, item) => {
    return sum + Math.max(Number(item.total_amount || 0) - Number(item.amount_paid || 0), 0);
  }, 0);
  const canCompletePayment =
    outstandingAmount > 0 &&
    Boolean(customerRecord?.email) &&
    ["approved", "reschedule_accepted", "not_required"].includes(approvalBooking.approval_status || "not_required");
  const showPendingApprovalState = (approvalBooking.approval_status || "not_required") === "pending";
  const showRescheduleProposal = approvalBooking.approval_status === "reschedule_proposed";
  const salonContactHref = booking.tenant?.contact_phone
    ? `tel:${booking.tenant.contact_phone}`
    : null;

  // Mixed-outcome detection for multi-appointment booking groups
  const approvedStatuses = new Set(["approved", "not_required", "reschedule_accepted"]);
  const contactStatuses = new Set(["declined", "cancelled", "reschedule_proposed"]);

  const allGroupItems: Array<{
    id: string;
    approval_status: string | null;
    status: string;
    location: { id: string; name: string; phone: string | null } | null;
  }> = [
    {
      id: booking.id,
      approval_status: approvalBooking.approval_status || "not_required",
      status: booking.status,
      location: booking.location as any,
    },
    ...relatedBookings,
  ];

  const groupApprovedItems = allGroupItems.filter(
    (item) => approvedStatuses.has(item.approval_status || "not_required") && item.status !== "cancelled"
  );
  const groupContactItems = allGroupItems.filter(
    (item) =>
      contactStatuses.has(item.approval_status || "") || item.status === "cancelled"
  );

  const hasMixedOutcomes =
    relatedBookings.length > 0 && groupApprovedItems.length > 0 && groupContactItems.length > 0;

  // Unique branches that need contact (for declined/cancelled/rescheduled items)
  const contactBranches = Array.from(
    groupContactItems
      .filter((item) => item.location)
      .reduce((map, item) => {
        if (item.location && !map.has(item.location.id)) {
          map.set(item.location.id, item.location);
        }
        return map;
      }, new Map<string, { id: string; name: string; phone: string | null }>())
      .values()
  );

  const handleCompletePayment = async () => {
    if (!customerRecord?.email) {
      setError("Customer email missing for payment");
      return;
    }

    setIsStartingPayment(true);
    try {
      const bookingIdsToPay = payableBookings.map((item) => item.id);
      const pageUrl = window.location.href;
      await startClientBookingPayment({
        tenantId: booking.tenant_id,
        appointmentIds: bookingIdsToPay,
        amount: outstandingAmount,
        currency,
        customerEmail: customerRecord.email,
        customerName: customerRecord.full_name || "Customer",
        description: bookingReference
          ? `Complete payment for booking ${bookingReference}`
          : `Complete payment for booking ${booking.id}`,
        successUrl: pageUrl,
        cancelUrl: pageUrl,
      });
    } catch (paymentError) {
      console.error("Error starting booking payment:", paymentError);
      setError(paymentError instanceof Error ? paymentError.message : "Failed to start payment");
      setIsStartingPayment(false);
    }
  };

  const handleRescheduleResponse = async (response: "accept" | "decline") => {
    if (!booking.id) return;

    setIsRespondingToProposal(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke("respond-booking-reschedule", {
        body: {
          appointmentId: booking.id,
          response,
        },
      });

      if (invokeError) throw invokeError;
      await handleActionComplete();
    } catch (responseError) {
      console.error("Error responding to reschedule proposal:", responseError);
      setError(responseError instanceof Error ? responseError.message : "Failed to update reschedule request");
    } finally {
      setIsRespondingToProposal(false);
    }
  };

  return (
    <ClientSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/bookings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">Booking Details</h1>
            <p className="text-sm text-muted-foreground">
              {booking.tenant?.name || "Salon"}
            </p>
          </div>
        </div>

        {/* Payment verification banner */}
        {isVerifyingPayment && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
              <p className="text-sm font-medium text-primary">Verifying your payment — please wait…</p>
            </CardContent>
          </Card>
        )}
        {paymentVerified && !isVerifyingPayment && (
          <Card className="border-green-300 bg-green-50">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-green-800">Payment confirmed. Your booking is updated below.</p>
            </CardContent>
          </Card>
        )}

        {/* Status Cards */}
        <div className="flex flex-wrap gap-2">
          <Badge className={status.className}>{status.label}</Badge>
          <Badge className={payment.className}>{payment.label}</Badge>
          <Badge className={approvalStatus.className}>{approvalStatus.label}</Badge>
          {booking.is_walk_in && <Badge variant="outline">Walk-in</Badge>}
          {bookingReference && <Badge variant="outline">Ref {bookingReference}</Badge>}
        </div>

        {showPendingApprovalState && (
          <Card className="border-amber-300 bg-amber-50/70">
            <CardContent className="pt-6">
              <p className="font-medium text-amber-950">This booking is awaiting salon confirmation.</p>
              <p className="mt-1 text-sm text-amber-900/80">
                Payment will become available after the salon accepts the request and issues your invoice.
              </p>
            </CardContent>
          </Card>
        )}

        {showRescheduleProposal && (
          <Card className="border-sky-300 bg-sky-50/70">
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="font-medium text-sky-950">The salon proposed a new time for this booking.</p>
                <p className="mt-1 text-sm text-sky-900/80">
                  Review the proposed time and either accept it, decline it, or contact the salon directly.
                </p>
              </div>

              <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm">
                <p className="font-medium text-foreground">
                  {approvalBooking.proposed_start
                    ? format(new Date(approvalBooking.proposed_start), "EEEE, MMMM d, yyyy · h:mm a")
                    : "Proposal pending"}
                  {approvalBooking.proposed_end && (
                    <span className="text-muted-foreground">
                      {" "}to {format(new Date(approvalBooking.proposed_end), "h:mm a")}
                    </span>
                  )}
                </p>
                {approvalBooking.proposed_message && (
                  <p className="mt-2 text-muted-foreground">{approvalBooking.proposed_message}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleRescheduleResponse("accept")}
                  disabled={isRespondingToProposal}
                >
                  {isRespondingToProposal ? "Updating..." : "Accept reschedule"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleRescheduleResponse("decline")}
                  disabled={isRespondingToProposal}
                >
                  Decline
                </Button>
                {salonContactHref && (
                  <Button asChild variant="ghost">
                    <a href={salonContactHref}>Contact salon</a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {(bookingReference || giftRecipient || deliveryAddress || relatedBookings.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Booking Group</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {bookingReference && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-medium">{bookingReference}</span>
                </div>
              )}
              {bookingMetadata?.line_item?.schedule_mode === "leave_unscheduled" && (
                <p className="text-muted-foreground">This item was left unscheduled and will be confirmed by the salon.</p>
              )}
              {giftRecipient && (
                <div className="flex items-start gap-2 rounded-lg border p-3">
                  <Gift className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">
                      Gift recipient: {[giftRecipient.firstName, giftRecipient.lastName].filter(Boolean).join(" ")}
                    </p>
                    {giftRecipient.email && (
                      <p className="text-muted-foreground">{giftRecipient.email}</p>
                    )}
                  </div>
                </div>
              )}
              {deliveryAddress && (
                <div className="flex items-start gap-2 rounded-lg border p-3">
                  <Truck className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">Delivery address</p>
                    <p className="text-muted-foreground">
                      {[deliveryAddress.line1, deliveryAddress.city, deliveryAddress.country].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              )}
              {relatedBookings.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium">Other items from this checkout</p>
                  {relatedBookings.map((related) => {
                    const siblingApprovalLabel =
                      related.approval_status === "declined" ? "Declined"
                      : related.approval_status === "reschedule_proposed" ? "Reschedule proposed"
                      : related.approval_status === "pending" ? "Awaiting approval"
                      : related.approval_status === "approved" || related.approval_status === "not_required" ? "Approved"
                      : related.status;
                    const siblingApprovalClass =
                      related.approval_status === "declined" ? "text-destructive"
                      : related.approval_status === "reschedule_proposed" ? "text-sky-700"
                      : related.approval_status === "pending" ? "text-amber-700"
                      : "text-emerald-700";
                    return (
                      <div key={related.id} className="flex items-center justify-between rounded-lg border px-3 py-2 gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {related.scheduled_start ? format(new Date(related.scheduled_start), "EEE, MMM d · h:mm a") : "Unscheduled item"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {related.location && (
                              <p className="text-xs text-muted-foreground truncate">{related.location.name}</p>
                            )}
                            <span className={`text-xs font-medium ${siblingApprovalClass}`}>{siblingApprovalLabel}</span>
                          </div>
                        </div>
                        <span className="text-sm font-medium shrink-0">{formatCurrency(Number(related.total_amount || 0), currency)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mixed outcome card — some approved, some declined/rescheduled */}
        {hasMixedOutcomes && (
          <Card className="border-amber-300 bg-amber-50/60">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-950">Partial approval on this booking group</p>
                  <p className="mt-1 text-sm text-amber-900/80">
                    Some items were approved and others were declined or require rescheduling. You can proceed to pay for the approved items and contact the relevant branch for the others.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-900 font-medium">{groupApprovedItems.length} item{groupApprovedItems.length !== 1 ? "s" : ""} approved — ready to pay</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-destructive/90 font-medium">{groupContactItems.length} item{groupContactItems.length !== 1 ? "s" : ""} declined or rescheduled — contact branch</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {canCompletePayment && (
                  <Button size="sm" onClick={handleCompletePayment} disabled={isStartingPayment}>
                    {isStartingPayment ? "Opening payment..." : "Proceed to Pay"}
                  </Button>
                )}
                {contactBranches.map((branch) => (
                  <Button
                    key={branch.id}
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-900 hover:bg-amber-100"
                  >
                    <a href={branch.phone ? `tel:${branch.phone}` : "#"}>
                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                      Contact {branch.name}
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                {products.map((product) => (
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
                  {formatCurrency(outstandingAmount || (booking.total_amount - booking.amount_paid), currency)}
                </span>
              </div>
            )}

            {pendingReference && (
              <Button
                className="w-full"
                variant="outline"
                onClick={handleCheckPaymentStatus}
                disabled={isVerifyingPayment}
              >
                {isVerifyingPayment ? "Checking..." : "Check Payment Status"}
              </Button>
            )}

            {canCompletePayment && !pendingReference && (
              <Button
                className="w-full"
                onClick={handleCompletePayment}
                disabled={isStartingPayment}
              >
                {isStartingPayment ? "Opening payment..." : "Complete Payment"}
              </Button>
            )}

            {!canCompletePayment && booking.amount_paid < booking.total_amount && !showPendingApprovalState && !showRescheduleProposal && (
              <p className="text-sm text-muted-foreground">
                Payment can be completed here once a valid customer email is available.
              </p>
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
