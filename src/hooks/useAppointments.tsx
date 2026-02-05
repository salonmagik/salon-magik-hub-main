import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables, TablesInsert, Enums } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";

type Appointment = Tables<"appointments">;
type AppointmentService = Tables<"appointment_services">;
type Customer = Tables<"customers">;
type AppointmentStatus = Enums<"appointment_status">;

export interface AppointmentWithDetails extends Appointment {
  customer: Customer | null;
  services: AppointmentService[];
  staff_name?: string;
}

interface UseAppointmentsOptions {
  date?: string;
  status?: AppointmentStatus | "all";
  locationId?: string;
  isUnscheduled?: boolean;
  isGifted?: boolean;
  filterByBookingDate?: boolean; // Use created_at instead of scheduled_start
}

export function useAppointments(options: UseAppointmentsOptions = {}) {
  const { currentTenant } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!currentTenant?.id) {
      setAppointments([]);
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
          customer:customers(*),
          services:appointment_services(*)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("scheduled_start", { ascending: true });

      // Apply date filter
      if (options.date) {
        const startOfDay = `${options.date}T00:00:00`;
        const endOfDay = `${options.date}T23:59:59`;
        
        if (options.filterByBookingDate) {
          // Use created_at for unscheduled (booking date)
          query = query
            .gte("created_at", startOfDay)
            .lte("created_at", endOfDay);
        } else {
          // Use scheduled_start for scheduled
          query = query
            .gte("scheduled_start", startOfDay)
            .lte("scheduled_start", endOfDay);
        }
      }

      // Apply status filter
      if (options.status && options.status !== "all") {
        query = query.eq("status", options.status);
      }

      // Apply location filter
      if (options.locationId) {
        query = query.eq("location_id", options.locationId);
      }

      // Apply unscheduled filter
      if (options.isUnscheduled !== undefined) {
        query = query.eq("is_unscheduled", options.isUnscheduled);
      }

      // Apply gifted filter
      if (options.isGifted !== undefined) {
        query = query.eq("is_gifted", options.isGifted);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setAppointments((data as AppointmentWithDetails[]) || []);
    } catch (err) {
      console.error("Error fetching appointments:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, options.date, options.status, options.locationId, options.isUnscheduled, options.isGifted, options.filterByBookingDate]);

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

export function useAppointmentActions() {
  const { currentTenant, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper function to send appointment notification email
  const sendAppointmentNotification = async (
    appointmentId: string,
    action: "scheduled" | "completed" | "cancelled" | "rescheduled",
    additionalData?: { reason?: string; newDate?: string; newTime?: string }
  ) => {
    try {
      await supabase.functions.invoke("send-appointment-notification", {
        body: { appointmentId, action, ...additionalData },
      });
    } catch (error) {
      console.error("Failed to send appointment notification:", error);
      // Don't fail the main action - email is fire-and-forget
    }
  };

  const createAppointment = async (data: {
    customerId: string;
    services: { serviceId: string; serviceName: string; price: number; duration: number }[];
    scheduledStart?: string;
    scheduledEnd?: string;
    locationId: string;
    staffId?: string;
    notes?: string;
    isWalkIn?: boolean;
    isUnscheduled?: boolean;
    attachments?: { id: string; fileName: string; fileType: string; dataUrl: string; isDrawing: boolean }[];
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    setIsSubmitting(true);
    try {
      const totalAmount = data.services.reduce((sum, s) => sum + s.price, 0);
      const isWalkIn = data.isWalkIn || false;
      
      // For walk-ins: if no scheduledStart provided, start immediately (unscheduled)
      // If scheduledStart provided (buffer time), schedule for that time
      const hasScheduledStart = !!data.scheduledStart;
      const isUnscheduled = data.isUnscheduled !== undefined 
        ? data.isUnscheduled 
        : (isWalkIn && !hasScheduledStart);
      
      const now = new Date().toISOString();
      
      // Calculate total duration for scheduled_end
      const totalDuration = data.services.reduce((sum, s) => sum + s.duration, 0);
      
      let scheduledStart: string | null = null;
      let scheduledEnd: string | null = null;
      
      if (hasScheduledStart) {
        // Use provided scheduled start (e.g., walk-in with buffer)
        scheduledStart = data.scheduledStart!;
        const endTime = new Date(new Date(scheduledStart).getTime() + totalDuration * 60 * 1000);
        scheduledEnd = data.scheduledEnd || endTime.toISOString();
      } else if (!isUnscheduled) {
        // Regular scheduled appointment
        scheduledStart = data.scheduledStart || now;
        scheduledEnd = data.scheduledEnd || now;
      }
      // If unscheduled (immediate walk-in), both remain null

      // Create appointment
      const { data: appointment, error: aptError } = await supabase
        .from("appointments")
        .insert({
          tenant_id: currentTenant.id,
          customer_id: data.customerId,
          location_id: data.locationId,
          assigned_staff_id: data.staffId || null,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          notes: data.notes || null,
          is_walk_in: isWalkIn,
          is_unscheduled: isUnscheduled,
          status: isUnscheduled ? "started" : "scheduled",
          actual_start: isUnscheduled ? now : null,
          total_amount: totalAmount,
          created_by_id: user?.id || null,
        })
        .select()
        .single();

      if (aptError) throw aptError;

      // Create appointment services
      const servicesToInsert = data.services.map((s) => ({
        appointment_id: appointment.id,
        service_id: s.serviceId,
        service_name: s.serviceName,
        price: s.price,
        duration_minutes: s.duration,
        status: "scheduled" as AppointmentStatus,
      }));

      const { error: servicesError } = await supabase
        .from("appointment_services")
        .insert(servicesToInsert);

      if (servicesError) throw servicesError;

      // Upload and save attachments if provided
      if (data.attachments && data.attachments.length > 0) {
        for (const attachment of data.attachments) {
          try {
            // Convert data URL to Blob
            const response = await fetch(attachment.dataUrl);
            const blob = await response.blob();
            
            // Generate unique file path
            const fileExt = attachment.fileName.split('.').pop() || 'png';
            const filePath = `${currentTenant.id}/${appointment.id}/${crypto.randomUUID()}.${fileExt}`;
            
            // Upload to storage
            const { error: uploadError } = await supabase.storage
              .from("appointment-attachments")
              .upload(filePath, blob, {
                contentType: attachment.fileType,
                upsert: false,
              });
            
            if (uploadError) {
              console.error("Failed to upload attachment:", uploadError);
              continue;
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage
              .from("appointment-attachments")
              .getPublicUrl(filePath);
            
            // Save attachment record
            await supabase
              .from("appointment_attachments")
              .insert({
                tenant_id: currentTenant.id,
                appointment_id: appointment.id,
                file_name: attachment.fileName,
                file_type: attachment.fileType,
                file_url: urlData.publicUrl,
                is_drawing: attachment.isDrawing,
                created_by_id: user?.id || null,
              });
          } catch (attachErr) {
            console.error("Error saving attachment:", attachErr);
            // Continue with other attachments
          }
        }
      }

      toast({ title: "Success", description: "Appointment created successfully" });
      
      // Send confirmation email (fire-and-forget)
      sendAppointmentNotification(appointment.id, "scheduled");
      
      return appointment;
    } catch (err) {
      console.error("Error creating appointment:", err);
      toast({ title: "Error", description: "Failed to create appointment", variant: "destructive" });
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (
    appointmentId: string,
    newStatus: AppointmentStatus,
    additionalData?: Partial<TablesInsert<"appointments">>
  ) => {
    if (!currentTenant?.id) return false;

    setIsSubmitting(true);
    try {
      const updateData: Record<string, unknown> = { status: newStatus, ...additionalData };

      // Set actual_start when starting
      if (newStatus === "started") {
        updateData.actual_start = new Date().toISOString();
      }

      // Set actual_end when completing
      if (newStatus === "completed") {
        updateData.actual_end = new Date().toISOString();
      }

      const { error } = await supabase
        .from("appointments")
        .update(updateData)
        .eq("id", appointmentId)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({ 
        title: "Success", 
        description: `Appointment ${newStatus === "started" ? "started" : newStatus === "completed" ? "completed" : newStatus === "cancelled" ? "cancelled" : "updated"}` 
      });
      return true;
    } catch (err) {
      console.error("Error updating appointment status:", err);
      toast({ title: "Error", description: "Failed to update appointment", variant: "destructive" });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAppointment = (appointmentId: string) => 
    updateStatus(appointmentId, "started");

  const pauseAppointment = async (appointmentId: string, reason: string) => {
    if (!currentTenant?.id) return false;

    setIsSubmitting(true);
    try {
      // Update appointment status
      const { error: aptError } = await supabase
        .from("appointments")
        .update({ 
          status: "paused",
          pause_count: supabase.rpc ? undefined : 1, // Increment handled separately if needed
        })
        .eq("id", appointmentId)
        .eq("tenant_id", currentTenant.id);

      if (aptError) throw aptError;

      // Create pause record
      const { error: pauseError } = await supabase
        .from("appointment_pauses")
        .insert({
          appointment_id: appointmentId,
          reason,
          created_by_id: user?.id || null,
        });

      if (pauseError) throw pauseError;

      toast({ title: "Paused", description: "Appointment has been paused" });
      return true;
    } catch (err) {
      console.error("Error pausing appointment:", err);
      toast({ title: "Error", description: "Failed to pause appointment", variant: "destructive" });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const resumeAppointment = async (appointmentId: string) => {
    if (!currentTenant?.id) return false;

    setIsSubmitting(true);
    try {
      // Update appointment status
      const { error: aptError } = await supabase
        .from("appointments")
        .update({ status: "started" })
        .eq("id", appointmentId)
        .eq("tenant_id", currentTenant.id);

      if (aptError) throw aptError;

      // Update pause record
      const { error: pauseError } = await supabase
        .from("appointment_pauses")
        .update({ resumed_at: new Date().toISOString() })
        .eq("appointment_id", appointmentId)
        .is("resumed_at", null);

      if (pauseError) throw pauseError;

      toast({ title: "Resumed", description: "Appointment has been resumed" });
      return true;
    } catch (err) {
      console.error("Error resuming appointment:", err);
      toast({ title: "Error", description: "Failed to resume appointment", variant: "destructive" });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeAppointment = async (appointmentId: string) => {
    const success = await updateStatus(appointmentId, "completed");
    if (success) {
      // Send completion email (fire-and-forget)
      sendAppointmentNotification(appointmentId, "completed");
    }
    return success;
  };

  const cancelAppointment = async (appointmentId: string, reason: string) => {
    const success = await updateStatus(appointmentId, "cancelled", { cancellation_reason: reason });
    if (success) {
      // Send cancellation email (fire-and-forget)
      sendAppointmentNotification(appointmentId, "cancelled", { reason });
    }
    return success;
  };

  const rescheduleAppointment = async (
    appointmentId: string, 
    newStart: string, 
    newEnd: string
  ) => {
    if (!currentTenant?.id) return false;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ 
          scheduled_start: newStart,
          scheduled_end: newEnd,
          status: "scheduled",
          reschedule_count: supabase.rpc ? undefined : 1,
        })
        .eq("id", appointmentId)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({ title: "Rescheduled", description: "Appointment has been rescheduled" });
      
      // Send reschedule email with new date/time
      const newDate = new Date(newStart).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const newTime = new Date(newStart).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      sendAppointmentNotification(appointmentId, "rescheduled", { newDate, newTime });
      
      return true;
    } catch (err) {
      console.error("Error rescheduling appointment:", err);
      toast({ title: "Error", description: "Failed to reschedule appointment", variant: "destructive" });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendReminder = async (appointmentId: string) => {
    if (!currentTenant?.id) return false;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("send-appointment-notification", {
        body: { appointmentId, action: "reminder" },
      });

      if (error) throw error;

      toast({ title: "Reminder Sent", description: "Customer has been notified" });
      return true;
    } catch (err) {
      console.error("Error sending reminder:", err);
      toast({ title: "Error", description: "Failed to send reminder", variant: "destructive" });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    createAppointment,
    startAppointment,
    pauseAppointment,
    resumeAppointment,
    completeAppointment,
    cancelAppointment,
    rescheduleAppointment,
    sendReminder,
  };
}
