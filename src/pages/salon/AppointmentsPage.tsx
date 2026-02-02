import { useState, useMemo } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePicker, dateToString, stringToDate } from "@/components/ui/date-picker";
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Pause,
  Check,
  X,
  RefreshCw,
  MoreHorizontal,
  AlertCircle,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleAppointmentDialog } from "@/components/dialogs/ScheduleAppointmentDialog";
import { WalkInDialog } from "@/components/dialogs/WalkInDialog";
import { AppointmentActionsDialog } from "@/components/dialogs/AppointmentActionsDialog";
import { useAppointments, useAppointmentActions, AppointmentWithDetails } from "@/hooks/useAppointments";
import type { Enums } from "@/integrations/supabase/types";

type AppointmentStatus = Enums<"appointment_status">;

const statusBadgeStyles: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-muted", text: "text-muted-foreground" },
  started: { bg: "bg-primary/10", text: "text-primary" },
  paused: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  completed: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive" },
  rescheduled: { bg: "bg-muted", text: "text-muted-foreground" },
};

export default function AppointmentsPage() {
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"pause" | "cancel" | "reschedule" | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { appointments, isLoading, refetch } = useAppointments({
    date: dateFilter,
    status: statusFilter as AppointmentStatus | "all",
  });

  const {
    isSubmitting,
    startAppointment,
    pauseAppointment,
    resumeAppointment,
    completeAppointment,
    cancelAppointment,
    rescheduleAppointment,
  } = useAppointmentActions();

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts = {
      total: appointments.length,
      scheduled: 0,
      started: 0,
      completed: 0,
      cancelled: 0,
    };
    appointments.forEach((apt) => {
      if (apt.status === "scheduled") counts.scheduled++;
      else if (apt.status === "started" || apt.status === "paused") counts.started++;
      else if (apt.status === "completed") counts.completed++;
      else if (apt.status === "cancelled") counts.cancelled++;
    });
    return counts;
  }, [appointments]);

  const statusCards = [
    { label: "Total today", count: statusCounts.total, icon: Calendar, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "Scheduled", count: statusCounts.scheduled, icon: Clock, color: "text-muted-foreground", bgColor: "bg-muted" },
    { label: "In Progress", count: statusCounts.started, icon: Play, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "Completed", count: statusCounts.completed, icon: Check, color: "text-success", bgColor: "bg-success/10" },
    { label: "Cancelled", count: statusCounts.cancelled, icon: AlertCircle, color: "text-destructive", bgColor: "bg-destructive/10" },
  ];

  const handleAction = async (action: string, appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    
    switch (action) {
      case "start":
        await startAppointment(appointment.id);
        refetch();
        break;
      case "resume":
        await resumeAppointment(appointment.id);
        refetch();
        break;
      case "complete":
        await completeAppointment(appointment.id);
        refetch();
        break;
      case "pause":
        setActionType("pause");
        setActionDialogOpen(true);
        break;
      case "cancel":
        setActionType("cancel");
        setActionDialogOpen(true);
        break;
      case "reschedule":
        setActionType("reschedule");
        setActionDialogOpen(true);
        break;
    }
  };

  const handleActionConfirm = async (data: { reason?: string; newStart?: string; newEnd?: string }) => {
    if (!selectedAppointment) return;

    if (actionType === "pause" && data.reason) {
      await pauseAppointment(selectedAppointment.id, data.reason);
    } else if (actionType === "cancel" && data.reason) {
      await cancelAppointment(selectedAppointment.id, data.reason);
    } else if (actionType === "reschedule" && data.newStart && data.newEnd) {
      await rescheduleAppointment(selectedAppointment.id, data.newStart, data.newEnd);
    }

    setActionDialogOpen(false);
    setActionType(null);
    setSelectedAppointment(null);
    refetch();
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getAvailableActions = (status: AppointmentStatus) => {
    switch (status) {
      case "scheduled":
        return ["start", "reschedule", "cancel"];
      case "started":
        return ["pause", "complete", "cancel"];
      case "paused":
        return ["resume", "complete", "cancel"];
      default:
        return [];
    }
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Appointments</h1>
            <p className="text-muted-foreground">
              Manage upcoming bookings and stay on top of today's schedule.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setWalkInDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Walk-in</span>
              <span className="sm:hidden">Walk-in</span>
            </Button>
            <Button onClick={() => setAppointmentDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Schedule</span>
              <span className="sm:hidden">Schedule</span>
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {statusCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-8 w-8 mt-1" />
                    ) : (
                      <p className="text-2xl font-semibold mt-1">{card.count}</p>
                    )}
                  </div>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <DatePicker
            value={stringToDate(dateFilter)}
            onChange={(date) => setDateFilter(dateToString(date) || new Date().toISOString().split("T")[0])}
            placeholder="Filter by date"
            className="w-auto min-w-[180px]"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="started">In Progress</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Appointments Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : appointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No appointments found</p>
                    <p className="text-sm text-muted-foreground">
                      Create a new appointment to get started
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((apt) => {
                  const actions = getAvailableActions(apt.status);
                  return (
                    <TableRow key={apt.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {formatTime(apt.scheduled_start)} — {formatTime(apt.scheduled_end)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {apt.scheduled_start ? new Date(apt.scheduled_start).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{apt.customer?.full_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.customer?.phone || "No phone"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {apt.services.length > 0 
                          ? apt.services.map(s => s.service_name).join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusBadgeStyles[apt.status]?.bg || "bg-muted"} ${statusBadgeStyles[apt.status]?.text || "text-muted-foreground"} capitalize`}
                        >
                          {apt.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {apt.notes ? (
                          <span className="text-sm truncate max-w-[120px] block">{apt.notes}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {actions.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isSubmitting}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {actions.includes("start") && (
                                <DropdownMenuItem onClick={() => handleAction("start", apt)}>
                                  <Play className="w-4 h-4 mr-2" />
                                  Start
                                </DropdownMenuItem>
                              )}
                              {actions.includes("resume") && (
                                <DropdownMenuItem onClick={() => handleAction("resume", apt)}>
                                  <Play className="w-4 h-4 mr-2" />
                                  Resume
                                </DropdownMenuItem>
                              )}
                              {actions.includes("pause") && (
                                <DropdownMenuItem onClick={() => handleAction("pause", apt)}>
                                  <Pause className="w-4 h-4 mr-2" />
                                  Pause
                                </DropdownMenuItem>
                              )}
                              {actions.includes("complete") && (
                                <DropdownMenuItem onClick={() => handleAction("complete", apt)}>
                                  <Check className="w-4 h-4 mr-2" />
                                  Complete
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {actions.includes("reschedule") && (
                                <DropdownMenuItem onClick={() => handleAction("reschedule", apt)}>
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  Reschedule
                                </DropdownMenuItem>
                              )}
                              {actions.includes("cancel") && (
                                <DropdownMenuItem 
                                  onClick={() => handleAction("cancel", apt)}
                                  className="text-destructive"
                                >
                                  <X className="w-4 h-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Schedule Appointment Dialog */}
      <ScheduleAppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        onSuccess={refetch}
      />

      {/* Walk-in Dialog */}
      <WalkInDialog
        open={walkInDialogOpen}
        onOpenChange={setWalkInDialogOpen}
        onSuccess={refetch}
      />

      {/* Action Dialogs */}
      <AppointmentActionsDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        actionType={actionType}
        appointment={selectedAppointment}
        onConfirm={handleActionConfirm}
      />
    </SalonSidebar>
  );
}
