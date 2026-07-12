import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, format } from "date-fns";

export interface StaffPerformance {
  userId: string;
  name: string;
  appointmentsCompleted: number;
  revenue: number;
  avgRating?: number;
}

export interface ReportStats {
  totalRevenue: number;
  prevPeriodRevenue: number;
  revenueChangePercent: number | null;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  cancellationRate: number;
  avgTransactionValue: number;
  newCustomers: number;
  returningCustomers: number;
  retentionPercent: number | null;
  topServices: { name: string; count: number; revenue: number }[];
  paymentMethodBreakdown: { method: string; amount: number; count: number }[];
  dailyRevenue: { date: string; revenue: number; prevRevenue: number }[];
  staffPerformance: StaffPerformance[];
  // Insights
  busiestDay: string | null;
  topService: string | null;
  peakHour: string | null;
  retentionRate: number | null;
  periodLabel: string;
  prevPeriodLabel: string;
}

export function useReports(period: "today" | "week" | "month" | "custom" = "month", customRange?: { start: Date; end: Date }) {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [stats, setStats] = useState<ReportStats>({
    totalRevenue: 0,
    prevPeriodRevenue: 0,
    revenueChangePercent: null,
    totalAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    cancellationRate: 0,
    avgTransactionValue: 0,
    newCustomers: 0,
    returningCustomers: 0,
    retentionPercent: null,
    topServices: [],
    paymentMethodBreakdown: [],
    dailyRevenue: [],
    staffPerformance: [],
    busiestDay: null,
    topService: null,
    peakHour: null,
    retentionRate: null,
    periodLabel: "This Month",
    prevPeriodLabel: "Last Month",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const getDateRange = useCallback(() => {
    const now = new Date();
    switch (period) {
      case "today":
        return {
          current: { start: startOfDay(now), end: endOfDay(now) },
          prev: { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) },
          label: "Today",
          prevLabel: "Yesterday",
        };
      case "week":
        return {
          current: { start: startOfWeek(now), end: endOfWeek(now) },
          prev: { start: startOfWeek(subWeeks(now, 1)), end: endOfWeek(subWeeks(now, 1)) },
          label: "This Week",
          prevLabel: "Last Week",
        };
      case "month":
        return {
          current: { start: startOfMonth(now), end: endOfMonth(now) },
          prev: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
          label: "This Month",
          prevLabel: "Last Month",
        };
      case "custom":
        if (customRange) {
          const duration = customRange.end.getTime() - customRange.start.getTime();
          const prevEnd = new Date(customRange.start.getTime() - 1);
          const prevStart = new Date(prevEnd.getTime() - duration);
          return {
            current: customRange,
            prev: { start: prevStart, end: prevEnd },
            label: `${format(customRange.start, "MMM d")} – ${format(customRange.end, "MMM d")}`,
            prevLabel: `${format(prevStart, "MMM d")} – ${format(prevEnd, "MMM d")}`,
          };
        }
        return {
          current: { start: startOfMonth(now), end: endOfMonth(now) },
          prev: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
          label: "This Month",
          prevLabel: "Last Month",
        };
      default:
        return {
          current: { start: startOfMonth(now), end: endOfMonth(now) },
          prev: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
          label: "This Month",
          prevLabel: "Last Month",
        };
    }
  }, [period, customRange]);

  const fetchReports = useCallback(async () => {
    if (!currentTenant?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const dateRange = getDateRange();
      const { start, end } = dateRange.current;
      const { start: prevStart, end: prevEnd } = dateRange.prev;

      // Fetch appointments in current range
      let appointmentsQuery = supabase
        .from("appointments")
        .select("*, appointment_services(*)")
        .eq("tenant_id", currentTenant.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (hasScope) {
        appointmentsQuery = appointmentsQuery.in("location_id", scopedLocationIds);
      }

      // Fetch profiles for staff names
      const profilesQuery = supabase.from("profiles").select("user_id, full_name");

      const [{ data: appointments }, { data: profiles }] = await Promise.all([appointmentsQuery, profilesQuery]);

      const aptList = appointments || [];
      const profileList = profiles || [];
      const profileMap = new Map(profileList.map((p) => [p.user_id, p.full_name]));

      const scopedAppointmentIds = aptList.map((a) => a.id);
      const scopedCustomerIds = [...new Set(aptList.map((a) => a.customer_id).filter(Boolean))];

      // Build transaction query helper
      const buildTxnQuery = (from: Date, to: Date, aptIds: string[]) => {
        let q = supabase
          .from("transactions")
          .select("*")
          .eq("tenant_id", currentTenant.id)
          .eq("status", "completed")
          .in("type", ["payment", "deposit"])
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString());
        if (hasScope) {
          q = aptIds.length === 0 ? q.is("id", null) : q.in("appointment_id", aptIds);
        }
        return q;
      };

      // Fetch current + previous period transactions and new customers in parallel
      let customersQuery = supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (hasScope) {
        customersQuery = scopedCustomerIds.length === 0
          ? customersQuery.is("id", null)
          : customersQuery.in("id", scopedCustomerIds);
      }

      const prevTxnQuery = buildTxnQuery(prevStart, prevEnd, scopedAppointmentIds);
      const currTxnQuery = buildTxnQuery(start, end, scopedAppointmentIds);

      const [{ data: transactions }, { data: prevTransactions }, { data: customers }] = await Promise.all([
        currTxnQuery,
        prevTxnQuery,
        customersQuery,
      ]);

      const txnList = transactions || [];
      const prevTxnList = prevTransactions || [];
      const customerList = customers || [];

      // Core stats
      const totalRevenue = txnList.reduce((sum, t) => sum + Number(t.amount), 0);
      const prevPeriodRevenue = prevTxnList.reduce((sum, t) => sum + Number(t.amount), 0);
      const revenueChangePercent = prevPeriodRevenue > 0
        ? Math.round(((totalRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100)
        : totalRevenue > 0 ? 100 : null;

      const totalAppointments = aptList.length;
      const completedAppointments = aptList.filter((a) => a.status === "completed").length;
      const cancelledAppointments = aptList.filter((a) => a.status === "cancelled").length;
      const cancellationRate = totalAppointments > 0
        ? Math.round((cancelledAppointments / totalAppointments) * 100)
        : 0;
      const avgTransactionValue = txnList.length > 0
        ? Math.round(totalRevenue / txnList.length)
        : 0;

      const newCustomers = customerList.length;
      const returningCustomers = aptList.filter((a) => {
        const cust = customerList.find((c) => c.id === a.customer_id);
        return cust && (cust as { visit_count?: number }).visit_count != null && (cust as { visit_count: number }).visit_count > 1;
      }).length;
      const retentionPercent = newCustomers > 0 && returningCustomers >= 3
        ? Math.round((returningCustomers / newCustomers) * 100)
        : null;

      // Insights
      let busiestDay: string | null = null;
      let topServiceName: string | null = null;
      let peakHour: string | null = null;
      let retentionRate: number | null = retentionPercent;

      if (completedAppointments >= 10) {
        const dayCount: Record<string, number> = {};
        aptList.filter((a) => a.status === "completed" && a.scheduled_start).forEach((apt) => {
          const day = format(new Date(apt.scheduled_start!), "EEEE");
          dayCount[day] = (dayCount[day] || 0) + 1;
        });
        const sortedDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1]);
        if (sortedDays.length > 0) busiestDay = sortedDays[0][0];
      }

      if (completedAppointments >= 20) {
        const hourCount: Record<string, number> = {};
        aptList.filter((a) => a.status === "completed" && a.scheduled_start).forEach((apt) => {
          const hour = format(new Date(apt.scheduled_start!), "h a");
          hourCount[hour] = (hourCount[hour] || 0) + 1;
        });
        const sortedHours = Object.entries(hourCount).sort((a, b) => b[1] - a[1]);
        if (sortedHours.length > 0) peakHour = sortedHours[0][0];
      }

      // Top services
      const serviceCount: Record<string, { count: number; revenue: number }> = {};
      aptList.forEach((apt) => {
        (apt.appointment_services || []).forEach((svc: { service_name: string; price: string | number }) => {
          if (!serviceCount[svc.service_name]) serviceCount[svc.service_name] = { count: 0, revenue: 0 };
          serviceCount[svc.service_name].count++;
          serviceCount[svc.service_name].revenue += Number(svc.price);
        });
      });
      const topServices = Object.entries(serviceCount)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      if (completedAppointments >= 5 && topServices.length > 0) topServiceName = topServices[0].name;

      // Payment method breakdown
      const methodCount: Record<string, { amount: number; count: number }> = {};
      txnList.forEach((txn) => {
        const method = (txn as { method?: string }).method || "other";
        if (!methodCount[method]) methodCount[method] = { amount: 0, count: 0 };
        methodCount[method].amount += Number(txn.amount);
        methodCount[method].count++;
      });
      const paymentMethodBreakdown = Object.entries(methodCount).map(([method, data]) => ({ method, ...data }));

      // Daily revenue bucketed within the current period
      const dailyRevenue: { date: string; revenue: number; prevRevenue: number }[] = [];
      const days = period === "today" ? 1 : period === "week" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const day = subDays(end, i);
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        const prevDay = subDays(prevEnd, i);
        const prevDayStart = startOfDay(prevDay);
        const prevDayEnd = endOfDay(prevDay);
        const dayRevenue = txnList
          .filter((t) => { const d = new Date(t.created_at); return d >= dayStart && d <= dayEnd; })
          .reduce((sum, t) => sum + Number(t.amount), 0);
        const prevDayRevenue = prevTxnList
          .filter((t) => { const d = new Date(t.created_at); return d >= prevDayStart && d <= prevDayEnd; })
          .reduce((sum, t) => sum + Number(t.amount), 0);
        dailyRevenue.push({ date: format(day, period === "today" ? "h a" : "MMM d"), revenue: dayRevenue, prevRevenue: prevDayRevenue });
      }

      // Staff performance
      const staffStats: Record<string, { appointmentsCompleted: number; revenue: number }> = {};
      aptList.filter((a) => a.status === "completed" && a.assigned_staff_id).forEach((apt) => {
        const staffId = apt.assigned_staff_id!;
        if (!staffStats[staffId]) staffStats[staffId] = { appointmentsCompleted: 0, revenue: 0 };
        staffStats[staffId].appointmentsCompleted++;
        staffStats[staffId].revenue += Number((apt as { total_amount?: number }).total_amount || 0);
      });
      const staffPerformance: StaffPerformance[] = Object.entries(staffStats)
        .map(([userId, data]) => ({ userId, name: profileMap.get(userId) || "Unknown Staff", ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setStats({
        totalRevenue,
        prevPeriodRevenue,
        revenueChangePercent,
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        cancellationRate,
        avgTransactionValue,
        newCustomers,
        returningCustomers,
        retentionPercent,
        topServices,
        paymentMethodBreakdown,
        dailyRevenue,
        staffPerformance,
        busiestDay,
        topService: topServiceName,
        peakHour,
        retentionRate,
        periodLabel: dateRange.label,
        prevPeriodLabel: dateRange.prevLabel,
      });
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, getDateRange, hasScope, scopedLocationIds, period]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return {
    stats,
    isLoading,
    error,
    refetch: fetchReports,
  };
}
