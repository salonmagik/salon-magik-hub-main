import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import { usePermissions } from "./usePermissions";

interface DashboardStats {
  todayAppointments: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  totalCustomers: number;
  revenueToday: number;
  outstandingFees: number;
  purseUsage: number;
  refundsPendingApproval: number;
  communicationCredits: number;
  lowCommunicationCredits: boolean;
  showUpRate: number | null;
  newClientsThisWeek: number;
  prepaidCustomers: number;
  // Trend comparisons (vs last week same day)
  todayBookingsTrend: number | null;
  revenueTrendPct: number | null;
  showUpRateTrend: number | null;
  newClientsTrend: number | null;
  trendDayName: string;
}

export interface UpcomingAppointment {
  id: string;
  time: string;
  customer: string;
  service: string;
  staffFirstName: string | null;
  status: string;
  paymentStatus: string;
  depositAmount: number;
  displayStatus: "Confirmed" | "Awaiting deposit" | "In progress" | "Completed" | "Cancelled" | "Unconfirmed";
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  href: string;
}

interface Insight {
  id: string;
  title: string;
  value: string;
  icon: string;
}

interface RecentActivity {
  id: string;
  type: "payment" | "refund" | "appointment" | "system";
  title: string;
  description: string;
  timestamp: string;
}

