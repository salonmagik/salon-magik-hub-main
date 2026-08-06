import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, addDays, addWeeks, addMonths, subWeeks, subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";
import { cn } from "@shared/utils";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useWalkthroughAutoTrigger } from "@/hooks/useWalkthroughAutoTrigger";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { DatePicker, dateToString, stringToDate } from "@ui/date-picker";
import { DateRangePicker, type DateRangePreset as PickerDateRangePreset } from "@ui/date-range-picker";
import { TimePicker } from "@ui/time-picker";
import { Textarea } from "@ui/textarea";
import { Label } from "@ui/label";
import { Input } from "@ui/input";
import { toast } from "@ui/ui/use-toast";
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Pause,
  Check,
  X,
  XCircle,
  RefreshCw,
  MoreHorizontal,
  RotateCcw,
  UserPlus,
  User,
  Gift,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Coins,
  FileText,
  ShieldCheck,
  SlidersHorizontal,
  Loader2,
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
import { InvoiceManagementDialog } from "@/components/dialogs/InvoiceManagementDialog";
import { DayView, WeekView, MonthView } from "@/components/calendar";
import { useAppointments, useAppointmentActions, AppointmentWithDetails } from "@/hooks/useAppointments";
import { useAppointmentStats } from "@/hooks/useAppointmentStats";
import { useCalendarAppointments, type CalendarView, type CalendarAppointment } from "@/hooks/useCalendarAppointments";
import { useAuth } from "@/hooks/useAuth";
import { useInvoices } from "@/hooks/useInvoices";
import { formatCurrency } from "@shared/currency";
import type { Enums, Tables } from "@supabase-client";

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

