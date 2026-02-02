import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthAppointmentItem } from "./AppointmentBlock";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";

interface MonthViewProps {
  date: Date;
  appointments: CalendarAppointment[];
  isLoading: boolean;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
}

export function MonthView({
  date,
  appointments,
  isLoading,
  onAppointmentClick,
}: MonthViewProps) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter((apt) => {
      if (!apt.scheduled_start) return false;
      return isSameDay(new Date(apt.scheduled_start), day);
    });
  };

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div
                key={day}
                className="min-w-[100px] p-2 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          {/* Calendar Grid */}
          <div className="divide-y">
            {weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className="grid grid-cols-7 divide-x min-h-[100px]"
              >
                {week.map((day) => {
                  const dayAppointments = getAppointmentsForDay(day);
                  const isCurrentMonth = isSameMonth(day, date);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-w-[100px] p-1 ${
                        !isCurrentMonth ? "bg-muted/20" : ""
                      }`}
                    >
                      <div
                        className={`text-xs mb-1 ${
                          isToday(day)
                            ? "w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center"
                            : isCurrentMonth
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </div>
                      {isLoading ? (
                        <Skeleton className="h-4 w-full" />
                      ) : dayAppointments.length > 0 ? (
                        <div className="space-y-0.5">
                          {dayAppointments.slice(0, 2).map((apt) => (
                            <MonthAppointmentItem
                              key={apt.id}
                              appointment={apt}
                              onClick={onAppointmentClick}
                            />
                          ))}
                          {dayAppointments.length > 2 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{dayAppointments.length - 2} more
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