export interface LapsedClient {
  id: string;
  name: string;
  daysSinceVisit: number;
  usualService: string;
  clientStatus: "going_quiet" | "inactive";
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "p" : "a";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes}${period}`;
}

function deriveDisplayStatus(
  status: string,
  paymentStatus: string,
  depositAmount: number,
  approvalStatus: string | null,
): UpcomingAppointment["displayStatus"] {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "started" || status === "paused") return "In progress";
  if (approvalStatus === "pending" || approvalStatus === "reschedule_proposed") return "Unconfirmed";
  if (paymentStatus === "unpaid" && depositAmount > 0) return "Awaiting deposit";
  return "Confirmed";
}

export function useDashboardStats() {
  const { currentTenant } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { scopedLocationIds, hasScope } = useLocationScope();

  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    confirmedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    totalCustomers: 0,
    revenueToday: 0,
    outstandingFees: 0,
    purseUsage: 0,
    refundsPendingApproval: 0,
    communicationCredits: 0,
    lowCommunicationCredits: false,
    showUpRate: null,
    newClientsThisWeek: 0,
    prepaidCustomers: 0,
    todayBookingsTrend: null,
    revenueTrendPct: null,
    showUpRateTrend: null,
    newClientsTrend: null,
    trendDayName: "last week",
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [lapsedClients, setLapsedClients] = useState<LapsedClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (permissionsLoading) { setIsLoading(true); return; }
    if (!currentTenant?.id) { setIsLoading(false); return; }

    setIsLoading(true);
    const canViewCustomers = hasPermission("customers");
    const canViewPayments = hasPermission("payments");
    const canViewReports = hasPermission("reports");

    const today = new Date().toISOString().split("T")[0];
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekDayStr = lastWeekDate.toISOString().split("T")[0];
    const lastWeekDayStart = `${lastWeekDayStr}T00:00:00`;
    const lastWeekDayEnd = `${lastWeekDayStr}T23:59:59`;
    const trendDayName = lastWeekDate.toLocaleDateString("en-US", { weekday: "short" });

    try {
      let todayAptsQuery = supabase
        .from("appointments")
        .select(`*, customer:customers!appointments_customer_id_fkey(full_name), services:appointment_services(service_name)`)
        .eq("tenant_id", currentTenant.id)
        .gte("scheduled_start", startOfDay)
        .lte("scheduled_start", endOfDay)
        .order("scheduled_start", { ascending: true });

      let completedAptsQuery = supabase
        .from("appointments")
        .select(`scheduled_start, services:appointment_services(service_name)`)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "completed");

      if (hasScope) {
        todayAptsQuery = todayAptsQuery.in("location_id", scopedLocationIds);
        completedAptsQuery = completedAptsQuery.in("location_id", scopedLocationIds);
      }

      const [
        todayAptsResult,
        customerCountResult,
        outstandingFeesResult,
        purseUsageResult,
        refundsPendingResult,
        creditsResult,
        servicesCountResult,
        productsCountResult,
        recentTransactionsResult,
        recentNotificationsResult,
        completedAptsResult,
        todayRevenueResult,
        newClientsResult,
        weeklyAptsResult,
        prepaidCountResult,
        recentCustomerIdsResult,
        lapsedWindowResult,
        lastWeekSameDayAptsResult,
        lastWeekSameDayRevenueResult,
        prevWeekShowUpResult,
        prevWeekClientsResult,
      ] = await Promise.all([
        todayAptsQuery,

        canViewCustomers
          ? supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id)
          : Promise.resolve({ count: 0, data: null, error: null }),

        canViewCustomers && canViewPayments
          ? supabase.from("customers").select("outstanding_balance").eq("tenant_id", currentTenant.id).gt("outstanding_balance", 0)
          : Promise.resolve({ data: [], error: null }),

        canViewPayments
          ? supabase.from("customer_purses").select("balance").eq("tenant_id", currentTenant.id)
          : Promise.resolve({ data: [], error: null }),

        canViewPayments
          ? supabase.from("refund_requests").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).eq("status", "pending")
          : Promise.resolve({ count: 0, data: null, error: null }),

        supabase.from("communication_credits").select("balance").eq("tenant_id", currentTenant.id).maybeSingle(),

        supabase.from("services").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id),

        supabase.from("products").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id),

        canViewPayments
          ? supabase.from("transactions").select("id, type, amount, currency, created_at, customer:customers(full_name)").eq("tenant_id", currentTenant.id).order("created_at", { ascending: false }).limit(5)
          : Promise.resolve({ data: [], error: null }),

        supabase.from("notifications").select("*").eq("tenant_id", currentTenant.id).order("created_at", { ascending: false }).limit(5),

        canViewReports ? completedAptsQuery : Promise.resolve({ data: [], error: null }),

        canViewPayments
          ? supabase.from("transactions").select("amount").eq("tenant_id", currentTenant.id).in("type", ["payment", "deposit"]).eq("status", "completed").gte("created_at", startOfDay).lte("created_at", endOfDay)
          : Promise.resolve({ data: [], error: null }),

        canViewCustomers
          ? supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gte("created_at", sevenDaysAgo)
          : Promise.resolve({ count: 0, data: null, error: null }),

        supabase.from("appointments").select("status").eq("tenant_id", currentTenant.id).gte("scheduled_start", sevenDaysAgo).lte("scheduled_start", endOfDay).in("status", ["completed", "cancelled"]),

        canViewPayments
          ? supabase.from("customer_purses").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gt("balance", 0)
          : Promise.resolve({ count: 0, data: null, error: null }),

        canViewCustomers
          ? supabase.from("appointments").select("customer_id").eq("tenant_id", currentTenant.id).gte("scheduled_start", fortyFiveDaysAgo).not("status", "eq", "cancelled")
          : Promise.resolve({ data: [], error: null }),

        canViewCustomers
          ? supabase.from("appointments").select("customer_id, scheduled_start, services:appointment_services(service_name), customer:customers!appointments_customer_id_fkey(id, full_name)").eq("tenant_id", currentTenant.id).gte("scheduled_start", ninetyDaysAgo).lt("scheduled_start", fortyFiveDaysAgo).not("status", "eq", "cancelled").order("scheduled_start", { ascending: false })
          : Promise.resolve({ data: [], error: null }),

        // Trend: last week same calendar day appointment count
        supabase.from("appointments").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gte("scheduled_start", lastWeekDayStart).lte("scheduled_start", lastWeekDayEnd).not("status", "eq", "cancelled"),

        // Trend: last week same day revenue
        canViewPayments
          ? supabase.from("transactions").select("amount").eq("tenant_id", currentTenant.id).in("type", ["payment", "deposit"]).eq("status", "completed").gte("created_at", lastWeekDayStart).lte("created_at", lastWeekDayEnd)
          : Promise.resolve({ data: [], error: null }),

        // Trend: show-up rate previous 7-day window
        supabase.from("appointments").select("status").eq("tenant_id", currentTenant.id).gte("scheduled_start", twoWeeksAgo).lt("scheduled_start", sevenDaysAgo).in("status", ["completed", "cancelled"]),

        // Trend: new clients previous 7-day window
        canViewCustomers
          ? supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gte("created_at", twoWeeksAgo).lt("created_at", sevenDaysAgo)
          : Promise.resolve({ count: 0, data: null, error: null }),
      ]);

      // Core stats
      const apts = todayAptsResult.data || [];
      const activeApts = apts.filter((appointment) => appointment.status !== "cancelled");
      const confirmedCount = apts.filter((a) => a.status === "scheduled").length;
      const completedCount = apts.filter((a) => a.status === "completed").length;
      const cancelledCount = apts.filter((a) => a.status === "cancelled").length;

      const revenueToday = (todayRevenueResult.data || []).reduce(
        (sum, t) => sum + Number((t as { amount: number }).amount || 0), 0
      );
      const outstandingFees = (outstandingFeesResult.data || []).reduce(
        (sum, c) => sum + Number(c.outstanding_balance || 0), 0
      );
      const purseUsage = (purseUsageResult.data || []).reduce(
        (sum, p) => sum + Number(p.balance || 0), 0
      );
      const communicationCredits = creditsResult.data?.balance || 0;

      const weekApts = weeklyAptsResult.data || [];
      const weekCompleted = weekApts.filter((a) => a.status === "completed").length;
      const weekTotal = weekApts.length;
      const showUpRate = weekTotal >= 3 ? Math.round((weekCompleted / weekTotal) * 100) : null;

      const newClientsThisWeek = canViewCustomers ? (newClientsResult.count || 0) : 0;

      // Trends
      const lastWeekSameDayCount = lastWeekSameDayAptsResult.count || 0;
      const todayBookingsTrend =
        lastWeekSameDayCount > 0 || activeApts.length > 0
          ? activeApts.length - lastWeekSameDayCount
          : null;

      const lastWeekSameDayRevenue = (lastWeekSameDayRevenueResult.data || []).reduce(
        (sum, t) => sum + Number((t as { amount: number }).amount || 0), 0
      );
      const revenueTrendPct =
        canViewPayments && lastWeekSameDayRevenue > 0
          ? Math.round(((revenueToday - lastWeekSameDayRevenue) / lastWeekSameDayRevenue) * 100)
          : null;

      const prevWeekApts = prevWeekShowUpResult.data || [];
      const prevWeekCompleted = prevWeekApts.filter((a) => a.status === "completed").length;
      const prevWeekTotal = prevWeekApts.length;
      const prevWeekShowUpRate = prevWeekTotal >= 3 ? Math.round((prevWeekCompleted / prevWeekTotal) * 100) : null;
      const showUpRateTrend =
        showUpRate !== null && prevWeekShowUpRate !== null
          ? showUpRate - prevWeekShowUpRate
          : null;

      const prevWeekNewClients = canViewCustomers ? (prevWeekClientsResult.count || 0) : 0;
      const newClientsTrend = canViewCustomers ? newClientsThisWeek - prevWeekNewClients : null;

      setStats({
        todayAppointments: activeApts.length,
        confirmedCount,
        completedCount,
        cancelledCount,
        totalCustomers: canViewCustomers ? (customerCountResult.count || 0) : 0,
        revenueToday: canViewPayments ? revenueToday : 0,
        outstandingFees: canViewCustomers && canViewPayments ? outstandingFees : 0,
        purseUsage: canViewPayments ? purseUsage : 0,
        refundsPendingApproval: canViewPayments ? (refundsPendingResult.count || 0) : 0,
        communicationCredits,
        lowCommunicationCredits: communicationCredits <= 10,
        showUpRate,
        newClientsThisWeek,
        prepaidCustomers: canViewPayments ? (prepaidCountResult.count || 0) : 0,
        todayBookingsTrend,
        revenueTrendPct,
        showUpRateTrend,
        newClientsTrend,
        trendDayName,
      });

      // Staff names (secondary fetch)
      const staffIds = [...new Set(apts.map((a: any) => a.assigned_staff_id).filter(Boolean))];
      let staffMap: Record<string, string> = {};
      if (staffIds.length > 0) {
        const { data: staffProfiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", staffIds as string[]);
        staffMap = Object.fromEntries(
          (staffProfiles || []).map((p) => [p.user_id, p.full_name?.split(" ")[0] || ""])
        );
      }

      // Upcoming appointments
      const upcoming: UpcomingAppointment[] = apts
        .filter((a: any) => a.status !== "completed" && a.status !== "cancelled")
        .map((a: any) => {
          const customerData = a.customer as { full_name: string } | null;
          const servicesData = a.services as { service_name: string }[] | null;
          return {
            id: a.id,
            time: a.scheduled_start ? formatTime(a.scheduled_start) : "—",
            customer: customerData?.full_name || "Unknown",
            service: servicesData?.[0]?.service_name || "Service",
            staffFirstName: a.assigned_staff_id ? (staffMap[a.assigned_staff_id] || null) : null,
            status: a.status,
            paymentStatus: a.payment_status || "unpaid",
            depositAmount: Number(a.deposit_amount || 0),
            displayStatus: deriveDisplayStatus(a.status, a.payment_status || "unpaid", Number(a.deposit_amount || 0), a.approval_status || null),
          };
        });
      setUpcomingAppointments(upcoming);

      // Checklist
      const checklist: ChecklistItem[] = [
        { id: "payments", label: "Set up payouts", completed: currentTenant.payment_setup_status === "ready", href: "/salon/business-settings?tab=payout-destinations" },
        { id: "booking", label: "Enable online booking", completed: currentTenant.online_booking_enabled || false, href: "/salon/business-settings?tab=booking" },
        { id: "products", label: "Add products", completed: (productsCountResult.count || 0) > 0, href: "/salon/services?tab=products" },
        { id: "appointment", label: "Book your first appointment", completed: apts.length > 0 || (completedAptsResult.data?.length || 0) > 0, href: "/salon/appointments" },
        { id: "services", label: "Add services", completed: (servicesCountResult.count || 0) > 0, href: "/salon/services?tab=services" },
        ...(canViewCustomers ? [{ id: "customer", label: "Add first customer", completed: (customerCountResult.count || 0) > 0, href: "/salon/customers" }] : []),
      ];
      setChecklistItems(checklist);

      // Insights
      const completedApts = canViewReports ? (completedAptsResult.data || []) : [];
      const insightsData: Insight[] = [];
      if (completedApts.length >= 10) {
        const dayCount: Record<string, number> = {};
        completedApts.forEach((apt) => {
          if (apt.scheduled_start) {
            const day = new Date(apt.scheduled_start).toLocaleDateString("en-US", { weekday: "long" });
            dayCount[day] = (dayCount[day] || 0) + 1;
          }
        });
        const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
        if (busiestDay) insightsData.push({ id: "busiest-day", title: "Busiest Day", value: busiestDay[0], icon: "calendar" });
      }
      if (completedApts.length >= 5) {
        const serviceCount: Record<string, number> = {};
        completedApts.forEach((apt) => {
          const services = apt.services as { service_name: string }[] | null;
          services?.forEach((s) => { serviceCount[s.service_name] = (serviceCount[s.service_name] || 0) + 1; });
        });
        const topService = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0];
        if (topService) insightsData.push({ id: "top-service", title: "Top Service", value: topService[0], icon: "star" });
      }
      setInsights(canViewReports ? insightsData : []);

      // Recent activity
      const activity: RecentActivity[] = [];
      if (canViewPayments) {
        (recentTransactionsResult.data || []).forEach((tx) => {
          const customerData = tx.customer as { full_name: string } | null;
          activity.push({
            id: tx.id,
            type: "payment",
            title: `Payment ${tx.type}`,
            description: `${tx.currency} ${tx.amount} from ${customerData?.full_name || "Customer"}`,
            timestamp: tx.created_at,
          });
        });
      }
      (recentNotificationsResult.data || []).forEach((notif) => {
        activity.push({
          id: notif.id,
          type: notif.urgent ? "system" : "appointment",
          title: notif.title,
          description: notif.description,
          timestamp: notif.created_at,
        });
      });
      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activity.slice(0, 8));

      // Lapsed clients
      const recentIds = new Set((recentCustomerIdsResult.data || []).map((a: any) => a.customer_id));
      const seen = new Set<string>();
      const lapsed: LapsedClient[] = (lapsedWindowResult.data || [])
        .filter((a: any) => {
          if (recentIds.has(a.customer_id) || seen.has(a.customer_id)) return false;
          seen.add(a.customer_id);
          return true;
        })
        .slice(0, 8)
        .map((a: any) => {
          const daysDiff = Math.floor((Date.now() - new Date(a.scheduled_start).getTime()) / 86400000);
          const customer = a.customer as { id: string; full_name: string } | null;
          const services = a.services as { service_name: string }[] | null;
          return {
            id: customer?.id || a.customer_id,
            name: customer?.full_name || "Customer",
            daysSinceVisit: daysDiff,
            usualService: services?.[0]?.service_name || "—",
            clientStatus: daysDiff >= 75 ? "inactive" as const : "going_quiet" as const,
          };
        });
      setLapsedClients(canViewCustomers ? lapsed : []);

    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentTenant?.id,
    currentTenant?.online_booking_enabled,
    currentTenant?.payment_setup_status,
    hasPermission,
    hasScope,
    permissionsLoading,
    scopedLocationIds,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const checklistProgress = checklistItems.length > 0
    ? Math.round((checklistItems.filter((i) => i.completed).length / checklistItems.length) * 100)
    : 0;

  const isChecklistComplete = checklistProgress === 100;

  return {
    stats,
    upcomingAppointments,
    checklistItems,
    checklistProgress,
    isChecklistComplete,
    insights,
    recentActivity,
    lapsedClients,
    isLoading,
    refetch: fetchStats,
  };
}
