import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface ScheduledStats {
  todayCount: number;
  giftedCount: number;
  cancelledCount: number;
  rescheduledCount: number;
}

interface UnscheduledStats {
  totalCount: number;
  giftedCount: number;
}

interface UseAppointmentStatsResult {
  scheduledStats: ScheduledStats;
  unscheduledStats: UnscheduledStats;
  isLoading: boolean;
  refetch: () => void;
}

export function useAppointmentStats(): UseAppointmentStatsResult {
  const { currentTenant } = useAuth();
  const [scheduledStats, setScheduledStats] = useState<ScheduledStats>({
    todayCount: 0,
    giftedCount: 0,
    cancelledCount: 0,
    rescheduledCount: 0,
  });
  const [unscheduledStats, setUnscheduledStats] = useState<UnscheduledStats>({
    totalCount: 0,
    giftedCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!currentTenant?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

    try {
      // Fetch scheduled stats (today's appointments)
      const [
        todayResult,
        giftedResult,
        cancelledResult,
        rescheduledResult,
        unscheduledTotalResult,
        unscheduledGiftedResult,
      ] = await Promise.all([
        // Today's scheduled appointments
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", false)
          .gte("scheduled_start", startOfDay)
          .lte("scheduled_start", endOfDay),
        
        // Today's gifted appointments
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_gifted", true)
          .gte("scheduled_start", startOfDay)
          .lte("scheduled_start", endOfDay),
        
        // Today's cancelled appointments
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("status", "cancelled")
          .gte("scheduled_start", startOfDay)
          .lte("scheduled_start", endOfDay),
        
        // Today's rescheduled appointments (reschedule_count > 0)
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .gt("reschedule_count", 0)
          .gte("scheduled_start", startOfDay)
          .lte("scheduled_start", endOfDay),
        
        // Total unscheduled
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true),
        
        // Unscheduled + gifted
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true)
          .eq("is_gifted", true),
      ]);

      setScheduledStats({
        todayCount: todayResult.count || 0,
        giftedCount: giftedResult.count || 0,
        cancelledCount: cancelledResult.count || 0,
        rescheduledCount: rescheduledResult.count || 0,
      });

      setUnscheduledStats({
        totalCount: unscheduledTotalResult.count || 0,
        giftedCount: unscheduledGiftedResult.count || 0,
      });
    } catch (error) {
      console.error("Error fetching appointment stats:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    scheduledStats,
    unscheduledStats,
    isLoading,
    refetch: fetchStats,
  };
}
