import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import type { ClientAppointmentWithDetails } from "@/hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { Button } from "@ui/button";
import { Calendar, Clock, MapPin } from "lucide-react";

interface UpcomingAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: ClientAppointmentWithDetails | null;
}

// Lighter reuse of the same dialog shell as Package/Product detail: a
// header, a short list of key facts, and one primary action. The full
// appointment experience (reschedule, cancel, payment) already lives on
// /bookings/:id, so this stays a quick-look summary that hands off there.
export function UpcomingAppointmentDialog({ open, onOpenChange, booking }: UpcomingAppointmentDialogProps) {
  const navigate = useNavigate();

  if (!booking) return null;

  const fromPackage = (booking.services || []).some((service) => !!service.package_id);
  const title = booking.services && booking.services.length > 0 ? booking.services[0].service_name : "Appointment";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {fromPackage ? "Booked as a package session" : "Upcoming appointment"}
            {booking.tenant?.name ? ` · ${booking.tenant.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className={cn(DIALOG_BODY_PADDING, "space-y-4")}>
          {booking.scheduled_start && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(booking.scheduled_start), "EEEE, MMMM d, yyyy")}</span>
            </div>
          )}
          {booking.scheduled_start && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(booking.scheduled_start), "h:mm a")}
                {booking.scheduled_end ? ` - ${format(new Date(booking.scheduled_end), "h:mm a")}` : ""}
              </span>
            </div>
          )}
          {booking.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{booking.location.name}, {booking.location.city}</span>
            </div>
          )}

          <Button className="w-full" onClick={() => navigate(`/bookings/${booking.id}`)}>
            View booking details
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
