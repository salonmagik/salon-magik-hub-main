import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/supabase";
import { COUNTRIES, getCountryByCode } from "@shared/countries";

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

export type PublicCatalogMode = "legacy" | "chain_country_scoped";

const EMPTY_LOCATIONS: PublicLocation[] = [];

export function usePublicSalon(
  slug: string | undefined,
  countryCode?: string | null,
  mode: PublicCatalogMode = "legacy",
) {
  const normalizeCountryKey = (value: string | null | undefined): string =>
    (value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "");

  const getCountryCodeForLocationCountry = (value: string | null | undefined): string | null => {
    const normalized = normalizeCountryKey(value);
    if (!normalized) return null;

    if (normalized.length === 2 && getCountryByCode(normalized)) {
      return normalized;
    }

    const byName = COUNTRIES.find((country) => normalizeCountryKey(country.name) === normalized);
    return byName?.code ?? null;
  };

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
    queryKey: ["public-locations", tenantQuery.data?.id, countryCode ?? null, mode],
    queryFn: async (): Promise<PublicLocation[]> => {
      if (!tenantQuery.data?.id) return [];

      const query = supabase
        .from("locations")
        .select("id, name, city, country, address, opening_time, closing_time, opening_days, availability")
        .eq("tenant_id", tenantQuery.data.id)
        .or("availability.is.null,availability.eq.open");

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching locations:", error);
        throw error;
      }

      const locations = data || [];

      if (mode !== "chain_country_scoped" || !countryCode) {
        return locations;
      }

      const normalizedCode = countryCode.trim().toUpperCase();

      return locations.filter((location) => {
        const locationCountryCode = getCountryCodeForLocationCountry(location.country);
        return locationCountryCode === normalizedCode;
      });
    },
    enabled: !!tenantQuery.data?.id,
  });

  return {
    salon: tenantQuery.data,
    locations: locationsQuery.data || EMPTY_LOCATIONS,
    isLoading: tenantQuery.isLoading || locationsQuery.isLoading,
    error: tenantQuery.error || locationsQuery.error,
    notFound: !tenantQuery.isLoading && !tenantQuery.data,
  };
}
