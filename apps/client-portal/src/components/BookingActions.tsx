import { useState } from "react";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { Textarea } from "@ui/textarea";
import { Label } from "@ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  Navigation, 
  Clock, 
  CalendarClock, 
  XCircle,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { differenceInMinutes, isBefore, addMinutes } from "date-fns";
import type { ClientAppointmentWithDetails } from "@/hooks";

interface BookingActionsProps {
  booking: ClientAppointmentWithDetails;
  onActionComplete?: () => void;
}

type ActionDialogType = "running-late" | "reschedule" | "cancel" | null;

export function BookingActions({ booking, onActionComplete }: BookingActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActionDialogType>(null);
  const [lateMinutes, setLateMinutes] = useState<string>("");
  const [cancelReason, setCancelReason] = useState("");
  const [onMyWayMarked, setOnMyWayMarked] = useState(false);

  const scheduledStart = booking.scheduled_start 
    ? new Date(booking.scheduled_start) 
    : null;
  
  const now = new Date();
  const isBeforeStart = scheduledStart ? isBefore(now, scheduledStart) : false;
  const minutesUntilStart = scheduledStart 
    ? differenceInMinutes(scheduledStart, now) 
    : null;

  // Can mark "On My Way" if scheduled and within 2 hours of start
  const canMarkOnMyWay = isBeforeStart && 
    minutesUntilStart !== null && 
    minutesUntilStart <= 120 &&
    booking.status === "scheduled" &&
    !onMyWayMarked;

  // Can mark "Running Late" if before scheduled start
  const canMarkRunningLate = isBeforeStart && booking.status === "scheduled";

  // Can reschedule if before start
  const canReschedule = isBeforeStart && ["scheduled"].includes(booking.status);

  // Can cancel if before start
  const canCancel = isBeforeStart && ["scheduled"].includes(booking.status);

  const handleOnMyWay = async () => {
    setIsSubmitting(true);
    try {
      // Create a notification for the salon
      const { error } = await supabase.from("notifications").insert({
        tenant_id: booking.tenant_id,
        type: "customer_on_way",
        title: "Customer on their way",
        description: `A customer is on their way for their appointment`,
        entity_type: "appointment",
        entity_id: booking.id,
      });

      if (error) throw error;

      setOnMyWayMarked(true);
      toast.success("The salon has been notified you're on your way!");
      onActionComplete?.();
    } catch (err) {
      console.error("Error marking on my way:", err);
      toast.error("Failed to send notification");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunningLate = async () => {
    if (!lateMinutes) {
      toast.error("Please select how late you'll be");
      return;
    }

    setIsSubmitting(true);
    try {
      const minutes = parseInt(lateMinutes);
      
      // If 30+ minutes late, suggest rescheduling
      if (minutes >= 30) {
        toast.info("Consider rescheduling for a better experience", {
          action: {
            label: "Reschedule",
            onClick: () => {
              setActiveDialog("reschedule");
            },
          },
        });
      }

      // Create notification for salon
      const { error } = await supabase.from("notifications").insert({
        tenant_id: booking.tenant_id,
        type: "customer_running_late",
        title: "Customer running late",
        description: `Customer will be approximately ${minutes} minutes late`,
        entity_type: "appointment",
        entity_id: booking.id,
        urgent: minutes >= 20,
      });

      if (error) throw error;

      toast.success("The salon has been notified");
      setActiveDialog(null);
      setLateMinutes("");
      onActionComplete?.();
    } catch (err) {
      console.error("Error marking running late:", err);
      toast.error("Failed to send notification");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error("Please provide a reason for cancellation");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          cancellation_reason: cancelReason.trim(),
        })
        .eq("id", booking.id);

      if (error) throw error;

      toast.success("Booking cancelled");
      setActiveDialog(null);
      setCancelReason("");
      onActionComplete?.();
    } catch (err) {
      console.error("Error cancelling booking:", err);
      toast.error("Failed to cancel booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canMarkOnMyWay && !canMarkRunningLate && !canReschedule && !canCancel) {
    return null;
  }

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            {canMarkOnMyWay && (
              <Button
                variant="default"
                size="sm"
                onClick={handleOnMyWay}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                On My Way
              </Button>
            )}

            {canMarkRunningLate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveDialog("running-late")}
              >
                <Clock className="h-4 w-4 mr-2" />
                Running Late
              </Button>
            )}

            {canReschedule && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveDialog("reschedule")}
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                Reschedule
              </Button>
            )}

            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setActiveDialog("cancel")}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Running Late Dialog */}
      <Dialog open={activeDialog === "running-late"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Running Late?</DialogTitle>
            <DialogDescription>
              Let the salon know approximately how late you'll be.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>How late will you be?</Label>
              <Select value={lateMinutes} onValueChange={setLateMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30+ minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {parseInt(lateMinutes) >= 30 && (
              <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <p className="text-sm text-warning">
                  Running 30+ minutes late may affect your appointment. Consider rescheduling for a better experience.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleRunningLate} disabled={isSubmitting || !lateMinutes}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Notify Salon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={activeDialog === "reschedule"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              To reschedule, please contact the salon directly or book a new appointment online.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Self-service rescheduling is coming soon! For now, you can:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Cancel this appointment and book a new one</li>
              <li>Contact the salon directly to request a time change</li>
            </ul>
            
            {booking.deposit_amount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <p className="text-sm text-warning">
                  Note: Cancellation fees may apply based on the salon's policy.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>
              Close
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setActiveDialog("cancel");
              }}
            >
              Cancel Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={activeDialog === "cancel"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for cancellation *</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please let us know why you're cancelling..."
                rows={3}
              />
            </div>

            {booking.deposit_amount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">
                  A deposit of {booking.tenant?.currency || "USD"} {booking.deposit_amount} was paid. 
                  Refund eligibility depends on the salon's cancellation policy.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>
              Keep Appointment
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancel} 
              disabled={isSubmitting || !cancelReason.trim()}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
