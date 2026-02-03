import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  slotDurationMinutes: number = 30
) {
  return useQuery({
    queryKey: ["available-slots", tenantId, location?.id, date?.toISOString(), slotCapacity],
    queryFn: async (): Promise<SlotInfo[]> => {
      if (!tenantId || !location || !date) return [];

      const dayOfWeek = format(date, "EEEE").toLowerCase();
      
      // Check if location is open on this day
      if (!location.opening_days.includes(dayOfWeek)) {
        return [];
      }

      // Get opening and closing times
      const openingTime = location.opening_time || "09:00";
      const closingTime = location.closing_time || "18:00";

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
        console.error("Error fetching appointments:", error);
        throw error;
      }

      // Generate time slots
      const slots: SlotInfo[] = [];
      let currentSlot = openingDateTime;

      while (isBefore(currentSlot, closingDateTime)) {
        const slotTime = format(currentSlot, "HH:mm");
        const slotStart = currentSlot;
        const slotEnd = addMinutes(currentSlot, slotDurationMinutes);

        // Count bookings that overlap with this slot
        const bookedCount = (appointments || []).filter((apt) => {
          if (!apt.scheduled_start) return false;
          const aptStart = new Date(apt.scheduled_start);
          const aptEnd = apt.scheduled_end ? new Date(apt.scheduled_end) : addMinutes(aptStart, 60);
          
          // Check for overlap
          return isBefore(aptStart, slotEnd) && isAfter(aptEnd, slotStart);
        }).length;

        slots.push({
          time: slotTime,
          available: bookedCount < slotCapacity,
          bookedCount,
        });

        currentSlot = addMinutes(currentSlot, slotDurationMinutes);
      }

      return slots;
    },
    enabled: !!tenantId && !!location && !!date,
  });
}
