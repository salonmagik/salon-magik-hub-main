import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Phone, FileText, Calendar } from "lucide-react";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";
import type { Enums } from "@/integrations/supabase/types";

type AppointmentStatus = Enums<"appointment_status">;

const statusConfig: Record<AppointmentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  started: { label: "In Progress", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  rescheduled: { label: "Rescheduled", variant: "outline" },
};

interface AppointmentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: CalendarAppointment | null;
}

export function AppointmentDetailsDialog({
  open,
  onOpenChange,
  appointment,
}: AppointmentDetailsDialogProps) {
  const navigate = useNavigate();

  if (!appointment) return null;

  const { label, variant } = statusConfig[appointment.status];
  const scheduledDate = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "EEEE, MMMM d, yyyy")
    : "Not scheduled";
  const scheduledTime = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "h:mm a")
    : "—";

  const totalDuration = appointment.services.reduce(
    (sum, s) => sum + (s.duration_minutes || 0),
    0
  );

  const handleGoToAppointments = () => {
    onOpenChange(false);
    navigate("/salon/appointments");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Appointment Details</span>
            <Badge variant={variant}>{label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer Info */}
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">
                {appointment.customer?.full_name || "Walk-in Customer"}
              </p>
              {appointment.customer?.phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {appointment.customer.phone}
                </p>
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">{scheduledDate}</p>
              <p className="text-sm text-muted-foreground">at {scheduledTime}</p>
            </div>
          </div>

          {/* Services */}
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">Services</p>
              <ul className="text-sm text-muted-foreground space-y-1 mt-1">
                {appointment.services.map((service) => (
                  <li key={service.id}>
                    {service.service_name} ({service.duration_minutes} min)
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-1">
                Total: {totalDuration} minutes
              </p>
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
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleGoToAppointments}>Go to Appointments</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
