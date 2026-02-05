import { useState, useMemo, useCallback } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RotateCcw,
  UserPlus,
  User,
  Gift,
  Bell,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScheduleAppointmentDialog } from "@/components/dialogs/ScheduleAppointmentDialog";
import { WalkInDialog } from "@/components/dialogs/WalkInDialog";
import { AppointmentActionsDialog } from "@/components/dialogs/AppointmentActionsDialog";
import { AppointmentDetailsDialog } from "@/components/dialogs/AppointmentDetailsDialog";
import { CustomerDetailDialog } from "@/components/dialogs/CustomerDetailDialog";
import { useAppointments, useAppointmentActions, AppointmentWithDetails } from "@/hooks/useAppointments";
import { useAppointmentStats } from "@/hooks/useAppointmentStats";
import { useAuth } from "@/hooks/useAuth";
import type { Enums, Tables } from "@/integrations/supabase/types";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";

type AppointmentStatus = Enums<"appointment_status">;
type Customer = Tables<"customers">;

const statusBadgeStyles: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-muted", text: "text-muted-foreground" },
  started: { bg: "bg-primary/10", text: "text-primary" },
  paused: { bg: "bg-warning-bg", text: "text-warning-foreground" },
  completed: { bg: "bg-success/10", text: "text-success" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive" },
  rescheduled: { bg: "bg-muted", text: "text-muted-foreground" },
};

