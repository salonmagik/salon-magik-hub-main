import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from "date-fns";

export interface ReportStats {
  totalRevenue: number;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  newCustomers: number;
  returningCustomers: number;
  averageTicket: number;
  topServices: { name: string; count: number; revenue: number }[];
  paymentMethodBreakdown: { method: string; amount: number; count: number }[];
  dailyRevenue: { date: string; revenue: number }[];
}

export function useReports(period: "today" | "week" | "month" | "custom" = "month", customRange?: { start: Date; end: Date }) {
  const { currentTenant } = useAuth();
  const [stats, setStats] = useState<ReportStats>({
    totalRevenue: 0,
    totalAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    newCustomers: 0,
    returningCustomers: 0,
    averageTicket: 0,
    topServices: [],
    paymentMethodBreakdown: [],
    dailyRevenue: [],
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

      // Fetch appointments in range
      const { data: appointments } = await supabase
        .from("appointments")
        .select("*, appointment_services(*)")
        .eq("tenant_id", currentTenant.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Fetch transactions in range
      const { data: transactions } = await supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Fetch new customers in range
      const { data: customers } = await supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const aptList = appointments || [];
      const txnList = transactions || [];
      const customerList = customers || [];

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
      const averageTicket = completedAppointments > 0 ? totalRevenue / completedAppointments : 0;

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

      setStats({
        totalRevenue,
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        newCustomers,
        returningCustomers,
        averageTicket,
        topServices,
        paymentMethodBreakdown,
        dailyRevenue,
      });
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, getDateRange]);

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
