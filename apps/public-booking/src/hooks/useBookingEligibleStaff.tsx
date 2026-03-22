import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface BookingEligibleStaff {
  userId: string;
  fullName: string;
  role: "manager" | "supervisor" | "staff" | string;
}

interface UseBookingEligibleStaffArgs {
  tenantId: string | undefined;
  locationId: string | undefined;
  serviceIds: string[];
  enabled?: boolean;
}

export function useBookingEligibleStaff({
  tenantId,
  locationId,
  serviceIds,
  enabled = true,
}: UseBookingEligibleStaffArgs) {
  return useQuery({
    queryKey: ["booking-eligible-staff", tenantId, locationId, serviceIds],
    enabled: Boolean(enabled && tenantId && locationId),
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<BookingEligibleStaff[]> => {
      if (!tenantId || !locationId) return [];

      const { data, error } = await (supabase.rpc as any)("list_public_booking_eligible_staff", {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_service_ids: serviceIds.length > 0 ? serviceIds : null,
      });

      if (error) throw error;

      return ((data || []) as any[]).map((row) => ({
        userId: row.user_id,
        fullName: row.full_name,
        role: row.role,
      }));
    },
  });
}