export default function AppointmentsPage() {
  const { roles, currentTenant } = useAuth();
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"pause" | "cancel" | "reschedule" | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [activeTab, setActiveTab] = useState<"scheduled" | "unscheduled">("scheduled");
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [giftedFilter, setGiftedFilter] = useState<string>("all");

  // Fetch stats for both tabs
  const { scheduledStats, unscheduledStats, isLoading: statsLoading, refetch: refetchStats } = useAppointmentStats();

  // Fetch appointments based on active tab
  const { appointments, isLoading, refetch } = useAppointments({
    date: dateFilter,
    status: statusFilter as AppointmentStatus | "all",
    isUnscheduled: activeTab === "unscheduled",
    isGifted: giftedFilter === "gifted" ? true : giftedFilter === "not_gifted" ? false : undefined,
    filterByBookingDate: activeTab === "unscheduled",
  });

  const {
    isSubmitting,
    startAppointment,
    pauseAppointment,
    resumeAppointment,
    completeAppointment,
    cancelAppointment,
    rescheduleAppointment,
    sendReminder,
  } = useAppointmentActions();

  // Get user's role for the current tenant
  const userRole = useMemo(() => {
    if (!currentTenant?.id || !roles.length) return null;
    const role = roles.find((r) => r.tenant_id === currentTenant.id);
    return role?.role || null;
  }, [roles, currentTenant?.id]);

  // Check if user can perform certain actions (Staff has limited permissions)
  const canCancelReschedule = userRole && userRole !== "staff";
  const canViewCustomerProfile = userRole && userRole !== "staff";

  const handleRefetch = () => {
    refetch();
    refetchStats();
  };

  const handleAction = async (action: string, appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    
    switch (action) {
      case "start":
        await startAppointment(appointment.id);
        handleRefetch();
        break;
      case "resume":
        await resumeAppointment(appointment.id);
        handleRefetch();
        break;
      case "complete":
        await completeAppointment(appointment.id);
        handleRefetch();
        break;
      case "reminder":
        await sendReminder(appointment.id);
        handleRefetch();
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

  const handleRowClick = (appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    setDetailsDialogOpen(true);
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
    handleRefetch();
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Check if reminder cooldown is active (30 minutes)
  const getReminderCooldownInfo = useCallback((lastReminderSent: string | null) => {
    if (!lastReminderSent) return { canSend: true, remainingMinutes: 0 };
    
    const lastSent = new Date(lastReminderSent);
    const now = new Date();
    const diffMs = now.getTime() - lastSent.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const cooldownMinutes = 30;
    
    if (diffMinutes >= cooldownMinutes) {
      return { canSend: true, remainingMinutes: 0 };
    }
    
    return { canSend: false, remainingMinutes: cooldownMinutes - diffMinutes };
  }, []);

  const getAvailableActions = (status: AppointmentStatus) => {
    const actions: string[] = [];
    switch (status) {
      case "scheduled":
        actions.push("start", "reminder");
        if (canCancelReschedule) actions.push("reschedule", "cancel");
        break;
      case "started":
        actions.push("pause", "complete");
        if (canCancelReschedule) actions.push("cancel");
        break;
      case "paused":
        actions.push("resume", "complete");
        if (canCancelReschedule) actions.push("cancel");
        break;
    }
    return actions;
  };

  // Convert AppointmentWithDetails to CalendarAppointment for details dialog
  const convertToCalendarAppointment = (apt: AppointmentWithDetails | null): CalendarAppointment | null => {
    if (!apt) return null;
    // Both types extend the base Appointment type and include customer/services
    return apt as unknown as CalendarAppointment;
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

        {/* Tabs: Scheduled vs Unscheduled */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "scheduled" | "unscheduled")}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="unscheduled">Unscheduled</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tab-Specific Stats Cards */}
        {activeTab === "scheduled" ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Today's Appointments */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Today</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{scheduledStats.todayCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gifted */}
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Gift className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gifted</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{scheduledStats.giftedCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cancelled */}
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <X className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{scheduledStats.cancelledCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rescheduled */}
            <Card className="bg-muted border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted-foreground/10">
                    <RotateCcw className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rescheduled</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{scheduledStats.rescheduledCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {/* Total Unscheduled */}
            <Card className="bg-muted border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted-foreground/10">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{unscheduledStats.totalCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gifted Unscheduled */}
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Gift className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gifted</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{unscheduledStats.giftedCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <DatePicker
            value={stringToDate(dateFilter)}
            onChange={(date) => setDateFilter(dateToString(date) || new Date().toISOString().split("T")[0])}
            placeholder={activeTab === "unscheduled" ? "Booked on" : "Filter by date"}
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
          {activeTab === "unscheduled" && (
            <Select value={giftedFilter} onValueChange={setGiftedFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Gifted status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="gifted">Gifted</SelectItem>
                <SelectItem value="not_gifted">Not Gifted</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleRefetch} disabled={isLoading}>
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
                    <p className="text-muted-foreground">
                      {activeTab === "unscheduled" 
                        ? "No unscheduled bookings awaiting confirmation"
                        : "No appointments found"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {activeTab === "unscheduled"
                        ? "Unscheduled bookings will appear here when customers book online"
                        : "Create a new appointment to get started"}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((apt) => {
                  const actions = getAvailableActions(apt.status);
                  return (
                    <TableRow 
                      key={apt.id} 
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleRowClick(apt)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {apt.scheduled_start 
                              ? `${formatTime(apt.scheduled_start)} — ${formatTime(apt.scheduled_end)}`
                              : "Unscheduled"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {apt.scheduled_start ? new Date(apt.scheduled_start).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium">{apt.customer?.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {apt.customer?.phone || "No phone"}
                            </p>
                          </div>
                          {(apt as any).is_gifted && (
                            <Gift className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {apt.services.length > 0 ? (
                          <div>
                            <p className="font-medium">{apt.services[0].service_name}</p>
                            {apt.services.length > 1 && (
                              <p className="text-xs text-muted-foreground">
                                +{apt.services.length - 1} services
                              </p>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
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
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {(actions.length > 0 || canViewCustomerProfile) && (
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
                              {actions.includes("reminder") && (() => {
                                const cooldownInfo = getReminderCooldownInfo((apt as any).last_reminder_sent_at);
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span>
                                          <DropdownMenuItem 
                                            onClick={() => handleAction("reminder", apt)}
                                            disabled={!cooldownInfo.canSend}
                                            className={!cooldownInfo.canSend ? "opacity-50 cursor-not-allowed" : ""}
                                          >
                                            <Bell className="w-4 h-4 mr-2" />
                                            Send Reminder
                                          </DropdownMenuItem>
                                        </span>
                                      </TooltipTrigger>
                                      {!cooldownInfo.canSend && (
                                        <TooltipContent>
                                          <p>Wait {cooldownInfo.remainingMinutes} min to send again</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                              {canViewCustomerProfile && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedCustomer(apt.customer as Customer);
                                      setCustomerDialogOpen(true);
                                    }}
                                  >
                                    <User className="w-4 h-4 mr-2" />
                                    View Customer Profile
                                  </DropdownMenuItem>
                                </>
                              )}
                              {(actions.includes("reschedule") || actions.includes("cancel")) && (
                                <DropdownMenuSeparator />
                              )}
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
        onSuccess={handleRefetch}
      />

      {/* Walk-in Dialog */}
      <WalkInDialog
        open={walkInDialogOpen}
        onOpenChange={setWalkInDialogOpen}
        onSuccess={handleRefetch}
      />

      {/* Action Dialogs */}
      <AppointmentActionsDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        actionType={actionType}
        appointment={selectedAppointment}
        onConfirm={handleActionConfirm}
      />

      {/* Appointment Details Dialog */}
      <AppointmentDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        appointment={convertToCalendarAppointment(selectedAppointment!)}
      />

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        customer={selectedCustomer}
      />
    </SalonSidebar>
  );
}
