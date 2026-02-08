import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format, parse, addMinutes, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import type { PublicLocation } from "./usePublicSalon";

interface SlotInfo {
  time: string;
  available: boolean;
  bookedCount: number;
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
  return useQuery({
    queryKey: ["available-slots", tenantId, location?.id, date ? format(date, "yyyy-MM-dd") : undefined, slotCapacity, serviceDurationMinutes],
    queryFn: async (): Promise<SlotInfo[]> => {
      if (!tenantId || !location || !date) return [];

      const dayOfWeek = format(date, "EEEE").toLowerCase();
      
      // Check if location is open on this day
      if (!location.opening_days.includes(dayOfWeek)) {
        return [];
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

      // Fetch existing appointments for this date at this location
      const dayStart = startOfDay(date).toISOString();
      const dayEnd = endOfDay(date).toISOString();

      const { data: appointments, error } = await supabase
        .from("appointments")
        .select("scheduled_start, scheduled_end, status")
        .eq("tenant_id", tenantId)
        .eq("location_id", location.id)
        .gte("scheduled_start", dayStart)
        .lte("scheduled_start", dayEnd)
        .in("status", ["scheduled", "started", "paused"]);

      if (error) {
        console.error("Error fetching appointments for slots:", error);
        // Don't throw - return all slots as available if we can't fetch appointments
        // This provides better UX than showing "no times available"
      }

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

        // Count bookings that overlap with this slot
        const bookedCount = (appointments || []).filter((apt) => {
          if (!apt.scheduled_start) return false;
          const aptStart = new Date(apt.scheduled_start);
          const aptEnd = apt.scheduled_end ? new Date(apt.scheduled_end) : addMinutes(aptStart, 60);
          
          // Check for overlap including buffer
          const aptEndWithBuffer = addMinutes(aptEnd, bufferMinutes);
          return isBefore(aptStart, slotEnd) && isAfter(aptEndWithBuffer, slotStart);
        }).length;

        slots.push({
          time: slotTime,
          available: bookedCount < slotCapacity && !exceedsClosing,
          bookedCount,
        });

        currentSlot = addMinutes(currentSlot, slotDurationMinutes);
      }

      return slots;
    },
    enabled: !!tenantId && !!location && !!date,
  });
}
