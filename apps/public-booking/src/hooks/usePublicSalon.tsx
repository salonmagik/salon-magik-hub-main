import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/supabase";
import { getCountryByCode } from "@shared/countries";

export type PublicTenant = Pick<
  Tables<"tenants">,
  | "id"
  | "name"
  | "slug"
  | "logo_url"
  | "banner_urls"
  | "currency"
  | "country"
  | "timezone"
  | "online_booking_enabled"
  | "deposits_enabled"
  | "default_deposit_percentage"
  | "cancellation_grace_hours"
  | "booking_status_message"
  | "slot_capacity_default"
  | "pay_at_salon_enabled"
  | "allow_staff_selection"
  | "require_staff_selection"
  | "auto_assign_staff"
> & {
  brand_color?: string | null;
  contact_phone?: string | null;
  show_contact_on_booking?: boolean;
  auto_confirm_bookings?: boolean;
};

export type PublicLocation = Pick<
  Tables<"locations">,
  | "id"
  | "name"
  | "city"
  | "country"
  | "address"
  | "opening_time"
  | "closing_time"
  | "opening_days"
  | "availability"
>;

export function usePublicSalon(slug: string | undefined, countryCode?: string | null) {
  const tenantQuery = useQuery({
    queryKey: ["public-tenant", slug],
    queryFn: async (): Promise<PublicTenant | null> => {
      if (!slug) return null;

      // Use the secure view that only exposes safe columns
      const { data, error } = await supabase
        .from("public_booking_tenants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        console.error("Error fetching tenant:", error);
        throw error;
      }

      return data as unknown as PublicTenant | null;
    },
    enabled: !!slug,
  });

  const locationsQuery = useQuery({
    queryKey: ["public-locations", tenantQuery.data?.id, countryCode ?? null],
    queryFn: async (): Promise<PublicLocation[]> => {
      if (!tenantQuery.data?.id) return [];

      const query = supabase
        .from("locations")
        .select("id, name, city, country, address, opening_time, closing_time, opening_days, availability")
        .eq("tenant_id", tenantQuery.data.id)
        .eq("availability", "open");

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching locations:", error);
        throw error;
      }

      const locations = data || [];

      if (!countryCode) {
        return locations;
      }

      const normalizedCode = countryCode.trim().toUpperCase();
      const countryName = getCountryByCode(normalizedCode)?.name?.toUpperCase() ?? null;

      return locations.filter((location) => {
        const normalizedLocationCountry = (location.country || "").trim().toUpperCase();
        return (
          normalizedLocationCountry === normalizedCode ||
          (countryName !== null && normalizedLocationCountry === countryName)
        );
      });
    },
    enabled: !!tenantQuery.data?.id,
  });

  return {
    salon: tenantQuery.data,
    locations: locationsQuery.data || [],
    isLoading: tenantQuery.isLoading || locationsQuery.isLoading,
    error: tenantQuery.error || locationsQuery.error,
    notFound: !tenantQuery.isLoading && !tenantQuery.data,
  };
}
