import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
} from "date-fns";
import { Card, CardContent } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { AppointmentBlock } from "./AppointmentBlock";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";

interface WeekViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  isLoading: boolean;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

export function WeekView({
  date,
  appointments,
  isLoading,
  onAppointmentClick,
}: WeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter((apt) => {
      if (!apt.scheduled_start) return false;
      return isSameDay(new Date(apt.scheduled_start), day);
    });
  };

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[980px] grid grid-cols-7 divide-x">
          {days.map((day) => (
            <div key={day.toISOString()} className="min-w-[140px] min-h-[300px]">
              <div
                className={`p-2 border-b text-center ${
                  isToday(day) ? "bg-primary/10" : "bg-muted/30"
                }`}
              >
                <div className="text-xs text-muted-foreground">
                  {format(day, "EEE")}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isToday(day) ? "text-primary" : ""
                  }`}
                >
                  {format(day, "d")}
                </div>
              </div>
              <div className="p-1 space-y-1">
                {isLoading ? (
                  <>
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </>
                ) : (
                  getAppointmentsForDay(day).map((apt) => (
                    <AppointmentBlock
                      key={apt.id}
                      appointment={apt}
                      onClick={onAppointmentClick}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