const confirmationBadgeStyles: Record<string, { label: string; className: string }> = {
  pending: { label: "Unconfirmed", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-800" },
  reschedule_proposed: { label: "Reschedule Proposed", className: "bg-sky-100 text-sky-800" },
  reschedule_accepted: { label: "Reschedule Accepted", className: "bg-emerald-100 text-emerald-800" },
  reschedule_declined: { label: "Reschedule Declined", className: "bg-orange-100 text-orange-800" },
  not_required: { label: "Confirmed", className: "bg-slate-100 text-slate-800" },
};

// Quick-select ranges for the date-range picker (react-day-picker has no built-in presets)
const RANGE_PRESETS: PickerDateRangePreset[] = [
  { label: "Today", getRange: () => { const n = new Date(); return { from: n, to: n }; } },
  { label: "Last 7 days", getRange: () => { const n = new Date(); return { from: subDays(n, 6), to: n }; } },
  { label: "Last 30 days", getRange: () => { const n = new Date(); return { from: subDays(n, 29), to: n }; } },
  { label: "This month", getRange: () => { const n = new Date(); return { from: startOfMonth(n), to: endOfMonth(n) }; } },
  { label: "Last 60 days", getRange: () => { const n = new Date(); return { from: subDays(n, 59), to: n }; } },
];

const isReschedulableRequest = (appointment: AppointmentWithDetails | CalendarAppointment) => {
  const bookingMetadata = (appointment as typeof appointment & {
    booking_metadata?: {
      line_item?: {
        type?: string | null;
        fulfillment_type?: string | null;
      } | null;
    } | null;
  }).booking_metadata;

  const lineItemType = bookingMetadata?.line_item?.type || null;
  const fulfillmentType = bookingMetadata?.line_item?.fulfillment_type || null;

  if (lineItemType === "service") return true;
  if (lineItemType === "product" || lineItemType === "package") return false;
  if (lineItemType === "product") return false;
  if (fulfillmentType === "pickup" || fulfillmentType === "delivery") return false;
  if (appointment.services.length > 0) return true;
  return true;
};

const getApprovalItemType = (appointment: AppointmentWithDetails | CalendarAppointment) => {
  const bookingMetadata = (appointment as typeof appointment & {
    booking_metadata?: {
      line_item?: {
        type?: string | null;
      } | null;
    } | null;
  }).booking_metadata;

  const lineItemType = bookingMetadata?.line_item?.type || null;
  if (lineItemType === "product" || lineItemType === "package") return "product";
  if (lineItemType === "service") return "service";
  if (appointment.services.length > 0) return "service";
  return "product";
};

const getReviewActionLabel = (appointment: AppointmentWithDetails | CalendarAppointment) => {
  const itemType = getApprovalItemType(appointment);
  return itemType === "service" ? "Review booking" : "Review order";
};

export default function AppointmentsPage() {
  useWalkthroughAutoTrigger("appointments");
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles, currentTenant } = useAuth();
  const { createFromAppointment } = useInvoices();
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"pause" | "cancel" | "reschedule" | "schedule" | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [notesAppointment, setNotesAppointment] = useState<AppointmentWithDetails | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"scheduled" | "unscheduled" | "unconfirmed">("scheduled");
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalDialogAction, setApprovalDialogAction] = useState<"approve" | "decline" | "reschedule" | "review" | null>(null);
  const [approvalGroupAppointments, setApprovalGroupAppointments] = useState<AppointmentWithDetails[]>([]);
  const [approvalDecisionMap, setApprovalDecisionMap] = useState<Record<string, "approve" | "decline" | "reschedule" | "cancel">>({});
  const [rescheduleInputMap, setRescheduleInputMap] = useState<Record<string, { start: string; end: string; message: string }>>({});
  const [approvalReasonMap, setApprovalReasonMap] = useState<Record<string, string>>({});
  const [approvalMessage, setApprovalMessage] = useState("");
  const [proposedStartDate, setProposedStartDate] = useState("");
  const [proposedStartTime, setProposedStartTime] = useState("");
  const [proposedEndDate, setProposedEndDate] = useState("");
  const [proposedEndTime, setProposedEndTime] = useState("");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  // Date range state — initialize immediately so the first query is always filtered.
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("this_week");
  const [startDate, setStartDate] = useState<string>(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState<string>(() =>
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );

  // Multi-select status filters
  const [bookingStatuses, setBookingStatuses] = useState<Set<AppointmentStatus | "all">>(new Set(["all"]));
  const [paymentStatuses, setPaymentStatuses] = useState<Set<PaymentStatus | "all">>(new Set(["all"]));
  const [giftedFilter, setGiftedFilter] = useState<string>("all");
  const [customerSearch, setCustomerSearch] = useState("");

  // Scheduled tab view mode + calendar navigation
  const initialView = searchParams.get("view") === "calendar" ? "calendar" : "list";
  const initialPeriod = searchParams.get("period");
  const initialDate = searchParams.get("date");
  const [scheduledView, setScheduledView] = useState<"list" | "calendar">(initialView);
  const [calendarDate, setCalendarDate] = useState<Date>(
    initialDate && !Number.isNaN(new Date(`${initialDate}T12:00:00`).getTime())
      ? new Date(`${initialDate}T12:00:00`)
      : new Date(),
  );
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarView>(
    initialPeriod === "day" || initialPeriod === "month" ? initialPeriod : "week",
  );
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    if (activeTab !== "scheduled") return;
    const next = new URLSearchParams(searchParams);
    next.set("view", scheduledView);
    if (scheduledView === "calendar") {
      next.set("period", calendarViewMode);
      next.set("date", format(calendarDate, "yyyy-MM-dd"));
    } else {
      next.delete("period");
      next.delete("date");
    }
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, scheduledView, calendarViewMode, calendarDate, searchParams, setSearchParams]);

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

  const handleRangeChange = useCallback(({ from, to }: { from: Date; to: Date }) => {
    setStartDate(format(from, "yyyy-MM-dd"));
    setEndDate(format(to, "yyyy-MM-dd"));
  }, []);


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
    approvalStatuses: activeTab === "unconfirmed" ? ["pending", "reschedule_proposed"] : undefined,
    isUnscheduled: activeTab === "unscheduled",
    isGifted: giftedFilter === "gifted" ? true : giftedFilter === "not_gifted" ? false : undefined,
    filterByBookingDate: activeTab === "unscheduled" || activeTab === "unconfirmed",
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

  const { appointments: calendarAppointments, isLoading: calendarLoading } = useCalendarAppointments({
    view: calendarViewMode,
    date: calendarDate,
  });

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

  const [appointmentInvoices, setAppointmentInvoices] = useState<Record<string, string>>({});
  const reviewGroupCanReschedule = approvalGroupAppointments.some((appointment) =>
    isReschedulableRequest(appointment),
  );

  useEffect(() => {
    const fetchAppointmentInvoices = async () => {
      if (!currentTenant?.id || appointments.length === 0) return;

      try {
        const appointmentIds = appointments.map(apt => apt.id);
        const { data, error } = await supabase
          .from("invoices")
          .select("id, appointment_id")
          .eq("tenant_id", currentTenant.id)
          .in("appointment_id", appointmentIds)
          .not("appointment_id", "is", null);

        if (error) throw error;

        const invoiceMap: Record<string, string> = {};
        (data || []).forEach((inv: { id: string; appointment_id: string }) => {
          if (inv.appointment_id) {
            invoiceMap[inv.appointment_id] = inv.id;
          }
        });
        setAppointmentInvoices(invoiceMap);
      } catch (err) {
        console.error("Error fetching appointment invoices:", err);
      }
    };

    fetchAppointmentInvoices();
  }, [appointments, currentTenant?.id]);

  const handleRefetch = () => {
    refetch();
    refetchStats();
  };

  const fetchAppointmentById = useCallback(
    async (appointmentId: string) => {
      if (!currentTenant?.id) return null;

      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          customer:customers(*),
          services:appointment_services(*)
        `)
        .eq("id", appointmentId)
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();

      if (error) throw error;
      return (data as AppointmentWithDetails | null) || null;
    },
    [currentTenant?.id],
  );

  const getConfirmationBadge = useCallback((appointment: AppointmentWithDetails) => {
    const approvalStatus = appointment.approval_status || "not_required";
    if (approvalStatus === "not_required" && appointment.confirmation_status === "auto") {
      return { label: "Auto-confirmed", className: "bg-success-bg text-success" };
    }
    return confirmationBadgeStyles[approvalStatus] || {
      label: approvalStatus.replace(/_/g, " "),
      className: "bg-slate-100 text-slate-800",
    };
  }, []);

  const bookingApprovalReasonSuggestions = {
    service: [
      "This time slot is no longer available.",
      "The requested service requires a different staff schedule.",
      "We need to adjust this request before confirming it.",
    ],
    product: [
      "This product is currently out of stock.",
      "This pickup or delivery request needs adjustment.",
      "We are unable to fulfill this product request as submitted.",
    ],
  };

  const openApprovalDialog = async (
    action: "approve" | "decline" | "reschedule" | "review",
    appointment: AppointmentWithDetails,
  ) => {
    const bookingReference = appointment.booking_reference;
    const groupRows = bookingReference
      ? appointments.filter((row) => row.booking_reference === bookingReference)
      : [appointment];
    const nextGroup = groupRows.length > 0 ? groupRows : [appointment];

    setSelectedAppointment(appointment);
    setApprovalDialogAction(action);
    setApprovalGroupAppointments(nextGroup);
    setApprovalDecisionMap(
      Object.fromEntries(
        nextGroup.map((row) => [
          row.id,
          action === "decline" ? "decline" : "approve",
        ]),
      ),
    );
    setApprovalReasonMap({});
    setApprovalMessage("");
    setProposedStartDate(appointment.scheduled_start ? appointment.scheduled_start.slice(0, 10) : "");
    setProposedStartTime(appointment.scheduled_start ? appointment.scheduled_start.slice(11, 16) : "");
    setProposedEndDate(appointment.scheduled_end ? appointment.scheduled_end.slice(0, 10) : "");
    setProposedEndTime(appointment.scheduled_end ? appointment.scheduled_end.slice(11, 16) : "");
    setApprovalDialogOpen(true);
  };

  useEffect(() => {
    const appointmentId = searchParams.get("appointmentId");
    const bookingRef = searchParams.get("bookingRef");
    const approvalAction = searchParams.get("approvalAction");
    if (!approvalAction || !["approve", "decline", "reschedule", "review"].includes(approvalAction)) return;

    if (appointmentId) {
      let isCancelled = false;

      const run = async () => {
        try {
          const target = await fetchAppointmentById(appointmentId);
          if (!target || isCancelled) return;

          setActiveTab("unconfirmed");
          await openApprovalDialog(approvalAction as "approve" | "decline" | "reschedule" | "review", target);

          const next = new URLSearchParams(searchParams);
          next.delete("approvalAction");
          next.delete("appointmentId");
          setSearchParams(next);
        } catch (error) {
          toast({
            title: "Unable to open approval action",
            description: error instanceof Error ? error.message : "Failed to load this booking request.",
            variant: "destructive",
          });
        }
      };

      void run();

      return () => {
        isCancelled = true;
      };
    }

    if (!bookingRef || appointments.length === 0) return;
    if (!["approve", "decline", "reschedule", "review"].includes(approvalAction)) return;

    const target = appointments.find((appointment) => appointment.booking_reference === bookingRef);
    if (!target) return;

    setActiveTab("unconfirmed");
    void openApprovalDialog(approvalAction as "approve" | "decline" | "reschedule" | "review", target);
    const next = new URLSearchParams(searchParams);
    next.delete("approvalAction");
    setSearchParams(next);
  }, [appointments, fetchAppointmentById, openApprovalDialog, searchParams, setSearchParams]);

  // Read initial tab and payment filter from URL params (e.g. from Business Overview quick actions)
  useEffect(() => {
    const tab = searchParams.get("tab");
    const payment = searchParams.get("payment");
    if (tab === "unscheduled" || tab === "unconfirmed") {
      setActiveTab(tab);
    }
    if (payment === "unpaid") {
      setPaymentStatuses(new Set(["unpaid"]));
    }
    if (tab || payment) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      next.delete("payment");
      setSearchParams(next, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const appointmentId = searchParams.get("appointmentId");
    const openMode = searchParams.get("open");
    if (!appointmentId || openMode !== "details") return;

    let isCancelled = false;

    const run = async () => {
      try {
        const appointment = await fetchAppointmentById(appointmentId);
        if (!appointment || isCancelled) return;

        setSelectedAppointment(appointment);
        setDetailsDialogOpen(true);
        setActiveTab(appointment.approval_status === "pending" || appointment.approval_status === "reschedule_proposed"
          ? "unconfirmed"
          : appointment.is_unscheduled
            ? "unscheduled"
            : "scheduled");

        const next = new URLSearchParams(searchParams);
        next.delete("appointmentId");
        next.delete("open");
        setSearchParams(next);
      } catch (error) {
        toast({
          title: "Unable to open booking",
          description: error instanceof Error ? error.message : "Failed to load this booking.",
          variant: "destructive",
        });
      }
    };

    void run();

    return () => {
      isCancelled = true;
    };
  }, [fetchAppointmentById, searchParams, setSearchParams]);

  const createCustomerNotification = async (
    appointment: AppointmentWithDetails,
    title: string,
    description: string,
    urgent = true,
  ) => {
    if (!appointment.customer_id) return;
    const { data: customer } = await supabase
      .from("customers")
      .select("user_id")
      .eq("id", appointment.customer_id)
      .maybeSingle();

    const userId = (customer as { user_id?: string | null } | null)?.user_id;
    if (!userId) return;

    await supabase.from("notifications").insert({
      tenant_id: appointment.tenant_id,
      user_id: userId,
      type: "appointment",
      title,
      description,
      urgent,
      entity_type: "appointment",
      entity_id: appointment.id,
    } as any);
  };

  const sendApprovalEmail = async (
    action: "reschedule_proposed" | "declined" | "partially_declined",
    appointmentIds: string[],
    message?: string,
  ) => {
    const { error } = await supabase.functions.invoke("send-booking-approval-email", {
      body: {
        action,
        appointmentIds,
        message: message || null,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to send booking approval email");
    }
  };

  const handleApprovalSubmit = async () => {
    if (!currentTenant?.id || !selectedAppointment || !approvalDialogAction) return;

    setApprovalSubmitting(true);
    try {
      const nowIso = new Date().toISOString();

      // Partition decisions across all four outcome types
      const approvedRows = approvalGroupAppointments.filter((r) => (approvalDecisionMap[r.id] ?? "approve") === "approve");
      const declinedRows = approvalGroupAppointments.filter((r) => approvalDecisionMap[r.id] === "decline");
      const cancelledRows = approvalGroupAppointments.filter((r) => approvalDecisionMap[r.id] === "cancel");
      const rescheduledRows = approvalGroupAppointments.filter((r) => approvalDecisionMap[r.id] === "reschedule");

      // Legacy single-appointment reschedule mode (from footer "Reschedule instead" path — still supported)
      if (approvalDialogAction === "reschedule" && rescheduledRows.length === 0) {
        if (!proposedStartDate || !proposedStartTime || !proposedEndDate || !proposedEndTime) {
          throw new Error("Choose the proposed date and time range first.");
        }
        const proposedStart = `${proposedStartDate}T${proposedStartTime}:00`;
        const proposedEnd = `${proposedEndDate}T${proposedEndTime}:00`;
        const { error } = await supabase
          .from("appointments")
          .update({
            approval_status: "reschedule_proposed",
            proposed_start: new Date(proposedStart).toISOString(),
            proposed_end: new Date(proposedEnd).toISOString(),
            proposed_message: approvalMessage || null,
            approval_decided_at: nowIso,
            customer_response_status: "pending",
          } as any)
          .eq("id", selectedAppointment.id)
          .eq("tenant_id", currentTenant.id);
        if (error) throw error;
        await createCustomerNotification(
          selectedAppointment,
          "Reschedule requested",
          "The salon has proposed a new date and time for your booking. Review the request in your booking details.",
        );
        // Email sending is best-effort — if it fails the DB record is already saved
        try {
          await sendApprovalEmail("reschedule_proposed", [selectedAppointment.id], approvalMessage || undefined);
        } catch (emailErr) {
          console.warn("Reschedule email failed (non-fatal):", emailErr);
        }
      } else {
        // ── Per-item reschedule ──────────────────────────────────────────────
        for (const row of rescheduledRows) {
          const ri = rescheduleInputMap[row.id];
          if (!ri?.start || !ri?.end) {
            throw new Error(`Choose proposed date/time for "${row.services[0]?.service_name || "item"}".`);
          }
          const { error } = await supabase
            .from("appointments")
            .update({
              approval_status: "reschedule_proposed",
              proposed_start: new Date(ri.start).toISOString(),
              proposed_end: new Date(ri.end).toISOString(),
              proposed_message: ri.message || null,
              approval_decided_at: nowIso,
              customer_response_status: "pending",
            } as any)
            .eq("id", row.id)
            .eq("tenant_id", currentTenant.id);
          if (error) throw error;
          await createCustomerNotification(
            row,
            "Reschedule proposed",
            "The salon has proposed a new date and time for your booking. Review the request in your booking details.",
          );
        }
        if (rescheduledRows.length > 0) {
          await sendApprovalEmail("reschedule_proposed", rescheduledRows.map((r) => r.id));
        }

        // ── Declined ─────────────────────────────────────────────────────────
        if (declinedRows.length > 0) {
          for (const row of declinedRows) {
            if (!approvalReasonMap[row.id]?.trim()) throw new Error("Add a reason for each declined item.");
          }
          const { error } = await supabase
            .from("appointments")
            .update({ approval_status: "declined", approval_decided_at: nowIso, confirmation_status: "rejected", status: "cancelled" } as any)
            .in("id", declinedRows.map((r) => r.id))
            .eq("tenant_id", currentTenant.id);
          if (error) throw error;
          for (const row of declinedRows) {
            await supabase.from("appointments").update({ approval_reason: approvalReasonMap[row.id] } as any).eq("id", row.id).eq("tenant_id", currentTenant.id);
            await createCustomerNotification(row, "Booking item declined", approvalReasonMap[row.id]);
          }
          await sendApprovalEmail(approvedRows.length > 0 ? "partially_declined" : "declined", declinedRows.map((r) => r.id), approvalMessage || undefined);
        }

        // ── Cancelled (per-item salon cancel during review) ───────────────────
        if (cancelledRows.length > 0) {
          const { error } = await supabase
            .from("appointments")
            .update({ approval_status: "declined", approval_decided_at: nowIso, confirmation_status: "rejected", status: "cancelled" } as any)
            .in("id", cancelledRows.map((r) => r.id))
            .eq("tenant_id", currentTenant.id);
          if (error) throw error;
          for (const row of cancelledRows) {
            const reason = approvalReasonMap[row.id]?.trim() || "Booking cancelled by salon.";
            await supabase.from("appointments").update({ approval_reason: reason } as any).eq("id", row.id).eq("tenant_id", currentTenant.id);
            await createCustomerNotification(row, "Booking cancelled", reason);
          }
        }

        // ── Approved ─────────────────────────────────────────────────────────
        if (approvedRows.length > 0) {
          const approvedIds = approvedRows.map((r) => r.id);
          const { error } = await supabase
            .from("appointments")
            .update({ approval_status: "approved", approval_decided_at: nowIso, confirmation_status: "confirmed", customer_response_status: "not_required" } as any)
            .in("id", approvedIds)
            .eq("tenant_id", currentTenant.id);
          if (error) throw error;

          const { data: invoiceId, error: invoiceError } = await (supabase.rpc as any)(
            "create_booking_invoice_for_approved_items",
            {
              p_tenant_id: currentTenant.id,
              p_customer_id: selectedAppointment.customer_id,
              p_booking_reference: selectedAppointment.booking_reference || null,
              p_appointment_ids: approvedIds,
              p_due_date: null,
              p_notes: approvalMessage || null,
            },
          );
          if (invoiceError) throw invoiceError;
          if (invoiceId) await supabase.functions.invoke("send-invoice", { body: { invoiceId } });

          for (const row of approvedRows) {
            await createCustomerNotification(row, "Booking accepted", "Your booking has been accepted. Your invoice is now available in the client portal and has been sent by email.");
          }
        }
      }

      setApprovalDialogOpen(false);
      setApprovalDialogAction(null);
      setApprovalGroupAppointments([]);
      setApprovalMessage("");
      setRescheduleInputMap({});
      handleRefetch();
    } catch (error) {
      toast({
        title: "Approval update failed",
        description: error instanceof Error ? error.message : "Unable to update this booking request right now.",
        variant: "destructive",
      });
    } finally {
      setApprovalSubmitting(false);
    }
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
  const getPresetLabel = useCallback((preset: DateRangePreset) => {
    switch (preset) {
      case "today": return "Today";
      case "this_week": return "This Week";
      case "this_month": return "This Month";
      case "last_60_days": return "Last 60 Days";
    }
  }, []);

  const navigatePrev = useCallback(() => {
    if (scheduledView === "calendar") {
      switch (calendarViewMode) {
        case "day": setCalendarDate((d) => subDays(d, 1)); break;
        case "week": setCalendarDate((d) => subWeeks(d, 1)); break;
        case "month": setCalendarDate((d) => subMonths(d, 1)); break;
      }
    } else {
      const shift = dateRangePreset === "today" ? 1 : dateRangePreset === "this_week" ? 7 : dateRangePreset === "this_month" ? 30 : 60;
      setStartDate((s) => format(subDays(new Date(s), shift), "yyyy-MM-dd"));
      setEndDate((e) => format(subDays(new Date(e), shift), "yyyy-MM-dd"));
    }
  }, [scheduledView, calendarViewMode, dateRangePreset]);

  const navigateNext = useCallback(() => {
    if (scheduledView === "calendar") {
      switch (calendarViewMode) {
        case "day": setCalendarDate((d) => addDays(d, 1)); break;
        case "week": setCalendarDate((d) => addWeeks(d, 1)); break;
        case "month": setCalendarDate((d) => addMonths(d, 1)); break;
      }
    } else {
      const shift = dateRangePreset === "today" ? 1 : dateRangePreset === "this_week" ? 7 : dateRangePreset === "this_month" ? 30 : 60;
      setStartDate((s) => format(addDays(new Date(s), shift), "yyyy-MM-dd"));
      setEndDate((e) => format(addDays(new Date(e), shift), "yyyy-MM-dd"));
    }
  }, [scheduledView, calendarViewMode, dateRangePreset]);

  const navigateToday = useCallback(() => {
    if (scheduledView === "calendar") {
      setCalendarDate(new Date());
    } else {
      handlePresetChange("today");
    }
  }, [scheduledView, handlePresetChange]);

  const getNavTitle = useCallback(() => {
    if (scheduledView === "calendar") {
      switch (calendarViewMode) {
        case "day": return format(calendarDate, "EEEE, MMMM d");
        case "week": {
          const wStart = startOfWeek(calendarDate, { weekStartsOn: 1 });
          const wEnd = endOfWeek(calendarDate, { weekStartsOn: 1 });
          return `${format(wStart, "MMM d")} – ${format(wEnd, "MMM d, yyyy")}`;
        }
        case "month": return format(calendarDate, "MMMM yyyy");
      }
    }
    if (startDate && endDate) {
      return `${format(new Date(startDate), "MMM d")} to ${format(new Date(endDate), "MMM d, yyyy")}`;
    }
    return getPresetLabel(dateRangePreset);
  }, [scheduledView, calendarViewMode, calendarDate, startDate, endDate, dateRangePreset, getPresetLabel]);

  return (
    <SalonSidebar>
      <div className="space-y-5 pb-6">
        {/* Page Header */}
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] tracking-tight">Appointments</h1>
            <p className="text-[13.5px] text-muted-foreground mt-1">
              Manage upcoming bookings and stay on top of today's schedule.
            </p>
          </div>
          {/* Desktop actions (mobile/tablet use the floating + button) */}
          <div className="hidden lg:flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              className="rounded-full"
              data-tour-id="tour-record-walkin"
              onClick={() => setWalkInDialogOpen(true)}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Record walk-ins
            </Button>
            <Button
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              data-tour-id="tour-book-appointment"
              onClick={() => setAppointmentDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Book appointment
            </Button>
          </div>
        </div>

        {/* Pill Tab Bar */}
        <div className="flex gap-1 p-1 rounded-full bg-muted w-fit">
          {(["scheduled", "unscheduled", "unconfirmed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "scheduled" ? "Scheduled" : tab === "unscheduled" ? "Unscheduled" : "Unconfirmed"}
            </button>
          ))}
        </div>

        {/* Tab-Specific Stats Grid */}
        {activeTab === "scheduled" ? (
          <div className="scrollbar-hide flex gap-3 overflow-x-auto overscroll-x-contain snap-x pb-1 [&>*]:shrink-0 [&>*]:snap-start [&>*]:min-w-[158px] sm:grid sm:grid-cols-3 sm:gap-[14px] sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0">
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-primary/[0.08]">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{getPresetLabel(dateRangePreset)}</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{scheduledStats.rangeCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-7 h-7 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-amber-500/10">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount due</p>
                {statsLoading ? <Skeleton className="h-6 w-16 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{formatCurrency(scheduledStats.amountDue, currency)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-primary/[0.08]">
                <Gift className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gifted</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{scheduledStats.giftedCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-destructive/10">
                <XCircle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cancelled</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{scheduledStats.cancelledCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-primary/[0.08]">
                <RotateCcw className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rescheduled</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{scheduledStats.rescheduledCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-success/10">
                <Check className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Confirmed</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{Math.max(0, scheduledStats.rangeCount - scheduledStats.unconfirmedCount)}</p>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "unscheduled" ? (
          <div className="scrollbar-hide flex gap-3 overflow-x-auto overscroll-x-contain snap-x pb-1 [&>*]:shrink-0 [&>*]:snap-start [&>*]:min-w-[158px] sm:grid sm:grid-cols-3 sm:gap-[14px] sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0">
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-primary/[0.08]">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{unscheduledStats.totalCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-success/10">
                <Check className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{unscheduledStats.paidCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-7 h-7 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-destructive/10">
                <XCircle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unpaid</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{unscheduledStats.unpaidCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-amber-500/10">
                <Coins className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Partial</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{unscheduledStats.partialCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-primary/[0.08]">
                <Gift className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gifted</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{unscheduledStats.giftedCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-muted">
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Refunded</p>
                <p className="text-[19px] leading-tight text-muted-foreground">—</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-[14px] sm:max-w-sm">
            <div className="flex items-center gap-3 px-4 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-7 h-7 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-amber-500/10">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
                {statsLoading ? <Skeleton className="h-6 w-8 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{scheduledStats.unconfirmedCount}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4 bg-white rounded-[14px] border border-border/60 shadow-sm">
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-primary/[0.08]">
                <Coins className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Review value</p>
                {statsLoading ? <Skeleton className="h-6 w-16 mt-0.5" /> : (
                  <p className="text-[19px] leading-tight">{formatCurrency(scheduledStats.unconfirmedValue, currency)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Date nav bar + view toggle (scheduled tab only) */}
        {activeTab === "scheduled" && (
          <div className="flex flex-col gap-3">
            {/* Row 1: date control + list/cal toggle */}
            <div className="flex items-center justify-between">
              {scheduledView === "list" ? (
                /* List view: date-range picker (replaces prev/today/next) */
                <div className="width-full sm:w-auto">
                  <DateRangePicker
                    from={stringToDate(startDate)}
                    to={stringToDate(endDate)}
                    onChange={handleRangeChange}
                    presets={RANGE_PRESETS}
                    className="w-full sm:w-auto sm:min-w-[220px]"
                  />
                </div>
              ) : (
                /* Calendar view: page through periods */
                <div className="flex items-center ">
                  <button
                    onClick={navigatePrev}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={navigateToday}
                    className="h-8 px-3 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                  >
                    Today
                  </button>
                  <button
                    onClick={navigateNext}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="min-w-0 text-sm font-medium px-2 text-foreground truncate">{getNavTitle()}</span>
                </div>
              )}
              <div className="flex gap-0.5 bg-muted p-0.5 rounded-[12px] flex-shrink-0">
                <button
                  onClick={() => setScheduledView("list")}
                  data-tour-id="tour-list-view"
                  className={cn(
                    "w-[38px] h-[38px] flex items-center justify-center rounded-[9px] transition-all",
                    scheduledView === "list"
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="List view"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setScheduledView("calendar")}
                  data-tour-id="tour-calendar-view"
                  className={cn(
                    "w-[38px] h-[38px] flex items-center justify-center rounded-[9px] transition-all",
                    scheduledView === "calendar"
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Calendar view"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Row 2: day/week/month segmented control (calendar view only) */}
            {scheduledView === "calendar" && (
              <div className="flex gap-0.5 bg-muted p-0.5 rounded-[12px] self-start">
                {(["day", "week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalendarViewMode(v)}
                    className={cn(
                      "px-4 py-1.5 rounded-[9px] text-xs font-medium transition-all capitalize",
                      calendarViewMode === v
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        {!(activeTab === "scheduled" && scheduledView === "calendar") && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-3">
          {/* Search — full width on mobile, half on desktop */}
          <div className="relative flex-1 sm:flex-none sm:w-1/2">
            <Input
              placeholder="Search customer or recipient…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="h-9 pr-8"
            />
            {customerSearch && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setCustomerSearch("")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Mobile filter toggle (icon only) */}
          <button
            className={cn(
              "sm:hidden h-9 w-9 flex items-center justify-center rounded-md border transition-colors flex-shrink-0",
              filtersExpanded
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            aria-label="Filters"
            aria-pressed={filtersExpanded}
            title="Filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Status + refresh — pushed to the far right on desktop, collapsible on mobile */}
          <div className={cn(
            "items-center gap-2 sm:gap-3 sm:ml-auto",
            filtersExpanded ? "flex w-full sm:w-auto" : "hidden sm:flex"
          )}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-between">
                  <span className="truncate text-sm">{getFilterLabel()}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 ml-2 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Calendar className="w-4 h-4 mr-2" />
                    Bookings
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("all")} onCheckedChange={() => toggleBookingStatus("all")}>All Bookings</DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("scheduled")} onCheckedChange={() => toggleBookingStatus("scheduled")}>Scheduled</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("started")} onCheckedChange={() => toggleBookingStatus("started")}>In Progress</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("paused")} onCheckedChange={() => toggleBookingStatus("paused")}>Paused</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("completed")} onCheckedChange={() => toggleBookingStatus("completed")}>Completed</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("cancelled")} onCheckedChange={() => toggleBookingStatus("cancelled")}>Cancelled</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={bookingStatuses.has("rescheduled")} onCheckedChange={() => toggleBookingStatus("rescheduled")}>Rescheduled</DropdownMenuCheckboxItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Coins className="w-4 h-4 mr-2" />
                    Payments
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuCheckboxItem checked={paymentStatuses.has("all")} onCheckedChange={() => togglePaymentStatus("all")}>All Payments</DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={paymentStatuses.has("fully_paid")} onCheckedChange={() => togglePaymentStatus("fully_paid")}>Full</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={paymentStatuses.has("deposit_paid")} onCheckedChange={() => togglePaymentStatus("deposit_paid")}>Partial</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={paymentStatuses.has("unpaid")} onCheckedChange={() => togglePaymentStatus("unpaid")}>None</DropdownMenuCheckboxItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            {activeTab === "unscheduled" && (
              <Select value={giftedFilter} onValueChange={setGiftedFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Gifted status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="gifted">Gifted</SelectItem>
                  <SelectItem value="not_gifted">Not Gifted</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Button variant="outline" size="sm" onClick={handleRefetch} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
        )}

        {/* Calendar view (scheduled tab only) */}
        {activeTab === "scheduled" && scheduledView === "calendar" ? (
          <div className="space-y-4">
            {calendarViewMode === "day" && (
              <DayView
                date={calendarDate}
                appointments={calendarAppointments}
                isLoading={calendarLoading}
                onAppointmentClick={(apt) => {
                  setSelectedAppointment(apt as unknown as AppointmentWithDetails);
                  setDetailsDialogOpen(true);
                }}
              />
            )}
            {calendarViewMode === "week" && (
              <WeekView
                date={calendarDate}
                appointments={calendarAppointments}
                isLoading={calendarLoading}
                onAppointmentClick={(apt) => {
                  setSelectedAppointment(apt as unknown as AppointmentWithDetails);
                  setDetailsDialogOpen(true);
                }}
              />
            )}
            {calendarViewMode === "month" && (
              <MonthView
                date={calendarDate}
                appointments={calendarAppointments}
                isLoading={calendarLoading}
                onAppointmentClick={(apt) => {
                  setSelectedAppointment(apt as unknown as AppointmentWithDetails);
                  setDetailsDialogOpen(true);
                }}
              />
            )}
          </div>
        ) : (
        <Card>
          <div className="overflow-auto scrollbar-hide">
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">Time</TableHead>
                  <TableHead className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">Customer</TableHead>
                  <TableHead className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">Service</TableHead>
                  <TableHead className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">Status</TableHead>
                  <TableHead className="min-w-[110px] whitespace-nowrap text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">Amount Due</TableHead>
                  <TableHead />
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : appointments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <Calendar className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="font-medium text-muted-foreground">
                        {activeTab === "unscheduled"
                          ? "No unscheduled bookings"
                          : activeTab === "unconfirmed"
                            ? "No bookings awaiting review"
                            : "No appointments found"}
                      </p>
                      <p className="text-sm text-muted-foreground/70 mt-1">
                        {activeTab === "unscheduled"
                          ? "Unscheduled bookings will appear here when customers book online"
                          : activeTab === "unconfirmed"
                            ? "Bookings waiting for approval will appear here"
                            : "Create a new appointment to get started"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  appointments.filter((apt) => {
                    if (!customerSearch.trim()) return true;
                    const q = customerSearch.toLowerCase();
                    const name = apt.customer?.full_name?.toLowerCase() || "";
                    const phone = apt.customer?.phone?.toLowerCase() || "";
                    const gift = (apt as any).booking_metadata?.gift?.recipient;
                    const giftName = gift
                      ? [gift.firstName, gift.lastName].filter(Boolean).join(" ").toLowerCase()
                      : "";
                    const giftEmail = gift?.email?.toLowerCase() || "";
                    return name.includes(q) || phone.includes(q) || giftName.includes(q) || giftEmail.includes(q);
                  }).map((apt) => {
                    const actions = getAvailableActions(apt.status, apt.is_unscheduled);
                    const amountDue = (apt.total_amount || 0) - (apt.amount_paid || 0);
                    const paidOffline = apt.transactions?.some(
                      (transaction) => transaction.provider === "offline" && transaction.method === "cash" && transaction.status === "completed",
                    );
                    const confirmationBadge = getConfirmationBadge(apt);
                    return (
                      <TableRow
                        key={apt.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleRowClick(apt)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {apt.scheduled_start ? formatTime(apt.scheduled_start) : "Unscheduled"}
                            </p>
                            {apt.scheduled_start && (
                              <p className="text-xs text-muted-foreground/70">
                                {apt.scheduled_end ? `to ${formatTime(apt.scheduled_end)}, ` : ""}
                                {new Date(apt.scheduled_start).toLocaleDateString("en-GB")}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-sm">{apt.customer?.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">
                                {apt.customer?.phone || "No phone"}
                              </p>
                            </div>
                            {apt.is_gifted && (() => {
                              const giftMeta = (apt as any).booking_metadata?.gift?.recipient;
                              const recipientName = giftMeta
                                ? [giftMeta.firstName, giftMeta.lastName].filter(Boolean).join(" ")
                                : null;
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-default">
                                        <Gift className="w-4 h-4 text-amber-500" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs font-medium">
                                        {recipientName ? `Gift for ${recipientName}` : "Gifted booking"}
                                      </p>
                                      {giftMeta?.email && (
                                        <p className="text-xs text-muted-foreground">{giftMeta.email}</p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {apt.services.length > 0 ? (
                            <div>
                              <p className="font-medium text-sm">{apt.services[0].service_name}</p>
                              {apt.services.length > 1 && (
                                <p className="text-xs text-muted-foreground">+{apt.services.length - 1} more</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              className={`text-xs w-fit ${statusBadgeStyles[apt.status]?.bg || "bg-muted"} ${statusBadgeStyles[apt.status]?.text || "text-muted-foreground"} capitalize`}
                            >
                              {apt.status}
                            </Badge>
                            {confirmationBadge.label !== "Confirmed" && (
                              <Badge variant="secondary" className={`text-xs w-fit ${confirmationBadge.className}`}>
                                {confirmationBadge.label}
                              </Badge>
                            )}
                            {paidOffline && (
                              <Badge variant="outline" className="border-success/50 text-xs text-success">
                                Paid offline
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {amountDue <= 0 ? (
                            <Badge variant="outline" className="text-success border-success/50 text-xs">
                              Paid
                            </Badge>
                          ) : (
                            <span className="font-medium text-sm text-destructive">
                              {formatCurrency(amountDue, currency)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (apt.notes) {
                                setNotesAppointment(apt);
                              }
                            }}
                            className={cn(
                              "text-xs whitespace-nowrap transition-colors",
                              apt.notes
                                ? "text-primary font-medium hover:underline"
                                : "text-muted-foreground/40 cursor-default pointer-events-none"
                            )}
                          >
                            View notes
                          </button>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {(actions.length > 0 || canViewCustomerProfile || activeTab === "unconfirmed") && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isSubmitting}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {activeTab === "unconfirmed" ? (
                                  <>
                                    {canViewCustomerProfile && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedCustomer(apt.customer as Customer);
                                          setCustomerDialogOpen(true);
                                        }}
                                      >
                                        <User className="w-4 h-4 mr-2" />
                                        View Customer Profile
                                      </DropdownMenuItem>
                                    )}
                                    {canViewCustomerProfile && <DropdownMenuSeparator />}
                                    <DropdownMenuItem onClick={() => openApprovalDialog("approve", apt)}>
                                      <Check className="w-4 h-4 mr-2" />
                                      Accept
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openApprovalDialog("decline", apt)}>
                                      <X className="w-4 h-4 mr-2" />
                                      Decline
                                    </DropdownMenuItem>
                                    {isReschedulableRequest(apt) && (
                                      <DropdownMenuItem onClick={() => openApprovalDialog("reschedule", apt)}>
                                        <RotateCcw className="w-4 h-4 mr-2" />
                                        Reschedule
                                      </DropdownMenuItem>
                                    )}
                                    {apt.booking_reference && (
                                      <DropdownMenuItem onClick={() => openApprovalDialog("review", apt)}>
                                        <ShieldCheck className="w-4 h-4 mr-2" />
                                        {getReviewActionLabel(apt)}
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                ) : (
                                  <>
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
                                        {appointmentInvoices[apt.id] ? (
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setSelectedInvoiceId(appointmentInvoices[apt.id]);
                                              setInvoiceDialogOpen(true);
                                            }}
                                          >
                                            <FileText className="w-4 h-4 mr-2" />
                                            View Invoice
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            onClick={async () => {
                                              const invoice = await createFromAppointment(apt.id);
                                              if (invoice) {
                                                setSelectedInvoiceId(invoice.id);
                                                setInvoiceDialogOpen(true);
                                                handleRefetch();
                                              }
                                            }}
                                          >
                                            <FileText className="w-4 h-4 mr-2" />
                                            Create Invoice
                                          </DropdownMenuItem>
                                        )}
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
                                  </>
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
        )}
      </div>

      {/* Floating action button — mobile & tablet only */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Create appointment or walk-in"
            data-tour-id="tour-book-or-walkin-mobile"
            className="lg:hidden fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-primary  text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-52 mb-2">
          <DropdownMenuItem onClick={() => setWalkInDialogOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Record walk-in
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAppointmentDialogOpen(true)}>
            <Calendar className="w-4 h-4 mr-2" />
            Book appointment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
        onOpenApprovalAction={(action, appointment) => {
          setDetailsDialogOpen(false);
          openApprovalDialog(action, appointment as unknown as AppointmentWithDetails);
        }}
      />

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        customer={selectedCustomer}
      />

      {/* Invoice Management Dialog */}
      <InvoiceManagementDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        invoiceId={selectedInvoiceId}
        onSuccess={handleRefetch}
      />

      <Dialog open={!!notesAppointment} onOpenChange={(open) => !open && setNotesAppointment(null)}>
        <DialogContent className="rounded-3xl p-5 sm:max-w-xl sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              Notes for {notesAppointment?.customer?.full_name || "customer"}
            </DialogTitle>
            <DialogDescription>Appointment notes, newest first</DialogDescription>
          </DialogHeader>
          <div className="mt-3 max-h-[60vh] overflow-y-auto overscroll-contain">
            {notesAppointment?.notes ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {notesAppointment.scheduled_start
                      ? format(new Date(notesAppointment.scheduled_start), "MMM d, yyyy 'at' h:mm a")
                      : "Unscheduled appointment"}
                  </span>
                </div>
                <div className="rounded-2xl border bg-card p-4 text-sm leading-6 whitespace-pre-wrap">
                  {notesAppointment.notes}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                No notes have been added to this appointment.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {approvalDialogAction === "approve"
                ? "Accept booking"
                : approvalDialogAction === "reschedule"
                  ? "Suggest reschedule"
                  : approvalDialogAction === "review"
                    ? selectedAppointment
                      ? getReviewActionLabel(selectedAppointment)
                      : "Review booking"
                    : "Decline booking"}
            </DialogTitle>
            <DialogDescription>
              {approvalDialogAction === "reschedule"
                ? "Suggest a new date and time for this booking."
                : "Review each item and decide what should be accepted or declined."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {approvalDialogAction === "reschedule" ? (
              <>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Proposed start</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <DatePicker
                        value={stringToDate(proposedStartDate)}
                        onChange={(d) => setProposedStartDate(dateToString(d))}
                        minDate={new Date()}
                        placeholder="Pick date"
                      />
                      <TimePicker
                        value={proposedStartTime}
                        onChange={setProposedStartTime}
                        placeholder="Pick time"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Proposed end</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <DatePicker
                        value={stringToDate(proposedEndDate)}
                        onChange={(d) => setProposedEndDate(dateToString(d))}
                        minDate={new Date()}
                        placeholder="Pick date"
                      />
                      <TimePicker
                        value={proposedEndTime}
                        onChange={setProposedEndTime}
                        placeholder="Pick time"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Message to customer</Label>
                  <Textarea
                    rows={3}
                    placeholder="Share a short note with the customer about this proposed reschedule."
                    value={approvalMessage}
                    onChange={(e) => setApprovalMessage(e.target.value)}
                  />
                </div>
              </>
            ) : (
              approvalGroupAppointments.map((appointment) => {
                const itemType = getApprovalItemType(appointment);
                const suggestions = itemType === "service"
                  ? bookingApprovalReasonSuggestions.service
                  : bookingApprovalReasonSuggestions.product;
                return (
                  <div key={appointment.id} className="rounded-xl border p-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">
                            {appointment.services[0]?.service_name || `Booking item ${appointment.id.slice(0, 8)}`}
                          </p>
                          {appointment.is_gifted && (() => {
                            const gr = (appointment as any).booking_metadata?.gift?.recipient;
                            const rn = gr ? [gr.firstName, gr.lastName].filter(Boolean).join(" ") : null;
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default"><Gift className="w-3.5 h-3.5 text-amber-500" /></span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">{rn ? `Gift for ${rn}` : "Gifted booking"}</p>
                                    {gr?.email && <p className="text-xs text-muted-foreground">{gr.email}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {appointment.customer?.full_name || "Unknown customer"} · {formatCurrency(Number(appointment.total_amount || 0), currency)}
                        </p>
                      </div>
                      <Select
                        value={approvalDecisionMap[appointment.id] || "approve"}
                        onValueChange={(value) =>
                          setApprovalDecisionMap((prev) => ({
                            ...prev,
                            [appointment.id]: value as "approve" | "decline" | "reschedule" | "cancel",
                          }))
                        }
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approve">Accept</SelectItem>
                          <SelectItem value="reschedule">Reschedule</SelectItem>
                          <SelectItem value="decline">Decline</SelectItem>
                          <SelectItem value="cancel">Cancel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Inline reschedule datetime pickers */}
                    {approvalDecisionMap[appointment.id] === "reschedule" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Proposed start</Label>
                          <Input
                            type="datetime-local"
                            value={rescheduleInputMap[appointment.id]?.start || ""}
                            onChange={(e) => setRescheduleInputMap((prev) => ({
                              ...prev,
                              [appointment.id]: { ...prev[appointment.id], start: e.target.value, end: prev[appointment.id]?.end || "", message: prev[appointment.id]?.message || "" },
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Proposed end</Label>
                          <Input
                            type="datetime-local"
                            value={rescheduleInputMap[appointment.id]?.end || ""}
                            onChange={(e) => setRescheduleInputMap((prev) => ({
                              ...prev,
                              [appointment.id]: { ...prev[appointment.id], end: e.target.value, start: prev[appointment.id]?.start || "", message: prev[appointment.id]?.message || "" },
                            }))}
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs">Message to customer (optional)</Label>
                          <Textarea
                            rows={2}
                            placeholder="Reason for the proposed change…"
                            value={rescheduleInputMap[appointment.id]?.message || ""}
                            onChange={(e) => setRescheduleInputMap((prev) => ({
                              ...prev,
                              [appointment.id]: { ...prev[appointment.id], message: e.target.value, start: prev[appointment.id]?.start || "", end: prev[appointment.id]?.end || "" },
                            }))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Decline / Cancel reason */}
                    {(approvalDecisionMap[appointment.id] === "decline" || approvalDecisionMap[appointment.id] === "cancel") && (
                      <div className="space-y-2">
                        <Label>{approvalDecisionMap[appointment.id] === "cancel" ? "Cancellation reason" : "Decline reason"}</Label>
                        <Select
                          value={approvalReasonMap[appointment.id] || ""}
                          onValueChange={(value) =>
                            setApprovalReasonMap((prev) => ({
                              ...prev,
                              [appointment.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a suggested reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {suggestions.map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {reason}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Textarea
                          rows={2}
                          value={approvalReasonMap[appointment.id] || ""}
                          onChange={(e) =>
                            setApprovalReasonMap((prev) => ({
                              ...prev,
                              [appointment.id]: e.target.value,
                            }))
                          }
                          placeholder="Add context for the customer."
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            {approvalDialogAction !== "reschedule" && reviewGroupCanReschedule && (
              <Button
                variant="outline"
                onClick={() => openApprovalDialog("reschedule", approvalGroupAppointments[0] || selectedAppointment)}
                disabled={approvalSubmitting}
              >
                Reschedule instead
              </Button>
            )}
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)} disabled={approvalSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleApprovalSubmit} disabled={approvalSubmitting}>
              {approvalSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {approvalDialogAction === "reschedule" ? "Send reschedule proposal" : "Save decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalonSidebar>
  );
}
