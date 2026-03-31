import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format, parse, addMinutes, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import type { PublicLocation } from "./usePublicSalon";

interface SlotInfo {
  time: string;
  available: boolean;
  bookedCount: number;
}

interface UnavailabilityWindow {
  starts_at: string;
  ends_at: string | null;
  ended_at: string | null;
}

export function useAvailableSlots(
  tenantId: string | undefined,
  location: PublicLocation | undefined,
  date: Date | undefined,
  slotCapacity: number = 1,
  slotDurationMinutes: number = 30,
  serviceDurationMinutes: number = 0,
  bufferMinutes: number = 0
) {
  const formattedDate = date ? format(date, "yyyy-MM-dd") : undefined;
  const isEnabled = !!tenantId && !!location && !!date;

  console.log("[public-booking] useAvailableSlots state", {
    tenantId: tenantId ?? null,
    locationId: location?.id ?? null,
    date: formattedDate ?? null,
    slotCapacity,
    slotDurationMinutes,
    serviceDurationMinutes,
    bufferMinutes,
    enabled: isEnabled,
  });

  return useQuery({
    queryKey: [
      "available-slots",
      tenantId,
      location?.id,
      formattedDate,
      slotCapacity,
      slotDurationMinutes,
      serviceDurationMinutes,
      bufferMinutes,
    ],
    queryFn: async (): Promise<SlotInfo[]> => {
      if (!tenantId || !location || !date) return [];

      console.log("[public-booking] Fetching available slots", {
        tenantId,
        locationId: location.id,
        date: formattedDate,
      });

      const baseDate = format(date, "yyyy-MM-dd");
      const dayOfWeek = format(date, "EEEE").toLowerCase();
      
      // Check if location is open on this day
      if (!location.opening_days.includes(dayOfWeek)) {
        console.debug("[public-booking] No slots: location is closed on selected day", {
          tenantId,
          locationId: location.id,
          date: baseDate,
          dayOfWeek,
          openingDays: location.opening_days,
        });
        return [];
      }

      // Get opening and closing times - handle time format with seconds (HH:mm:ss)
      const rawOpeningTime = location.opening_time || "09:00:00";
      const rawClosingTime = location.closing_time || "18:00:00";
      // Extract HH:mm from potential HH:mm:ss format
      const openingTime = rawOpeningTime.substring(0, 5);
      const closingTime = rawClosingTime.substring(0, 5);

      // Parse times
      const openingDateTime = parse(`${baseDate} ${openingTime}`, "yyyy-MM-dd HH:mm", new Date());
      const closingDateTime = parse(`${baseDate} ${closingTime}`, "yyyy-MM-dd HH:mm", new Date());

      // Fetch existing appointments for this date at this location
      const dayStart = startOfDay(date).toISOString();
      const dayEnd = endOfDay(date).toISOString();

      const [appointmentsResult, windowsResult] = await Promise.all([
        supabase
          .from("appointments")
          .select("scheduled_start, scheduled_end, status")
          .eq("tenant_id", tenantId)
          .eq("location_id", location.id)
          .gte("scheduled_start", dayStart)
          .lte("scheduled_start", dayEnd)
          .in("status", ["scheduled", "started", "paused"]),
        (supabase as any)
          .from("branch_unavailability_windows")
          .select("starts_at, ends_at, ended_at")
          .eq("tenant_id", tenantId)
          .eq("location_id", location.id)
          .is("ended_at", null)
          .lte("starts_at", dayEnd)
          .or(`ends_at.is.null,ends_at.gte.${dayStart}`),
      ]);

      if (appointmentsResult.error) {
        console.error("Error fetching appointments for slots:", appointmentsResult.error);
        // Don't throw - return all slots as available if we can't fetch appointments
        // This provides better UX than showing "no times available"
      }
      if (windowsResult.error) {
        console.error("Error fetching branch unavailability windows:", windowsResult.error);
      }
      const appointments = appointmentsResult.data || [];
      const windows = (windowsResult.data || []) as UnavailabilityWindow[];

      // Calculate effective service duration (use provided or default to slot duration)
      const effectiveDuration = serviceDurationMinutes > 0 ? serviceDurationMinutes : slotDurationMinutes;
      const totalBookingDuration = effectiveDuration + bufferMinutes;

      // Generate time slots
      const slots: SlotInfo[] = [];
      let currentSlot = openingDateTime;

      while (isBefore(currentSlot, closingDateTime)) {
        const slotTime = format(currentSlot, "HH:mm");
        const slotStart = currentSlot;
        const slotEnd = addMinutes(currentSlot, slotDurationMinutes);

        // Check if booking would extend past closing time
        const bookingEndTime = addMinutes(currentSlot, totalBookingDuration);
        const exceedsClosing = isAfter(bookingEndTime, closingDateTime);

        const slotIsBlocked = windows.some((window) => {
          const windowStart = new Date(window.starts_at);
          const windowEnd = window.ends_at ? new Date(window.ends_at) : null;
          if (!windowEnd) {
            return windowStart < slotEnd;
          }
          return windowStart < slotEnd && windowEnd > slotStart;
        });

        // Count bookings that overlap with this slot
        const bookedCount = appointments.filter((apt) => {
          if (!apt.scheduled_start) return false;
          const aptStart = new Date(apt.scheduled_start);
          const aptEnd = apt.scheduled_end ? new Date(apt.scheduled_end) : addMinutes(aptStart, 60);
          
          // Check for overlap including buffer
          const aptEndWithBuffer = addMinutes(aptEnd, bufferMinutes);
          return isBefore(aptStart, slotEnd) && isAfter(aptEndWithBuffer, slotStart);
        }).length;

        slots.push({
          time: slotTime,
          available: !slotIsBlocked && bookedCount < slotCapacity && !exceedsClosing,
          bookedCount,
        });

        currentSlot = addMinutes(currentSlot, slotDurationMinutes);
      }

      const availableCount = slots.filter((slot) => slot.available).length;
      if (availableCount === 0) {
        console.debug("[public-booking] No selectable times for date", {
          tenantId,
          locationId: location.id,
          date: baseDate,
          openingTime,
          closingTime,
          slotCapacity,
          slotDurationMinutes,
          serviceDurationMinutes,
          bufferMinutes,
          totalBookingDuration,
          appointmentCount: appointments.length,
          activeWindowCount: windows.length,
          blockedByClosing: slots.filter((slot) => {
            const slotStart = parse(`${baseDate} ${slot.time}`, "yyyy-MM-dd HH:mm", new Date());
            const bookingEndTime = addMinutes(slotStart, totalBookingDuration);
            return isAfter(bookingEndTime, closingDateTime);
          }).map((slot) => slot.time),
          blockedByCapacity: slots.filter((slot) => slot.bookedCount >= slotCapacity).map((slot) => ({
            time: slot.time,
            bookedCount: slot.bookedCount,
          })),
          blockedByBranchWindow: slots.filter((slot) => {
            const slotStart = parse(`${baseDate} ${slot.time}`, "yyyy-MM-dd HH:mm", new Date());
            const slotEnd = addMinutes(slotStart, slotDurationMinutes);
            return windows.some((window) => {
              const windowStart = new Date(window.starts_at);
              const windowEnd = window.ends_at ? new Date(window.ends_at) : null;
              if (!windowEnd) {
                return windowStart < slotEnd;
              }
              return windowStart < slotEnd && windowEnd > slotStart;
            });
          }).map((slot) => slot.time),
        });
      }

      return slots;
    },
    enabled: isEnabled,
  });
}
