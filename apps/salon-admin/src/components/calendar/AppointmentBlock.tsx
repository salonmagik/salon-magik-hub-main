import { format } from "date-fns";
import { Clock } from "lucide-react";
import { Badge } from "@ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@ui/hover-card";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";
import type { Enums } from "@supabase-client";

type AppointmentStatus = Enums<"appointment_status">;

const statusColors: Record<AppointmentStatus, string> = {
  scheduled: "border-emerald-500 bg-emerald-50 text-emerald-950",
  started: "border-violet-500 bg-violet-50 text-violet-950",
  paused: "border-amber-500 bg-amber-50 text-amber-950",
  completed: "border-teal-500 bg-teal-50 text-teal-950",
  cancelled: "border-rose-500 bg-rose-50 text-rose-950",
  rescheduled: "border-sky-500 bg-sky-50 text-sky-950",
};

const statusAccent: Record<AppointmentStatus, string> = {
  scheduled: "border-t-emerald-500",
  started: "border-t-violet-500",
  paused: "border-t-amber-500",
  completed: "border-t-teal-500",
  cancelled: "border-t-rose-500",
  rescheduled: "border-t-sky-500",
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
  const paidOffline = appointment.transactions?.some(
    (transaction) => transaction.provider === "offline" && transaction.method === "cash" && transaction.status === "completed",
  );

  const blockContent = (
    <div
      onClick={() => onClick(appointment)}
      className={`mb-1 cursor-pointer rounded-[10px] border-2 border-l-4 p-2.5 text-xs shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${statusColors[appointment.status]}`}
    >
      <div className="font-medium truncate">{customerName}</div>
      <div className="mt-1 flex items-center gap-1 opacity-70">
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
      <HoverCardContent
        className={`w-72 overflow-hidden rounded-[18px] border border-t-4 bg-white p-0 shadow-xl ${statusAccent[appointment.status]}`}
        side="right"
        align="start"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold">{customerName}</p>
            <div className="flex gap-1">
              {paidOffline && <Badge variant="outline" className="text-xs text-success">Paid offline</Badge>}
              <Badge variant="secondary" className="text-xs">{statusLabels[appointment.status]}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-muted/50 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Service</p>
              <p className="mt-0.5 font-medium">{serviceName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="mt-0.5 font-medium">{startTime}</p>
            </div>
          </div>
          <button
            onClick={() => onClick(appointment)}
            className="h-10 w-full rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            View appointment
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
  const paidOffline = appointment.transactions?.some(
    (transaction) => transaction.provider === "offline" && transaction.method === "cash" && transaction.status === "completed",
  );

  const itemContent = (
    <div
      onClick={() => onClick(appointment)}
      className={`cursor-pointer truncate rounded-md border-2 border-l-4 px-1.5 py-1 text-[10px] font-medium shadow-sm transition-opacity hover:opacity-80 ${statusColors[appointment.status]}`}
    >
      {startTime} {firstName}
    </div>
  );

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{itemContent}</HoverCardTrigger>
      <HoverCardContent
        className={`w-72 overflow-hidden rounded-[18px] border border-t-4 bg-white p-0 shadow-xl ${statusAccent[appointment.status]}`}
        side="right"
        align="start"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold">
              {appointment.customer?.full_name || "Walk-in"}
            </p>
            <div className="flex gap-1">
              {paidOffline && <Badge variant="outline" className="text-xs text-success">Paid offline</Badge>}
              <Badge variant="secondary" className="text-xs">{statusLabels[appointment.status]}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-muted/50 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Service</p>
              <p className="mt-0.5 font-medium">{appointment.services[0]?.service_name || "Service"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="mt-0.5 font-medium">
                {appointment.scheduled_start
                  ? format(new Date(appointment.scheduled_start), "h:mm a")
                  : "—"}
              </p>
            </div>
          </div>
          <button
            onClick={() => onClick(appointment)}
            className="h-10 w-full rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            View appointment
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
