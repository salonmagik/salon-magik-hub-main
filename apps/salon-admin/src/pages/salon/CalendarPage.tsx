import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
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
} from "date-fns";
import {
  useCalendarAppointments,
  type CalendarView,
  type CalendarAppointment,
} from "@/hooks/useCalendarAppointments";
import { DayView, WeekView, MonthView } from "@/components/calendar";
import { AppointmentDetailsDialog } from "@/components/dialogs/AppointmentDetailsDialog";

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAppointment, setSelectedAppointment] =
    useState<CalendarAppointment | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const { appointments, isLoading, refetch } = useCalendarAppointments({
    view,
    date: currentDate,
  });

  const handleAppointmentClick = (appointment: CalendarAppointment) => {
    setSelectedAppointment(appointment);
    setDetailsDialogOpen(true);
  };

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
      case "week": {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
      }
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
            <DayView
              date={currentDate}
              appointments={appointments}
              isLoading={isLoading}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
          {view === "week" && (
            <WeekView
              date={currentDate}
              appointments={appointments}
              isLoading={isLoading}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
          {view === "month" && (
            <MonthView
              date={currentDate}
              appointments={appointments}
              isLoading={isLoading}
              onAppointmentClick={handleAppointmentClick}
            />
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
                {appointments.filter((a) => a.status === "scheduled").length}{" "}
                upcoming
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Appointment Details Dialog */}
      <AppointmentDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        appointment={selectedAppointment}
      />
    </SalonSidebar>
  );
}
