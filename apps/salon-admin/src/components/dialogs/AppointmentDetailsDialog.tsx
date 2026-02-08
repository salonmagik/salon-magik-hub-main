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
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { ScrollArea } from "@ui/scroll-area";
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
}

export function AppointmentDetailsDialog({
  open,
  onOpenChange,
  appointment,
  onRefresh,
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
  const balanceDue = totalAmount - amountPaid;

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
      <DialogContent className="mx-4 max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span>Appointment Details</span>
            <div className="flex items-center gap-2">
              {isGifted && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1">
                  <Gift className="w-3 h-3" />
                  Gifted
                </Badge>
              )}
              <Badge variant={variant}>{label}</Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-5 py-2 pr-4">
            {/* Customer Info */}
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-muted-foreground mt-0.5" />
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
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
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

            {/* Services */}
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
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
            <div className="flex items-start gap-3">
              <ShoppingBag className="w-5 h-5 text-muted-foreground mt-0.5" />
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

            <Separator />

            {/* Payment Summary */}
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="font-medium">Payment Summary</p>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="text-success">{formatCurrency(amountPaid)}</span>
                  </div>
                  {balanceDue > 0 && (
                    <div className="flex justify-between font-medium">
                      <span>Balance Due</span>
                      <span className="text-destructive">{formatCurrency(balanceDue)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {appointment.notes}
                  </p>
                </div>
              </div>
            )}

            <Separator />

            {/* Gifted Toggle */}
            <div className="flex items-center justify-between">
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
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleGoToAppointments}>Go to Appointments</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
