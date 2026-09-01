import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";

interface ScheduledStats {
  rangeCount: number;
  giftedCount: number;
  cancelledCount: number;
  rescheduledCount: number;
  amountDue: number;
  unconfirmedCount: number;
  unconfirmedValue: number;
}

interface UnscheduledStats {
  totalCount: number;
  giftedCount: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
}

interface UseAppointmentStatsOptions {
  startDate?: string;
  endDate?: string;
}

interface UseAppointmentStatsResult {
  scheduledStats: ScheduledStats;
  unscheduledStats: UnscheduledStats;
  isLoading: boolean;
  refetch: () => void;
}

export function useAppointmentStats(options: UseAppointmentStatsOptions = {}): UseAppointmentStatsResult {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [scheduledStats, setScheduledStats] = useState<ScheduledStats>({
    rangeCount: 0,
    giftedCount: 0,
    cancelledCount: 0,
    rescheduledCount: 0,
    amountDue: 0,
    unconfirmedCount: 0,
    unconfirmedValue: 0,
  });
  const [unscheduledStats, setUnscheduledStats] = useState<UnscheduledStats>({
    totalCount: 0,
    giftedCount: 0,
    paidCount: 0,
    unpaidCount: 0,
    partialCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!currentTenant?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Use provided date range or default to today
    const startOfRange = options.startDate
      ? `${options.startDate}T00:00:00`
      : new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const endOfRange = options.endDate
      ? `${options.endDate}T23:59:59.999`
      : new Date(new Date().setHours(23, 59, 59, 999)).toISOString();

    // Apply location scope to any Supabase filter builder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function withLocation(q: any): any {
      return hasScope && scopedLocationIds.length > 0
        ? q.in("location_id", scopedLocationIds)
        : q;
    }

    try {
      // Fetch scheduled stats (appointments in date range)
      const [
        rangeResult,
        giftedResult,
        cancelledResult,
        rescheduledResult,
        amountDueResult,
        unconfirmedCountResult,
        unconfirmedValueResult,
        unscheduledTotalResult,
        unscheduledGiftedResult,
        unscheduledPaidResult,
        unscheduledUnpaidResult,
        unscheduledPartialResult,
      ] = await Promise.all([
        // Scheduled appointments in range
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", false)
          .gte("scheduled_start", startOfRange)
          .lte("scheduled_start", endOfRange)),

        // Gifted appointments in range
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_gifted", true)
          .eq("is_unscheduled", false)
          .gte("scheduled_start", startOfRange)
          .lte("scheduled_start", endOfRange)),

        // Cancelled appointments in range
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("status", "cancelled")
          .eq("is_unscheduled", false)
          .gte("scheduled_start", startOfRange)
          .lte("scheduled_start", endOfRange)),

        // Rescheduled appointments in range (reschedule_count > 0)
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .gt("reschedule_count", 0)
          .eq("is_unscheduled", false)
          .gte("scheduled_start", startOfRange)
          .lte("scheduled_start", endOfRange)),

        // Amount due for scheduled appointments in range (not fully paid)
        withLocation(supabase
          .from("appointments")
          .select("total_amount, amount_paid")
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", false)
          .neq("status", "cancelled")
          .neq("payment_status", "fully_paid")
          .neq("payment_status", "refunded_full")
          .gte("scheduled_start", startOfRange)
          .lte("scheduled_start", endOfRange)),

        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", false)
          .in("approval_status", ["pending", "reschedule_proposed"])
          .or(
            `and(created_at.gte.${startOfRange},created_at.lte.${endOfRange}),and(scheduled_start.gte.${startOfRange},scheduled_start.lte.${endOfRange})`
          )),

        withLocation(supabase
          .from("appointments")
          .select("total_amount")
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", false)
          .in("approval_status", ["pending", "reschedule_proposed"])
          .or(
            `and(created_at.gte.${startOfRange},created_at.lte.${endOfRange}),and(scheduled_start.gte.${startOfRange},scheduled_start.lte.${endOfRange})`
          )),

        // Total unscheduled
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true)),

        // Unscheduled + gifted
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true)
          .eq("is_gifted", true)),

        // Unscheduled + fully paid
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true)
          .eq("payment_status", "fully_paid")),

        // Unscheduled + unpaid
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true)
          .eq("payment_status", "unpaid")),

        // Unscheduled + deposit paid (partial)
        withLocation(supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("is_unscheduled", true)
          .eq("payment_status", "deposit_paid")),
      ]);

      // Calculate amount due
      const amountDue = amountDueResult.data?.reduce((sum, apt) => {
        return sum + ((apt.total_amount || 0) - (apt.amount_paid || 0));
      }, 0) || 0;
      const unconfirmedValue = unconfirmedValueResult.data?.reduce((sum, apt) => {
        return sum + Number(apt.total_amount || 0);
      }, 0) || 0;

      setScheduledStats({
        rangeCount: rangeResult.count || 0,
        giftedCount: giftedResult.count || 0,
        cancelledCount: cancelledResult.count || 0,
        rescheduledCount: rescheduledResult.count || 0,
        amountDue,
        unconfirmedCount: unconfirmedCountResult.count || 0,
        unconfirmedValue,
      });

      setUnscheduledStats({
        totalCount: unscheduledTotalResult.count || 0,
        giftedCount: unscheduledGiftedResult.count || 0,
        paidCount: unscheduledPaidResult.count || 0,
        unpaidCount: unscheduledUnpaidResult.count || 0,
        partialCount: unscheduledPartialResult.count || 0,
      });
    } catch (error) {
      console.error("Error fetching appointment stats:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, options.startDate, options.endDate, hasScope, scopedLocationIds]);

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
