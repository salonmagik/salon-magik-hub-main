import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Switch } from "@ui/switch";
import { Label } from "@ui/label";
import { Skeleton } from "@ui/skeleton";
import {
  Clock,
  User,
  Phone,
  FileText,
  Calendar,
  Gift,
  CreditCard,
  Package,
  ShoppingBag,
  Loader2,
} from "lucide-react";
import { useAppointmentProducts, type AppointmentProduct } from "@/hooks/useAppointmentProducts";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";
import type { Enums } from "@supabase-client";

type AppointmentStatus = Enums<"appointment_status">;

const statusConfig: Record<AppointmentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  started: { label: "In Progress", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  rescheduled: { label: "Rescheduled", variant: "outline" },
};

const fulfillmentStatusConfig = {
  pending: { label: "Pending", className: "bg-warning/10 text-warning-foreground" },
  ready: { label: "Ready", className: "bg-primary/10 text-primary" },
  fulfilled: { label: "Fulfilled", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

interface AppointmentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: CalendarAppointment | null;
  onRefresh?: () => void;
  onOpenApprovalAction?: (action: "approve" | "decline" | "reschedule" | "review", appointment: CalendarAppointment) => void;
}

type AppointmentBookingMetadata = {
  line_item?: {
    branch_name?: string | null;
    schedule_mode?: string | null;
    fulfillment_type?: string | null;
    type?: string | null;
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

export function AppointmentDetailsDialog({
  open,
  onOpenChange,
  appointment,
  onRefresh,
  onOpenApprovalAction,
}: AppointmentDetailsDialogProps) {
  const navigate = useNavigate();
  const { currentTenant, roles } = useAuth();
  const [isGifted, setIsGifted] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { products, isLoading: productsLoading } = useAppointmentProducts(appointment?.id);

  const currency = currentTenant?.currency || "USD";
  const isStaffRole = roles.some((r) => r.role === "staff" && r.tenant_id === currentTenant?.id);

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      NGN: "₦",
      GHS: "₵",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || ""}${Number(amount).toLocaleString()}`;
  };

  useEffect(() => {
    if (appointment) {
      setIsGifted(appointment.is_gifted || false);
    }
  }, [appointment]);

  if (!appointment) return null;

  const { label, variant } = statusConfig[appointment.status];
  const approvalStatus = (appointment as CalendarAppointment & { approval_status?: string | null }).approval_status || "not_required";
  const confirmationStatus = (appointment as CalendarAppointment & { confirmation_status?: string | null }).confirmation_status || null;
  const bookingReference = (appointment as CalendarAppointment & { booking_reference?: string | null }).booking_reference || null;
  const bookingMetadata = ((appointment as CalendarAppointment & { booking_metadata?: AppointmentBookingMetadata }).booking_metadata || null) as AppointmentBookingMetadata;
  const scheduledDate = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "EEEE, MMMM d, yyyy")
    : "Not scheduled";
  const scheduledTime = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "h:mm a")
    : "—";
  const bookedOn = format(new Date(appointment.created_at), "MMM d, yyyy 'at' h:mm a");

  const totalDuration = appointment.services.reduce(
    (sum, s) => sum + (s.duration_minutes || 0),
    0
  );

  const servicesSubtotal = appointment.services.reduce(
    (sum, s) => sum + Number(s.price || 0),
    0
  );

  const productsSubtotal = products.reduce(
    (sum, p) => sum + Number(p.total_price || 0),
    0
  );

  const totalAmount = Number(appointment.total_amount) || servicesSubtotal + productsSubtotal;
  const amountPaid = Number(appointment.amount_paid) || 0;
  const paidOffline = appointment.transactions?.some(
    (transaction) => transaction.provider === "offline" && transaction.method === "cash" && transaction.status === "completed",
  );
  const balanceDue = appointment.status === "cancelled" ? 0 : Math.max(0, totalAmount - amountPaid);
  const confirmationConfig: Record<string, { label: string; className: string }> = {
    pending: { label: "Unconfirmed", className: "bg-amber-100 text-amber-800" },
    approved: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
    declined: { label: "Declined", className: "bg-rose-100 text-rose-800" },
    reschedule_proposed: { label: "Reschedule Proposed", className: "bg-sky-100 text-sky-800" },
    reschedule_accepted: { label: "Reschedule Accepted", className: "bg-emerald-100 text-emerald-800" },
    reschedule_declined: { label: "Reschedule Declined", className: "bg-orange-100 text-orange-800" },
    not_required: {
      label: confirmationStatus === "auto" ? "Auto-confirmed" : "Confirmed",
      className: "bg-slate-100 text-slate-800",
    },
  };
  const confirmationBadge = confirmationConfig[approvalStatus] || {
    label: approvalStatus.replace(/_/g, " "),
    className: "bg-slate-100 text-slate-800",
  };
  const isAwaitingApproval = approvalStatus === "pending";
  const showRescheduleAction = (() => {
    const lineItemType = bookingMetadata?.line_item?.type || null;
    const fulfillmentType = bookingMetadata?.line_item?.fulfillment_type || null;
    if (lineItemType === "service") return true;
    if (lineItemType === "product" || lineItemType === "package") return false;
    if (lineItemType === "product") return false;
    if (fulfillmentType === "pickup" || fulfillmentType === "delivery") return false;
    if (appointment.services.length > 0) return true;
    return true;
  })();
  const reviewActionLabel = (() => {
    const lineItemType = bookingMetadata?.line_item?.type || null;
    if (lineItemType === "product" || lineItemType === "package") return "Review order";
    return "Review booking";
  })();

  const handleGiftedToggle = async (checked: boolean) => {
    if (!appointment?.id) return;
    
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ is_gifted: checked })
        .eq("id", appointment.id);

      if (error) throw error;

      setIsGifted(checked);
      toast({ 
        title: checked ? "Marked as gifted" : "Removed gifted status",
        description: checked ? "This appointment is now marked as a gift" : "Gifted status removed",
      });
      onRefresh?.();
    } catch (err) {
      console.error("Error updating gifted status:", err);
      toast({ 
        title: "Error", 
        description: "Failed to update gifted status", 
        variant: "destructive" 
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleGoToAppointments = () => {
    onOpenChange(false);
    navigate("/salon/appointments");
  };

  // Mask phone for staff role
  const maskedPhone = isStaffRole && appointment.customer?.phone
    ? appointment.customer.phone.replace(/(\d{3})\d{4}(\d{2,})/, "$1****$2")
    : appointment.customer?.phone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="flex-shrink-0 border-b border-border/60 pb-5">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3 text-2xl">
            <span>Appointment details</span>
            <div className="flex items-center gap-2">
              {isGifted && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1">
                  <Gift className="w-3 h-3" />
                  Gifted
                </Badge>
              )}
              <Badge variant={variant}>{label}</Badge>
              <Badge variant="secondary" className={confirmationBadge.className}>
                {confirmationBadge.label}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
          <div className="space-y-4 py-1 pr-1">
            {/* Customer Info */}
            <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f1eafa] text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">
                  {appointment.customer?.full_name || "Walk-in Customer"}
                </p>
                {appointment.customer?.phone && (
                  <p className={`text-sm text-muted-foreground flex items-center gap-1 ${isStaffRole ? 'blur-sm select-none' : ''}`}>
                    <Phone className="w-3 h-3" />
                    {maskedPhone}
                  </p>
                )}
              </div>
            </div>

            {/* Booking Info */}
            <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#fff2ce] text-[#8a6510]">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div>
                  <p className="font-medium">{scheduledDate}</p>
                  {appointment.scheduled_start && (
                    <p className="text-sm text-muted-foreground">at {scheduledTime}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Booked on {bookedOn}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e1f3ec] text-[#268766]">
                <Package className="h-5 w-5" />
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Confirmation</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className={confirmationBadge.className}>
                    {confirmationBadge.label}
                  </Badge>
                  <span className="text-muted-foreground">
                    {approvalStatus === "pending"
                      ? "Customer submitted this booking and it still needs salon action."
                      : approvalStatus === "approved"
                        ? "This booking was accepted by the salon and is ready for invoice/payment."
                        : approvalStatus === "reschedule_proposed"
                          ? "The salon proposed a new time and is waiting for the customer response."
                          : approvalStatus === "declined"
                            ? "This booking request was declined."
                            : "This booking is already confirmed."}
                  </span>
                </div>
              </div>
            </div>

            {(bookingReference || bookingMetadata?.gift || bookingMetadata?.delivery_address || bookingMetadata?.line_item?.schedule_mode === "leave_unscheduled") && (
              <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f1eafa] text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Booking Context</p>
                  {bookingReference && (
                    <p className="text-muted-foreground">Reference: <span className="font-medium text-foreground">{bookingReference}</span></p>
                  )}
                  {bookingMetadata?.line_item?.schedule_mode === "leave_unscheduled" && (
                    <p className="text-muted-foreground">This item was left unscheduled during checkout.</p>
                  )}
                  {bookingMetadata?.line_item?.fulfillment_type && (
                    <p className="text-muted-foreground capitalize">
                      Fulfillment: <span className="font-medium text-foreground">{bookingMetadata.line_item.fulfillment_type}</span>
                    </p>
                  )}
                  {bookingMetadata?.gift?.recipient && (
                    <p className="text-muted-foreground">
                      Gift recipient:{" "}
                      <span className="font-medium text-foreground">
                        {[bookingMetadata.gift.recipient.firstName, bookingMetadata.gift.recipient.lastName].filter(Boolean).join(" ")}
                      </span>
                    </p>
                  )}
                  {bookingMetadata?.delivery_address && (
                    <p className="text-muted-foreground">
                      Delivery:{" "}
                      <span className="font-medium text-foreground">
                        {[bookingMetadata.delivery_address.line1, bookingMetadata.delivery_address.city, bookingMetadata.delivery_address.country].filter(Boolean).join(", ")}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Services */}
            <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f1eafa] text-primary">
                <Clock className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium mb-2">Services</p>
                <div className="space-y-2">
                  {appointment.services.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between text-sm py-1 border-b border-dashed last:border-0"
                    >
                      <div>
                        <p>{service.service_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {service.duration_minutes} min
                        </p>
                      </div>
                      <p className="font-medium">
                        {formatCurrency(Number(service.price))}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm mt-2 pt-2 border-t">
                  <span className="text-muted-foreground">
                    {appointment.services.length} service(s) · {totalDuration} min
                  </span>
                  <span className="font-medium">{formatCurrency(servicesSubtotal)}</span>
                </div>
              </div>
            </div>

            {/* Products */}
            <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#fff2ce] text-[#8a6510]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium mb-2">Products</p>
                {productsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products purchased</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {products.map((product) => {
                        const statusConf = fulfillmentStatusConfig[product.fulfillment_status as keyof typeof fulfillmentStatusConfig];
                        return (
                          <div
                            key={product.id}
                            className="flex items-center justify-between text-sm py-1 border-b border-dashed last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              <div>
                                <p>{product.product_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Qty: {product.quantity} × {formatCurrency(Number(product.unit_price))}
                                </p>
                              </div>
                              <Badge variant="secondary" className={statusConf?.className}>
                                {statusConf?.label || product.fulfillment_status}
                              </Badge>
                            </div>
                            <p className="font-medium">
                              {formatCurrency(Number(product.total_price))}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-sm mt-2 pt-2 border-t">
                      <span className="text-muted-foreground">
                        {products.length} product(s)
                      </span>
                      <span className="font-medium">{formatCurrency(productsSubtotal)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e1f3ec] text-[#268766]">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-medium">Payment Summary</p>
                {paidOffline && (
                  <Badge variant="outline" className="border-success/50 text-success">
                    Paid offline
                  </Badge>
                )}
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="text-success">{formatCurrency(amountPaid)}</span>
                  </div>
                  {["refunded_partial", "refunded_full"].includes(appointment.payment_status) && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Refund status</span>
                      <span className="text-primary">
                        {appointment.payment_status === "refunded_full" ? "Fully refunded" : "Partially refunded"}
                      </span>
                    </div>
                  )}
                  {balanceDue > 0 && (
                    <div className="flex justify-between font-medium">
                      <span>Balance Due</span>
                      <span className="text-destructive">{formatCurrency(balanceDue)}</span>
                    </div>
                  )}
                  {appointment.status === "cancelled" && (
                    <div className="flex justify-between font-medium">
                      <span>Balance Due</span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <div className="flex items-start gap-3 rounded-[14px] border border-border/60 bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {appointment.notes}
                  </p>
                </div>
              </div>
            )}

            {/* Gifted Toggle */}
            <div className="flex items-center justify-between rounded-[14px] border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="gifted-toggle" className="text-sm cursor-pointer">
                  Mark as Gifted
                </Label>
              </div>
              <Switch
                id="gifted-toggle"
                checked={isGifted}
                onCheckedChange={handleGiftedToggle}
                disabled={isUpdating}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 flex-col gap-2 border-t border-border/60 pt-5 sm:flex-row">
          <Button variant="outline" className="rounded-full px-6" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isAwaitingApproval && onOpenApprovalAction && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenApprovalAction("decline", appointment)}
              >
                Decline
              </Button>
              {showRescheduleAction && (
                <Button
                  variant="outline"
                  onClick={() => onOpenApprovalAction("reschedule", appointment)}
                >
                  Reschedule
                </Button>
              )}
              {bookingReference && (
                <Button
                  variant="outline"
                  onClick={() => onOpenApprovalAction("review", appointment)}
                >
                  {reviewActionLabel}
                </Button>
              )}
              <Button onClick={() => onOpenApprovalAction("approve", appointment)}>
                Accept
              </Button>
            </>
          )}
          <Button className="rounded-full px-7" onClick={handleGoToAppointments}>Go to appointments</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
