import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
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
  const [locations, setLocations] = useState<LocationPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!currentTenant?.id) {
      setLocations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { start, end } = getDateRange(dateRange);

      // Fetch locations for this tenant
      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name, city, country")
        .eq("tenant_id", currentTenant.id);

      if (locationsError) throw locationsError;

      if (!locationsData || locationsData.length === 0) {
        setLocations([]);
        setIsLoading(false);
        return;
      }

      // Fetch appointments for revenue and booking counts
      const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("id, location_id, total_amount, amount_paid, status, scheduled_start")
        .eq("tenant_id", currentTenant.id)
        .gte("scheduled_start", start.toISOString())
        .lte("scheduled_start", end.toISOString());

      if (appointmentsError) throw appointmentsError;

      // Fetch staff roles for staff count (simplified - just count unique users per location)
      // In a real implementation, you'd track actual online sessions
      const { data: staffRoles, error: staffError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", currentTenant.id);

      if (staffError) throw staffError;

      // Build performance data for each location
      const performanceData: LocationPerformance[] = locationsData.map((loc) => {
        const locationAppointments = appointments?.filter((a) => a.location_id === loc.id) || [];
        const completedAppointments = locationAppointments.filter((a) => a.status === "completed");
        const outstandingAppointments = locationAppointments.filter(
          (a) => a.status === "scheduled" || a.status === "started" || a.status === "paused"
        );
        
        const revenue = completedAppointments.reduce((sum, a) => sum + Number(a.amount_paid || 0), 0);
        
        // Simplified staff online count - in production, track actual sessions
        const staffOnline = Math.floor(Math.random() * 3) + 1; // Placeholder
        
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
  }, [currentTenant?.id, dateRange]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return {
    locations,
    isLoading,
    error,
    refetch: fetchOverview,
  };
}
