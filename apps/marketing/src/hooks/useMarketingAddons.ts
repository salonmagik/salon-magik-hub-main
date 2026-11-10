import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

export type MarketingAddonStatus = "available" | "coming_soon" | "hidden";

export interface MarketingAddon {
  key: string;
  name: string;
  description: string;
  status: MarketingAddonStatus;
}

export const DEFAULT_MARKETING_ADDONS: MarketingAddon[] = [
  {
    key: "extra_communication_credits",
    name: "Extra communication credits",
    description: "Top up SMS credits when your complimentary monthly allowance runs low.",
    status: "available",
  },
  {
    key: "staff_operations",
    name: "Staff Operations",
    description: "Track when your staff arrive, time off, and leave requests.",
    status: "available",
  },
  {
    key: "ecommerce_themes",
    name: "E-commerce themes",
    description: "Give your booking page a polished storefront-style look with a paid theme.",
    status: "available",
  },
  {
    key: "whatsapp_messaging",
    name: "WhatsApp messaging",
    description: "Send booking confirmations, reminders, and updates directly via WhatsApp.",
    status: "coming_soon",
  },
  {
    key: "custom_booking_domain",
    name: "Custom booking domain",
    description: "Use your own domain for your client-facing booking page.",
    status: "coming_soon",
  },
];

export function useMarketingAddons() {
  return useQuery({
    queryKey: ["marketing-addons"],
    queryFn: async (): Promise<MarketingAddon[]> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "marketing_addons")
        .maybeSingle();

      if (error) throw error;

      const raw = (data?.value as { addons?: unknown } | null)?.addons;
      if (!Array.isArray(raw)) return DEFAULT_MARKETING_ADDONS;

      const parsed = raw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const status = row.status;
        if (
          typeof row.key !== "string" ||
          typeof row.name !== "string" ||
          typeof row.description !== "string" ||
          (status !== "available" && status !== "coming_soon" && status !== "hidden")
        ) {
          return [];
        }
        return [{
          key: row.key,
          name: row.name,
          description: row.description,
          status,
        } satisfies MarketingAddon];
      });

      return parsed.length > 0 ? parsed : DEFAULT_MARKETING_ADDONS;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export interface MarketingAddonPrices {
  staffOperations: number | null;
  ecommerceThemes: number | null;
}

export function useMarketingAddonPrices(currency: string) {
  const normalizedCurrency = (currency || "GHS").toUpperCase();
  return useQuery({
    queryKey: ["marketing-addon-prices", normalizedCurrency],
    queryFn: async (): Promise<MarketingAddonPrices> => {
      const [staffOperations, ecommerceThemes] = await Promise.all([
        (supabase.from as any)("staff_operations_addon_pricing")
          .select("unit_price_per_location")
          .eq("currency", normalizedCurrency)
          .eq("status", "active")
          .lte("effective_from", new Date().toISOString())
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase.from as any)("theme_addon_pricing")
          .select("unit_price")
          .eq("currency", normalizedCurrency)
          .eq("status", "active")
          .lte("effective_from", new Date().toISOString())
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        staffOperations: staffOperations.data?.unit_price_per_location == null
          ? null
          : Number(staffOperations.data.unit_price_per_location),
        ecommerceThemes: ecommerceThemes.data?.unit_price == null
          ? null
          : Number(ecommerceThemes.data.unit_price),
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}
