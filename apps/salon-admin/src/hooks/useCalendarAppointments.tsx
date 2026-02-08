import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";

type Appointment = Tables<"appointments">;
type Customer = Tables<"customers">;
type AppointmentService = Tables<"appointment_services">;

export interface CalendarAppointment extends Appointment {
  customer: Customer | null;
  services: AppointmentService[];
}

export type CalendarView = "day" | "week" | "month";

interface UseCalendarAppointmentsOptions {
  view: CalendarView;
  date: Date;
  locationId?: string;
}

export function useCalendarAppointments(options: UseCalendarAppointmentsOptions) {
  const { currentTenant } = useAuth();
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const getDateRange = useCallback(() => {
    const { view, date } = options;
    let start: Date;
    let end: Date;

    switch (view) {
      case "day":
        start = new Date(date);
        start.setHours(0, 0, 0, 0);
        end = new Date(date);
        end.setHours(23, 59, 59, 999);
        break;
      case "week":
        start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
        end = endOfWeek(date, { weekStartsOn: 1 });
        break;
      case "month":
        start = startOfMonth(date);
        end = endOfMonth(date);
        break;
    }

    return { 
      start: format(start, "yyyy-MM-dd'T'00:00:00"), 
      end: format(end, "yyyy-MM-dd'T'23:59:59") 
    };
  }, [options.view, options.date]);

  const fetchAppointments = useCallback(async () => {
    if (!currentTenant?.id) {
      setAppointments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { start, end } = getDateRange();

      let query = supabase
        .from("appointments")
        .select(`
          *,
          customer:customers(*),
          services:appointment_services(*)
        `)
        .eq("tenant_id", currentTenant.id)
        .gte("scheduled_start", start)
        .lte("scheduled_start", end)
        .order("scheduled_start", { ascending: true });

      if (options.locationId) {
        query = query.eq("location_id", options.locationId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setAppointments((data as CalendarAppointment[]) || []);
    } catch (err) {
      console.error("Error fetching calendar appointments:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, getDateRange, options.locationId]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return {
    appointments,
    isLoading,
    error,
    refetch: fetchAppointments,
  };
}
