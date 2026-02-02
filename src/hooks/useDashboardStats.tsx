import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";

type Appointment = Tables<"appointments">;
type Customer = Tables<"customers">;

interface DashboardStats {
  todayAppointments: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  totalCustomers: number;
  revenueToday: number;
}

interface UpcomingAppointment {
  id: string;
  time: string;
  customer: string;
  service: string;
  status: string;
}

export function useDashboardStats() {
  const { currentTenant } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    confirmedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    totalCustomers: 0,
    revenueToday: 0,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!currentTenant?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    try {
      // Fetch today's appointments with customer info
      const { data: todayApts, error: aptsError } = await supabase
        .from("appointments")
        .select(`
          *,
          customer:customers(full_name),
          services:appointment_services(service_name)
        `)
        .eq("tenant_id", currentTenant.id)
        .gte("scheduled_start", startOfDay)
        .lte("scheduled_start", endOfDay)
        .order("scheduled_start", { ascending: true });

      if (aptsError) throw aptsError;

      // Fetch total customers
      const { count: customerCount, error: custError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", currentTenant.id);

      if (custError) throw custError;

      // Calculate stats
      const apts = todayApts || [];
      const confirmedCount = apts.filter((a) => a.status === "scheduled").length;
      const completedCount = apts.filter((a) => a.status === "completed").length;
      const cancelledCount = apts.filter((a) => a.status === "cancelled").length;
      const revenueToday = apts
        .filter((a) => a.status === "completed")
        .reduce((sum, a) => sum + Number(a.amount_paid || 0), 0);

      setStats({
        todayAppointments: apts.length,
        confirmedCount,
        completedCount,
        cancelledCount,
        totalCustomers: customerCount || 0,
        revenueToday,
      });

      // Format upcoming appointments
      const upcoming: UpcomingAppointment[] = apts
        .filter((a) => a.status !== "completed" && a.status !== "cancelled")
        .slice(0, 5)
        .map((a) => {
          const startTime = a.scheduled_start 
            ? new Date(a.scheduled_start).toLocaleTimeString("en-US", { 
                hour: "2-digit", 
                minute: "2-digit",
                hour12: true 
              })
            : "—";
          const customerData = a.customer as { full_name: string } | null;
          const servicesData = a.services as { service_name: string }[] | null;

          return {
            id: a.id,
            time: startTime,
            customer: customerData?.full_name || "Unknown",
            service: servicesData?.[0]?.service_name || "Service",
            status: a.status,
          };
        });

      setUpcomingAppointments(upcoming);
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    upcomingAppointments,
    isLoading,
    refetch: fetchStats,
  };
}
