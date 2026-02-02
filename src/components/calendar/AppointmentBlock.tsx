import { format } from "date-fns";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";
import type { Enums } from "@/integrations/supabase/types";

type AppointmentStatus = Enums<"appointment_status">;

const statusColors: Record<AppointmentStatus, string> = {
  scheduled: "bg-muted border-muted-foreground/20",
  started: "bg-primary/10 border-primary",
  paused: "bg-warning-bg border-warning",
  completed: "bg-success/10 border-success",
  cancelled: "bg-destructive/10 border-destructive",
  rescheduled: "bg-muted border-muted-foreground/20",
};

const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  started: "In Progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

interface AppointmentBlockProps {
  appointment: CalendarAppointment;
  onClick: (appointment: CalendarAppointment) => void;
  compact?: boolean;
}

export function AppointmentBlock({
  appointment,
  onClick,
  compact = false,
}: AppointmentBlockProps) {
  const startTime = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "h:mm a")
    : "—";
  const serviceName = appointment.services[0]?.service_name || "Service";
  const customerName = appointment.customer?.full_name || "Walk-in";

  const blockContent = (
    <div
      onClick={() => onClick(appointment)}
      className={`p-2 rounded-md border-l-2 text-xs ${statusColors[appointment.status]} mb-1 cursor-pointer hover:opacity-80 transition-opacity`}
    >
      <div className="font-medium truncate">{customerName}</div>
      <div className="text-muted-foreground flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {startTime} · {serviceName}
      </div>
    </div>
  );

  // On mobile (touch devices), hover cards don't work well, so just render the block
  // For desktop, wrap in HoverCard for summary tooltip
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{blockContent}</HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">{customerName}</p>
            <Badge variant="secondary" className="text-xs">
              {statusLabels[appointment.status]}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>
              <span className="font-medium">Service:</span> {serviceName}
            </p>
            <p>
              <span className="font-medium">Time:</span> {startTime}
            </p>
          </div>
          <button
            onClick={() => onClick(appointment)}
            className="text-xs text-primary underline hover:no-underline"
          >
            View more
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Compact version for month view
interface MonthAppointmentItemProps {
  appointment: CalendarAppointment;
  onClick: (appointment: CalendarAppointment) => void;
}

export function MonthAppointmentItem({
  appointment,
  onClick,
}: MonthAppointmentItemProps) {
  const startTime = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "h:mm")
    : "";
  const firstName = appointment.customer?.full_name?.split(" ")[0] || "Guest";

  const itemContent = (
    <div
      onClick={() => onClick(appointment)}
      className={`text-[10px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity ${statusColors[appointment.status]}`}
    >
      {startTime} {firstName}
    </div>
  );

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{itemContent}</HoverCardTrigger>
      <HoverCardContent className="w-56 p-3" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">
              {appointment.customer?.full_name || "Walk-in"}
            </p>
            <Badge variant="secondary" className="text-xs">
              {statusLabels[appointment.status]}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>
              <span className="font-medium">Service:</span>{" "}
              {appointment.services[0]?.service_name || "Service"}
            </p>
            <p>
              <span className="font-medium">Time:</span>{" "}
              {appointment.scheduled_start
                ? format(new Date(appointment.scheduled_start), "h:mm a")
                : "—"}
            </p>
          </div>
          <button
            onClick={() => onClick(appointment)}
            className="text-xs text-primary underline hover:no-underline"
          >
            View more
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
