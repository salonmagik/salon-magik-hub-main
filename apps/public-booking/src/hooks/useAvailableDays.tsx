import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  startOfDay, 
  endOfDay,
  isBefore,
  isAfter,
  addMinutes,
  parse
} from "date-fns";
import type { PublicLocation } from "./usePublicSalon";

interface DayAvailability {
  date: Date;
  available: boolean;
  hasSlots: boolean;
}

interface UnavailabilityWindow {
  starts_at: string;
  ends_at: string | null;
  ended_at: string | null;
}

export function useAvailableDays(
  tenantId: string | undefined,
  location: PublicLocation | undefined,
  month: Date | undefined,
  slotCapacity: number = 1,
  serviceDurationMinutes: number = 0,
  bufferMinutes: number = 0
) {
  return useQuery({
    queryKey: ["available-days", tenantId, location?.id, month ? format(month, "yyyy-MM") : undefined, slotCapacity, serviceDurationMinutes],
    queryFn: async (): Promise<DayAvailability[]> => {
      if (!tenantId || !location || !month) return [];

      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const today = startOfDay(new Date());

      // Get all days in the month
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const [appointmentsResult, windowsResult] = await Promise.all([
        supabase
        .from("appointments")
        .select("scheduled_start, scheduled_end, status")
        .eq("tenant_id", tenantId)
        .eq("location_id", location.id)
        .gte("scheduled_start", monthStart.toISOString())
        .lte("scheduled_start", monthEnd.toISOString())
          .in("status", ["scheduled", "started", "paused"]),
        (supabase as any)
          .from("branch_unavailability_windows")
          .select("starts_at, ends_at, ended_at")
          .eq("tenant_id", tenantId)
          .eq("location_id", location.id)
          .is("ended_at", null)
          .lte("starts_at", monthEnd.toISOString())
          .or(`ends_at.is.null,ends_at.gte.${monthStart.toISOString()}`),
      ]);

      if (appointmentsResult.error) {
        console.error("Error fetching appointments:", appointmentsResult.error);
        throw appointmentsResult.error;
      }

      const appointments = appointmentsResult.data || [];
      const windows = (windowsResult.data || []) as UnavailabilityWindow[];

      // Calculate availability for each day
      const availability: DayAvailability[] = daysInMonth.map((date) => {
        // Past dates are unavailable
        if (isBefore(date, today)) {
          return { date, available: false, hasSlots: false };
        }

        const dayOfWeek = format(date, "EEEE").toLowerCase();
        
        // Check if location is open on this day
        if (!location.opening_days.includes(dayOfWeek)) {
          return { date, available: false, hasSlots: false };
        }

        // Get opening and closing times - handle time format with seconds (HH:mm:ss)
        const rawOpeningTime = location.opening_time || "09:00:00";
        const rawClosingTime = location.closing_time || "18:00:00";
        // Extract HH:mm from potential HH:mm:ss format
        const openingTime = rawOpeningTime.substring(0, 5);
        const closingTime = rawClosingTime.substring(0, 5);

        // Parse times
        const baseDate = format(date, "yyyy-MM-dd");
        const openingDateTime = parse(`${baseDate} ${openingTime}`, "yyyy-MM-dd HH:mm", new Date());
        const closingDateTime = parse(`${baseDate} ${closingTime}`, "yyyy-MM-dd HH:mm", new Date());

        const dayStart = startOfDay(date).toISOString();
        const dayEnd = endOfDay(date).toISOString();
        // Filter appointments for this specific day
        const dayAppointments = appointments.filter((apt) => {
          if (!apt.scheduled_start) return false;
          const aptDate = new Date(apt.scheduled_start);
          return aptDate >= startOfDay(date) && aptDate <= endOfDay(date);
        });

        // Calculate slots and check if at least one is available
        const slotDurationMinutes = 30;
        const effectiveDuration = serviceDurationMinutes > 0 ? serviceDurationMinutes : slotDurationMinutes;
        const totalBookingDuration = effectiveDuration + bufferMinutes;

        let hasAvailableSlot = false;
        let currentSlot = openingDateTime;

        while (isBefore(currentSlot, closingDateTime) && !hasAvailableSlot) {
          const slotStart = currentSlot;
          const slotEnd = addMinutes(currentSlot, slotDurationMinutes);
          const bookingEndTime = addMinutes(currentSlot, totalBookingDuration);
          const exceedsClosing = isAfter(bookingEndTime, closingDateTime);
          const slotIsBlocked = windows.some((window) => {
            const windowStart = new Date(window.starts_at);
            const windowEnd = window.ends_at ? new Date(window.ends_at) : null;
            if (!windowEnd) return windowStart < slotEnd;
            return windowStart < slotEnd && windowEnd > slotStart;
          });

          // Count bookings that overlap with this slot
          const bookedCount = dayAppointments.filter((apt) => {
            if (!apt.scheduled_start) return false;
            const aptStart = new Date(apt.scheduled_start);
            const aptEnd = apt.scheduled_end ? new Date(apt.scheduled_end) : addMinutes(aptStart, 60);
            const aptEndWithBuffer = addMinutes(aptEnd, bufferMinutes);
            return isBefore(aptStart, slotEnd) && isAfter(aptEndWithBuffer, slotStart);
          }).length;

          if (!slotIsBlocked && bookedCount < slotCapacity && !exceedsClosing) {
            hasAvailableSlot = true;
          }

          currentSlot = addMinutes(currentSlot, slotDurationMinutes);
        }

        return { date, available: hasAvailableSlot, hasSlots: hasAvailableSlot };
      });

      return availability;
    },
    enabled: !!tenantId && !!location && !!month,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
