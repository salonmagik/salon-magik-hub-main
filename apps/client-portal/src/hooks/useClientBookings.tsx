import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";
import type { Tables, Enums } from "@/lib/supabase";

type Appointment = Tables<"appointments">;
type AppointmentService = Tables<"appointment_services">;
type Tenant = Tables<"tenants">;
type Location = Tables<"locations">;
type AppointmentStatus = Enums<"appointment_status">;

export interface ClientAppointmentWithDetails extends Appointment {
  services: AppointmentService[];
  tenant: Tenant | null;
  location: Location | null;
}

type BookingFilter = "upcoming" | "completed" | "cancelled";

export function useClientBookings(filter: BookingFilter = "upcoming") {
  const { customers, isAuthenticated } = useClientAuth();
  const [bookings, setBookings] = useState<ClientAppointmentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const customerIds = customers.map((c) => c.id);

  const fetchBookings = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setBookings([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("appointments")
        .select(`
          *,
          services:appointment_services(*),
          tenant:tenants(*),
          location:locations(*)
        `)
        .in("customer_id", customerIds)
        .order("scheduled_start", { ascending: filter === "upcoming" });

      // Apply filter based on tab
      if (filter === "upcoming") {
        // Upcoming = scheduled, started, paused (not yet completed/cancelled)
        query = query.in("status", ["scheduled", "started", "paused"]);
      } else if (filter === "completed") {
        query = query.eq("status", "completed");
      } else if (filter === "cancelled") {
        query = query.eq("status", "cancelled");
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setBookings((data as ClientAppointmentWithDetails[]) || []);
    } catch (err) {
      console.error("Error fetching client bookings:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, customerIds.join(","), filter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Get next upcoming appointment
  const nextAppointment = bookings.find(
    (b) => b.status === "scheduled" && b.scheduled_start && new Date(b.scheduled_start) > new Date()
  );

  return {
    bookings,
    nextAppointment,
    isLoading,
    error,
    refetch: fetchBookings,
  };
}

export function useClientBookingActions() {
  const { customers } = useClientAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerIds = customers.map((c) => c.id);

  // Customer can update their own appointments (via RLS policy)
  const cancelBooking = async (appointmentId: string, reason: string) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({
          status: "cancelled" as AppointmentStatus,
          cancellation_reason: reason,
        })
        .eq("id", appointmentId)
        .in("customer_id", customerIds);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Error cancelling booking:", err);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    cancelBooking,
  };
}
