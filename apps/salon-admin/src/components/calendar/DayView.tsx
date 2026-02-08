import { format, isSameDay } from "date-fns";
import { Card, CardContent } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { AppointmentBlock } from "./AppointmentBlock";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";

interface DayViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  isLoading: boolean;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

export function DayView({
  date,
  appointments,
  isLoading,
  onAppointmentClick,
}: DayViewProps) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

  const getAppointmentsForHour = (hour: number) => {
    return appointments.filter((apt) => {
      if (!apt.scheduled_start) return false;
      const aptHour = new Date(apt.scheduled_start).getHours();
      return aptHour === hour;
    });
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {hours.map((hour) => {
            const hourAppointments = getAppointmentsForHour(hour);
            return (
              <div key={hour} className="flex min-h-[60px]">
                <div className="w-20 p-2 text-xs text-muted-foreground border-r bg-muted/30 flex-shrink-0">
                  {format(new Date().setHours(hour, 0), "h:mm a")}
                </div>
                <div className="flex-1 p-2">
                  {isLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    hourAppointments.map((apt) => (
                      <AppointmentBlock
                        key={apt.id}
                        appointment={apt}
                        onClick={onAppointmentClick}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
