import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PublicService = Pick<
  Tables<"services">,
  | "id"
  | "name"
  | "description"
  | "price"
  | "duration_minutes"
  | "image_urls"
  | "category_id"
  | "deposit_required"
  | "deposit_amount"
  | "deposit_percentage"
>;

export type PublicPackage = Pick<
  Tables<"packages">,
  "id" | "name" | "description" | "price" | "original_price" | "image_urls"
>;

export type PublicProduct = Pick<
  Tables<"products">,
  "id" | "name" | "description" | "price" | "image_urls" | "stock_quantity"
>;

export type PublicCategory = Pick<
  Tables<"service_categories">,
  "id" | "name" | "description" | "sort_order"
>;

export function usePublicCatalog(tenantId: string | undefined) {
  const servicesQuery = useQuery({
    queryKey: ["public-services", tenantId],
    queryFn: async (): Promise<PublicService[]> => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from("services")
        .select(
          `id, name, description, price, duration_minutes, image_urls, category_id,
           deposit_required, deposit_amount, deposit_percentage`
        )
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null);

      if (error) {
        console.error("Error fetching services:", error);
        throw error;
      }

      return data || [];
    },
    enabled: !!tenantId,
  });

  const packagesQuery = useQuery({
    queryKey: ["public-packages", tenantId],
    queryFn: async (): Promise<PublicPackage[]> => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from("packages")
        .select("id, name, description, price, original_price, image_urls")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null);

      if (error) {
        console.error("Error fetching packages:", error);
        throw error;
      }

      return data || [];
    },
    enabled: !!tenantId,
  });

  const productsQuery = useQuery({
    queryKey: ["public-products", tenantId],
    queryFn: async (): Promise<PublicProduct[]> => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, image_urls, stock_quantity")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null);

      if (error) {
        console.error("Error fetching products:", error);
        throw error;
      }

      return data || [];
    },
    enabled: !!tenantId,
  });

  const categoriesQuery = useQuery({
    queryKey: ["public-categories", tenantId],
    queryFn: async (): Promise<PublicCategory[]> => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from("service_categories")
        .select("id, name, description, sort_order")
        .eq("tenant_id", tenantId)
        .order("sort_order");

      if (error) {
        console.error("Error fetching categories:", error);
        throw error;
      }

      return data || [];
    },
    enabled: !!tenantId,
  });

  return {
    services: servicesQuery.data || [],
    packages: packagesQuery.data || [],
    products: productsQuery.data || [],
    categories: categoriesQuery.data || [],
    isLoading:
      servicesQuery.isLoading ||
      packagesQuery.isLoading ||
      productsQuery.isLoading ||
      categoriesQuery.isLoading,
    error:
      servicesQuery.error ||
      packagesQuery.error ||
      productsQuery.error ||
      categoriesQuery.error,
  };
}
