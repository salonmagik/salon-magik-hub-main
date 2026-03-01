import { useState, useMemo, useCallback, useEffect } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { DatePicker, dateToString, stringToDate } from "@ui/date-picker";
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
  ChevronDown,
  Coins,
} from "lucide-react";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ui/tooltip";
import { ScheduleAppointmentDialog } from "@/components/dialogs/ScheduleAppointmentDialog";
import { WalkInDialog } from "@/components/dialogs/WalkInDialog";
import { AppointmentActionsDialog } from "@/components/dialogs/AppointmentActionsDialog";
import { AppointmentDetailsDialog } from "@/components/dialogs/AppointmentDetailsDialog";
import { CustomerDetailDialog } from "@/components/dialogs/CustomerDetailDialog";
import { useAppointments, useAppointmentActions, AppointmentWithDetails } from "@/hooks/useAppointments";
import { useAppointmentStats } from "@/hooks/useAppointmentStats";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@shared/currency";
import type { Enums, Tables } from "@supabase-client";
import type { CalendarAppointment } from "@/hooks/useCalendarAppointments";

type AppointmentStatus = Enums<"appointment_status">;
type PaymentStatus = Enums<"payment_status">;
type Customer = Tables<"customers">;
type DateRangePreset = "today" | "this_week" | "this_month" | "last_60_days";

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
  const [actionType, setActionType] = useState<"pause" | "cancel" | "reschedule" | "schedule" | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [activeTab, setActiveTab] = useState<"scheduled" | "unscheduled">("scheduled");

  // Date range state
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("this_week");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Multi-select status filters
  const [bookingStatuses, setBookingStatuses] = useState<Set<AppointmentStatus | "all">>(new Set(["all"]));
  const [paymentStatuses, setPaymentStatuses] = useState<Set<PaymentStatus | "all">>(new Set(["all"]));
  const [giftedFilter, setGiftedFilter] = useState<string>("all");

  // Handle preset change and sync with date pickers
  const handlePresetChange = useCallback((preset: DateRangePreset) => {
    setDateRangePreset(preset);
    const now = new Date();

    switch (preset) {
      case "today": {
        const today = format(now, "yyyy-MM-dd");
        setStartDate(today);
        setEndDate(today);
        break;
      }
      case "this_week": {
        setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
        setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
        break;
      }
      case "this_month": {
        setStartDate(format(startOfMonth(now), "yyyy-MM-dd"));
        setEndDate(format(endOfMonth(now), "yyyy-MM-dd"));
        break;
      }
      case "last_60_days": {
        setStartDate(format(subDays(now, 60), "yyyy-MM-dd"));
        setEndDate(format(now, "yyyy-MM-dd"));
        break;
      }
    }
  }, []);

  // Initialize with "this_week" on mount
  useEffect(() => {
    handlePresetChange("this_week");
  }, [handlePresetChange]);

  // Toggle handlers for multi-select
  const toggleBookingStatus = (status: AppointmentStatus | "all") => {
    const newSet = new Set(bookingStatuses);
    if (status === "all") {
      newSet.clear();
      newSet.add("all");
    } else {
      newSet.delete("all");
      if (newSet.has(status)) {
        newSet.delete(status);
        if (newSet.size === 0) newSet.add("all");
      } else {
        newSet.add(status);
      }
    }
    setBookingStatuses(newSet);
  };

  const togglePaymentStatus = (status: PaymentStatus | "all") => {
    const newSet = new Set(paymentStatuses);
    if (status === "all") {
      newSet.clear();
      newSet.add("all");
    } else {
      newSet.delete("all");
      if (newSet.has(status)) {
        newSet.delete(status);
        if (newSet.size === 0) newSet.add("all");
      } else {
        newSet.add(status);
      }
    }
    setPaymentStatuses(newSet);
  };

  // Get filter label for display
  const getFilterLabel = () => {
    const bookingLabel = bookingStatuses.has("all")
      ? ""
      : `${bookingStatuses.size} booking${bookingStatuses.size > 1 ? "s" : ""}`;
    const paymentLabel = paymentStatuses.has("all")
      ? ""
      : `${paymentStatuses.size} payment${paymentStatuses.size > 1 ? "s" : ""}`;

    if (!bookingLabel && !paymentLabel) return "All statuses";
    return [bookingLabel, paymentLabel].filter(Boolean).join(", ");
  };

  // Fetch stats for both tabs with date range
  const { scheduledStats, unscheduledStats, isLoading: statsLoading, refetch: refetchStats } = useAppointmentStats({
    startDate,
    endDate,
  });

  // Convert sets to arrays for hook
  const bookingStatusArray = bookingStatuses.has("all") ? undefined : Array.from(bookingStatuses).filter((s): s is AppointmentStatus => s !== "all");
  const paymentStatusArray = paymentStatuses.has("all") ? undefined : Array.from(paymentStatuses).filter((s): s is PaymentStatus => s !== "all");

  // Fetch appointments based on active tab
  const { appointments, isLoading, refetch } = useAppointments({
    startDate,
    endDate,
    bookingStatuses: bookingStatusArray,
    paymentStatuses: paymentStatusArray,
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

  // Get currency from tenant
  const currency = currentTenant?.currency || "GHS";

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
      case "schedule":
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
    } else if ((actionType === "reschedule" || actionType === "schedule") && data.newStart && data.newEnd) {
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

  const getAvailableActions = (status: AppointmentStatus, isUnscheduled: boolean) => {
    const actions: string[] = [];
    switch (status) {
      case "scheduled":
        actions.push("start", "reminder");
        if (canCancelReschedule) {
          actions.push(isUnscheduled ? "schedule" : "reschedule", "cancel");
        }
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
    return apt as unknown as CalendarAppointment;
  };

  // Get preset label for dropdown
  const getPresetLabel = (preset: DateRangePreset) => {
    switch (preset) {
      case "today": return "Today";
      case "this_week": return "This Week";
      case "this_month": return "This Month";
      case "last_60_days": return "Last 60 Days";
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

        {/* Tabs: Scheduled vs Unscheduled */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "scheduled" | "unscheduled")}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="unscheduled">Unscheduled</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tab-Specific Stats Cards */}
        {activeTab === "scheduled" ? (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {/* Date Range Dropdown Card */}
            <Card className="bg-primary/5 border-primary/20 min-w-[140px] flex-shrink-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <Select value={dateRangePreset} onValueChange={(v) => handlePresetChange(v as DateRangePreset)}>
                      <SelectTrigger className="h-auto border-0 p-0 text-xs text-muted-foreground font-normal bg-transparent shadow-none focus:ring-0 w-auto">
                        <SelectValue>{getPresetLabel(dateRangePreset)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="this_week">This Week</SelectItem>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="last_60_days">Last 60 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{scheduledStats.rangeCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Amount Due Card */}
            <Card className="bg-destructive/5 border-destructive/20 min-w-[160px] flex-shrink-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <Coins className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount Due</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-16" />
                    ) : (
                      <p className="text-xl font-semibold">
                        {formatCurrency(scheduledStats.amountDue, currency)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gifted */}
            <Card className="bg-amber-500/5 border-amber-500/20 min-w-[140px] flex-shrink-0">
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
            <Card className="bg-destructive/5 border-destructive/20 min-w-[140px] flex-shrink-0">
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
            <Card className="bg-muted border-border min-w-[140px] flex-shrink-0">
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
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {/* Total Unscheduled */}
            <Card className="bg-muted border-border min-w-[140px] flex-shrink-0">
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

            {/* Paid */}
            <Card className="bg-success/5 border-success/20 min-w-[140px] flex-shrink-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Check className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Paid</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{unscheduledStats.paidCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Unpaid */}
            <Card className="bg-destructive/5 border-destructive/20 min-w-[140px] flex-shrink-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <X className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unpaid</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{unscheduledStats.unpaidCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Partial */}
            <Card className="bg-amber-500/5 border-amber-500/20 min-w-[140px] flex-shrink-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Partial</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <p className="text-xl font-semibold">{unscheduledStats.partialCount}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gifted */}
            <Card className="bg-purple-500/5 border-purple-500/20 min-w-[140px] flex-shrink-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Gift className="w-5 h-5 text-purple-600" />
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
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <DatePicker
              value={stringToDate(startDate)}
              onChange={(date) => {
                setStartDate(dateToString(date) || "");
              }}
              placeholder="Start date"
              className="w-auto min-w-[140px]"
            />
            <span className="text-muted-foreground">—</span>
            <DatePicker
              value={stringToDate(endDate)}
              onChange={(date) => {
                setEndDate(dateToString(date) || "");
              }}
              placeholder="End date"
              minDate={stringToDate(startDate)}
              className="w-auto min-w-[140px]"
            />
          </div>

          {/* Combined Status Filter with Submenus */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-between">
                <span className="truncate">{getFilterLabel()}</span>
                <ChevronDown className="h-4 w-4 opacity-50 ml-2 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
              {/* Bookings Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Calendar className="w-4 h-4 mr-2" />
                  Bookings
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("all")}
                    onCheckedChange={() => toggleBookingStatus("all")}
                  >
                    All Bookings
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("scheduled")}
                    onCheckedChange={() => toggleBookingStatus("scheduled")}
                  >
                    Scheduled
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("started")}
                    onCheckedChange={() => toggleBookingStatus("started")}
                  >
                    In Progress
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("paused")}
                    onCheckedChange={() => toggleBookingStatus("paused")}
                  >
                    Paused
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("completed")}
                    onCheckedChange={() => toggleBookingStatus("completed")}
                  >
                    Completed
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("cancelled")}
                    onCheckedChange={() => toggleBookingStatus("cancelled")}
                  >
                    Cancelled
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={bookingStatuses.has("rescheduled")}
                    onCheckedChange={() => toggleBookingStatus("rescheduled")}
                  >
                    Rescheduled
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Payments Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Coins className="w-4 h-4 mr-2" />
                  Payments
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuCheckboxItem
                    checked={paymentStatuses.has("all")}
                    onCheckedChange={() => togglePaymentStatus("all")}
                  >
                    All Payments
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={paymentStatuses.has("fully_paid")}
                    onCheckedChange={() => togglePaymentStatus("fully_paid")}
                  >
                    Full
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={paymentStatuses.has("deposit_paid")}
                    onCheckedChange={() => togglePaymentStatus("deposit_paid")}
                  >
                    Partial
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={paymentStatuses.has("unpaid")}
                    onCheckedChange={() => togglePaymentStatus("unpaid")}
                  >
                    None
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

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
          <div className="overflow-y-auto max-h-[60vh] scrollbar-hide">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  {activeTab === "scheduled" && <TableHead>Amount Due</TableHead>}
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
                      {activeTab === "scheduled" && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : appointments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={activeTab === "scheduled" ? 7 : 6} className="text-center py-12">
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
                    const actions = getAvailableActions(apt.status, apt.is_unscheduled);
                    const amountDue = (apt.total_amount || 0) - (apt.amount_paid || 0);
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
                            {apt.is_gifted && (
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
                        {activeTab === "scheduled" && (
                          <TableCell>
                            {amountDue <= 0 ? (
                              <Badge variant="outline" className="text-success border-success/50">Paid</Badge>
                            ) : (
                              <span className="font-medium text-destructive">
                                {formatCurrency(amountDue, currency)}
                              </span>
                            )}
                          </TableCell>
                        )}
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
                                  const cooldownInfo = getReminderCooldownInfo(apt.last_reminder_sent_at);
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
                                {(actions.includes("schedule") || actions.includes("reschedule") || actions.includes("cancel")) && (
                                  <DropdownMenuSeparator />
                                )}
                                {actions.includes("schedule") && (
                                  <DropdownMenuItem onClick={() => handleAction("schedule", apt)}>
                                    <Calendar className="w-4 h-4 mr-2" />
                                    Schedule
                                  </DropdownMenuItem>
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
          </div>
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
        actionType={actionType === "schedule" ? "reschedule" : actionType}
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
