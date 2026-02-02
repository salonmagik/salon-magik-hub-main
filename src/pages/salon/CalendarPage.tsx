import { useState, useMemo } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
} from "lucide-react";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { useCalendarAppointments, type CalendarView, type CalendarAppointment } from "@/hooks/useCalendarAppointments";
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

function AppointmentBlock({ appointment }: { appointment: CalendarAppointment }) {
  const startTime = appointment.scheduled_start
    ? format(new Date(appointment.scheduled_start), "h:mm a")
    : "—";
  const serviceName = appointment.services[0]?.service_name || "Service";

  return (
    <div
      className={`p-2 rounded-md border-l-2 text-xs ${statusColors[appointment.status]} mb-1 cursor-default`}
    >
      <div className="font-medium truncate">
        {appointment.customer?.full_name || "Walk-in"}
      </div>
      <div className="text-muted-foreground flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {startTime} · {serviceName}
      </div>
    </div>
  );
}

function DayView({
  date,
  appointments,
  isLoading,
}: {
  date: Date;
  appointments: CalendarAppointment[];
  isLoading: boolean;
}) {
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
                      <AppointmentBlock key={apt.id} appointment={apt} />
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

function WeekView({
  date,
  appointments,
  isLoading,
}: {
  date: Date;
  appointments: CalendarAppointment[];
  isLoading: boolean;
}) {
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
      <CardContent className="p-0">
        <div className="grid grid-cols-7 divide-x">
          {days.map((day) => (
            <div key={day.toISOString()} className="min-h-[300px]">
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
                    <AppointmentBlock key={apt.id} appointment={apt} />
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

function MonthView({
  date,
  appointments,
  isLoading,
}: {
  date: Date;
  appointments: CalendarAppointment[];
  isLoading: boolean;
}) {
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
      <CardContent className="p-0">
        {/* Header */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        {/* Calendar Grid */}
        <div className="divide-y">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 divide-x min-h-[100px]">
              {week.map((day) => {
                const dayAppointments = getAppointmentsForDay(day);
                const isCurrentMonth = isSameMonth(day, date);
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-1 ${!isCurrentMonth ? "bg-muted/20" : ""}`}
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
                          <div
                            key={apt.id}
                            className={`text-[10px] px-1 py-0.5 rounded truncate ${statusColors[apt.status]}`}
                          >
                            {apt.scheduled_start
                              ? format(new Date(apt.scheduled_start), "h:mm")
                              : ""}{" "}
                            {apt.customer?.full_name?.split(" ")[0] || "Guest"}
                          </div>
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
      </CardContent>
    </Card>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const { appointments, isLoading, refetch } = useCalendarAppointments({
    view,
    date: currentDate,
  });

  const navigatePrev = () => {
    switch (view) {
      case "day":
        setCurrentDate(subDays(currentDate, 1));
        break;
      case "week":
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(subMonths(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (view) {
      case "day":
        setCurrentDate(addDays(currentDate, 1));
        break;
      case "week":
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(addMonths(currentDate, 1));
        break;
    }
  };

  const navigateToday = () => {
    setCurrentDate(new Date());
  };

  const getTitle = () => {
    switch (view) {
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
      case "month":
        return format(currentDate, "MMMM yyyy");
    }
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Calendar</h1>
            <p className="text-muted-foreground">
              View your appointments at a glance
            </p>
          </div>
        </div>

        {/* Navigation & View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={navigatePrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={navigateToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={navigateNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <h2 className="text-lg font-medium ml-2">{getTitle()}</h2>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as CalendarView)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-muted border border-muted-foreground/20" />
            <span className="text-muted-foreground">Scheduled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary/10 border border-primary" />
            <span className="text-muted-foreground">In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-success/10 border border-success" />
            <span className="text-muted-foreground">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-destructive/10 border border-destructive" />
            <span className="text-muted-foreground">Cancelled</span>
          </div>
        </div>

        {/* Calendar View */}
        <div className="overflow-x-auto">
          {view === "day" && (
            <DayView date={currentDate} appointments={appointments} isLoading={isLoading} />
          )}
          {view === "week" && (
            <WeekView date={currentDate} appointments={appointments} isLoading={isLoading} />
          )}
          {view === "month" && (
            <MonthView date={currentDate} appointments={appointments} isLoading={isLoading} />
          )}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <CalendarIcon className="w-4 h-4" />
            <span>{appointments.length} appointments</span>
          </div>
          {appointments.filter((a) => a.status === "scheduled").length > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>
                {appointments.filter((a) => a.status === "scheduled").length} upcoming
              </span>
            </div>
          )}
        </div>
      </div>
    </SalonSidebar>
  );
}
