import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from "date-fns";

export interface StaffPerformance {
  userId: string;
  name: string;
  appointmentsCompleted: number;
  revenue: number;
  avgRating?: number;
}

export interface ReportStats {
  totalRevenue: number;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  newCustomers: number;
  returningCustomers: number;
  topServices: { name: string; count: number; revenue: number }[];
  paymentMethodBreakdown: { method: string; amount: number; count: number }[];
  dailyRevenue: { date: string; revenue: number }[];
  staffPerformance: StaffPerformance[];
  // Insights
  busiestDay: string | null;
  topService: string | null;
  peakHour: string | null;
  retentionRate: number | null;
}

export function useReports(period: "today" | "week" | "month" | "custom" = "month", customRange?: { start: Date; end: Date }) {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [stats, setStats] = useState<ReportStats>({
    totalRevenue: 0,
    totalAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    newCustomers: 0,
    returningCustomers: 0,
    topServices: [],
    paymentMethodBreakdown: [],
    dailyRevenue: [],
    staffPerformance: [],
    busiestDay: null,
    topService: null,
    peakHour: null,
    retentionRate: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const getDateRange = useCallback(() => {
    const now = new Date();
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "custom":
        return customRange || { start: startOfMonth(now), end: endOfMonth(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
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
      const { start, end } = getDateRange();

      // Fetch appointments in range with staff info
      let appointmentsQuery = supabase
        .from("appointments")
        .select("*, appointment_services(*)")
        .eq("tenant_id", currentTenant.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (hasScope) {
        appointmentsQuery = appointmentsQuery.in("location_id", scopedLocationIds);
      }

      const { data: appointments } = await appointmentsQuery;

      const scopedAppointmentIds = (appointments || []).map((appointment) => appointment.id);
      const scopedCustomerIds = [...new Set((appointments || []).map((appointment) => appointment.customer_id))];

      // Fetch transactions in range
      let transactionsQuery = supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (hasScope) {
        if (scopedAppointmentIds.length === 0) {
          transactionsQuery = transactionsQuery.is("id", null);
        } else {
          transactionsQuery = transactionsQuery.in("appointment_id", scopedAppointmentIds);
        }
      }

      const { data: transactions } = await transactionsQuery;

      // Fetch new customers in range
      let customersQuery = supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (hasScope) {
        if (scopedCustomerIds.length === 0) {
          customersQuery = customersQuery.is("id", null);
        } else {
          customersQuery = customersQuery.in("id", scopedCustomerIds);
        }
      }

      const { data: customers } = await customersQuery;

      // Fetch profiles for staff names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name");

      const aptList = appointments || [];
      const txnList = transactions || [];
      const customerList = customers || [];
      const profileList = profiles || [];
      const profileMap = new Map(profileList.map((p) => [p.user_id, p.full_name]));

      // Calculate stats
      const totalRevenue = txnList.filter((t) => t.type === "payment").reduce((sum, t) => sum + Number(t.amount), 0);
      const totalAppointments = aptList.length;
      const completedAppointments = aptList.filter((a) => a.status === "completed").length;
      const cancelledAppointments = aptList.filter((a) => a.status === "cancelled").length;
      const newCustomers = customerList.length;
      const returningCustomers = aptList.filter((a) => {
        const cust = customerList.find((c) => c.id === a.customer_id);
        return cust && cust.visit_count > 1;
      }).length;

      // Insights calculations
      let busiestDay: string | null = null;
      let topServiceName: string | null = null;
      let peakHour: string | null = null;
      let retentionRate: number | null = null;

      // Busiest day (requires >= 10 completed appointments)
      if (completedAppointments >= 10) {
        const dayCount: Record<string, number> = {};
        aptList.filter((a) => a.status === "completed" && a.scheduled_start).forEach((apt) => {
          const day = format(new Date(apt.scheduled_start!), "EEEE");
          dayCount[day] = (dayCount[day] || 0) + 1;
        });
        const sortedDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1]);
        if (sortedDays.length > 0) {
          busiestDay = sortedDays[0][0];
        }
      }

      // Peak hour (requires >= 20 completed appointments)
      if (completedAppointments >= 20) {
        const hourCount: Record<string, number> = {};
        aptList.filter((a) => a.status === "completed" && a.scheduled_start).forEach((apt) => {
          const hour = format(new Date(apt.scheduled_start!), "h a");
          hourCount[hour] = (hourCount[hour] || 0) + 1;
        });
        const sortedHours = Object.entries(hourCount).sort((a, b) => b[1] - a[1]);
        if (sortedHours.length > 0) {
          peakHour = sortedHours[0][0];
        }
      }

      // Retention rate (requires >= 5 returning customers)
      if (returningCustomers >= 5 && customerList.length > 0) {
        retentionRate = Math.round((returningCustomers / customerList.length) * 100);
      }

      // Top services
      const serviceCount: Record<string, { count: number; revenue: number }> = {};
      aptList.forEach((apt) => {
        (apt.appointment_services || []).forEach((svc: any) => {
          if (!serviceCount[svc.service_name]) {
            serviceCount[svc.service_name] = { count: 0, revenue: 0 };
          }
          serviceCount[svc.service_name].count++;
          serviceCount[svc.service_name].revenue += Number(svc.price);
        });
      });
      const topServices = Object.entries(serviceCount)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Set top service insight (requires >= 5 completed appointments)
      if (completedAppointments >= 5 && topServices.length > 0) {
        topServiceName = topServices[0].name;
      }

      // Payment method breakdown
      const methodCount: Record<string, { amount: number; count: number }> = {};
      txnList.filter((t) => t.type === "payment").forEach((txn) => {
        if (!methodCount[txn.method]) {
          methodCount[txn.method] = { amount: 0, count: 0 };
        }
        methodCount[txn.method].amount += Number(txn.amount);
        methodCount[txn.method].count++;
      });
      const paymentMethodBreakdown = Object.entries(methodCount).map(([method, data]) => ({ method, ...data }));

      // Daily revenue (last 30 days for month view)
      const dailyRevenue: { date: string; revenue: number }[] = [];
      const days = period === "today" ? 1 : period === "week" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        const dayRevenue = txnList
          .filter((t) => {
            const txnDate = new Date(t.created_at);
            return t.type === "payment" && txnDate >= dayStart && txnDate <= dayEnd;
          })
          .reduce((sum, t) => sum + Number(t.amount), 0);
        dailyRevenue.push({
          date: format(day, "MMM dd"),
          revenue: dayRevenue,
        });
      }

      // Staff performance
      const staffStats: Record<string, { appointmentsCompleted: number; revenue: number }> = {};
      aptList.filter((a) => a.status === "completed" && a.assigned_staff_id).forEach((apt) => {
        const staffId = apt.assigned_staff_id!;
        if (!staffStats[staffId]) {
          staffStats[staffId] = { appointmentsCompleted: 0, revenue: 0 };
        }
        staffStats[staffId].appointmentsCompleted++;
        staffStats[staffId].revenue += Number(apt.total_amount || 0);
      });

      const staffPerformance: StaffPerformance[] = Object.entries(staffStats)
        .map(([userId, data]) => ({
          userId,
          name: profileMap.get(userId) || "Unknown Staff",
          ...data,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setStats({
        totalRevenue,
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        newCustomers,
        returningCustomers,
        topServices,
        paymentMethodBreakdown,
        dailyRevenue,
        staffPerformance,
        busiestDay,
        topService: topServiceName,
        peakHour,
        retentionRate,
      });
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, getDateRange, hasScope, scopedLocationIds]);

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
