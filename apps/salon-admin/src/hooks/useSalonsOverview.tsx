import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import { usePermissions } from "./usePermissions";
import { startOfDay, startOfWeek, startOfMonth, endOfDay } from "date-fns";

export interface LocationPerformance {
  id: string;
  name: string;
  city: string;
  country: string;
  revenue: number;
  bookingCount: number;
  staffOnline: number;
  outstandingAppointments: number;
  customerSatisfaction: number | null;
}

type DateRange = "today" | "week" | "month";

// Consider a session active if last activity was within 5 minutes
const ACTIVITY_THRESHOLD_MINUTES = 5;

function getDateRange(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const end = endOfDay(now);
  
  switch (range) {
    case "today":
      return { start: startOfDay(now), end };
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end };
    case "month":
      return { start: startOfMonth(now), end };
    default:
      return { start: startOfDay(now), end };
  }
}

export function useSalonsOverview(dateRange: DateRange = "week") {
  const { currentTenant } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [locations, setLocations] = useState<LocationPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOverview = useCallback(async () => {
    if (permissionsLoading) {
      setIsLoading(true);
      return;
    }

    if (!currentTenant?.id) {
      setLocations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const canViewRevenueAnalytics = hasPermission("reports");

    try {
      const { start, end } = getDateRange(dateRange);
      const activityThreshold = new Date();
      activityThreshold.setMinutes(activityThreshold.getMinutes() - ACTIVITY_THRESHOLD_MINUTES);

      // Fetch locations for this tenant
      let locationsQuery = supabase
        .from("locations")
        .select("id, name, city, country")
        .eq("tenant_id", currentTenant.id);

      if (hasScope) {
        locationsQuery = locationsQuery.in("id", scopedLocationIds);
      }

      const { data: locationsData, error: locationsError } = await locationsQuery;

      if (locationsError) throw locationsError;

      if (!locationsData || locationsData.length === 0) {
        setLocations([]);
        setIsLoading(false);
        return;
      }

      // Fetch appointments for booking counts
      let appointmentsQuery = supabase
        .from("appointments")
        .select("id, location_id, status, scheduled_start")
        .eq("tenant_id", currentTenant.id)
        .gte("scheduled_start", start.toISOString())
        .lte("scheduled_start", end.toISOString());

      if (hasScope) {
        appointmentsQuery = appointmentsQuery.in("location_id", scopedLocationIds);
      }

      // Fetch active staff sessions for real-time online count
      let staffSessionsQuery = supabase
        .from("staff_sessions")
        .select("location_id")
        .eq("tenant_id", currentTenant.id)
        .is("ended_at", null)
        .gte("last_activity_at", activityThreshold.toISOString());

      if (hasScope) {
        staffSessionsQuery = staffSessionsQuery.in("location_id", scopedLocationIds);
      }

      // Fetch revenue from transactions table (payment + deposit, completed, in date range)
      let revenueTransactionsQuery = supabase
        .from("transactions")
        .select("amount, appointment:appointments!inner(location_id)")
        .eq("tenant_id", currentTenant.id)
        .in("type", ["payment", "deposit"])
        .eq("status", "completed")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const [
        { data: appointments, error: appointmentsError },
        { data: staffSessions, error: sessionsError },
        { data: revenueTransactions, error: revenueError },
      ] = await Promise.all([
        appointmentsQuery,
        staffSessionsQuery,
        canViewRevenueAnalytics
          ? revenueTransactionsQuery
          : Promise.resolve({ data: [] as { amount: number; appointment: { location_id: string } | null }[], error: null }),
      ]);

      if (appointmentsError) throw appointmentsError;
      if (sessionsError) throw sessionsError;
      if (revenueError) throw revenueError;

      // Group revenue by location
      const revenueByLocation: Record<string, number> = {};
      (revenueTransactions || []).forEach((txn) => {
        const apt = txn.appointment as { location_id: string } | null;
        const locId = apt?.location_id;
        if (locId) {
          revenueByLocation[locId] = (revenueByLocation[locId] || 0) + Number(txn.amount);
        }
      });

      // Count staff online by location
      const staffByLocation: Record<string, number> = {};
      staffSessions?.forEach((session) => {
        const locId = session.location_id || "unassigned";
        staffByLocation[locId] = (staffByLocation[locId] || 0) + 1;
      });

      // Build performance data for each location
      const performanceData: LocationPerformance[] = locationsData.map((loc) => {
        const locationAppointments = appointments?.filter((a) => a.location_id === loc.id) || [];
        const outstandingAppointments = locationAppointments.filter(
          (a) => a.status === "scheduled" || a.status === "started" || a.status === "paused"
        );

        const revenue = canViewRevenueAnalytics ? (revenueByLocation[loc.id] || 0) : 0;
        
        // Use real staff session data
        const staffOnline = staffByLocation[loc.id] || 0;
        
        return {
          id: loc.id,
          name: loc.name,
          city: loc.city,
          country: loc.country,
          revenue,
          bookingCount: locationAppointments.length,
          staffOnline,
          outstandingAppointments: outstandingAppointments.length,
          customerSatisfaction: null, // Would come from reviews table
        };
      });

      setLocations(performanceData);
    } catch (err) {
      console.error("Error fetching salons overview:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, dateRange, hasPermission, hasScope, permissionsLoading, scopedLocationIds]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Subscribe to realtime changes for staff sessions
  useEffect(() => {
    if (!currentTenant?.id) return;

    const channel = supabase
      .channel("salon-overview-sessions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_sessions",
          filter: `tenant_id=eq.${currentTenant.id}`,
        },
        () => {
          fetchOverview();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenant?.id, fetchOverview]);

  return {
    locations,
    isLoading,
    error,
    refetch: fetchOverview,
  };
}
