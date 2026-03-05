import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/supabase";

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
> & {
  location_ids?: string[];
};

export type PublicPackage = Pick<
  Tables<"packages">,
  "id" | "name" | "description" | "price" | "original_price" | "image_urls"
> & {
  location_ids?: string[];
};

export type PublicProduct = Pick<
  Tables<"products">,
  "id" | "name" | "description" | "price" | "image_urls" | "stock_quantity"
> & {
  location_ids?: string[];
};

export type PublicCategory = Pick<
  Tables<"service_categories">,
  "id" | "name" | "description" | "sort_order"
>;

type LocationMappedRow = {
  location_id: string;
  price_override: number | null;
};

function buildEffectivePrice(basePrice: number, mappings: LocationMappedRow[]): number {
  const validOverrides = mappings
    .map((row) => row.price_override)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (validOverrides.length === 0) {
    return basePrice;
  }

  return Math.min(...validOverrides);
}

export function usePublicCatalog(
  tenantId: string | undefined,
  countryCode?: string | null,
  locationIds: string[] = [],
) {
  const shouldUseLocationMappings = locationIds.length > 0;

  const servicesQuery = useQuery({
    queryKey: ["public-services", tenantId, countryCode ?? null, locationIds],
    queryFn: async (): Promise<PublicService[]> => {
      if (!tenantId) return [];

      let mappedRows: Array<LocationMappedRow & { service_id: string }> = [];
      let serviceIds: string[] = [];

      if (shouldUseLocationMappings) {
        const { data: serviceMappings, error: mappingError } = await (supabase.from as any)("service_locations")
          .select("service_id, location_id, price_override")
          .eq("tenant_id", tenantId)
          .eq("is_enabled", true)
          .in("location_id", locationIds);

        if (mappingError) {
          console.warn("Service location mappings unavailable, falling back to base services:", mappingError);
        } else {
          mappedRows = (serviceMappings ?? []) as Array<
            LocationMappedRow & { service_id: string }
          >;
          serviceIds = Array.from(new Set(mappedRows.map((row) => row.service_id)));
        }
      }

      // Backward-compatible fallback for tenants that do not have location mappings yet.
      if (!shouldUseLocationMappings || serviceIds.length === 0) {
        const { data, error } = await supabase
          .from("services")
          .select(
            `id, name, description, price, duration_minutes, image_urls, category_id,
             deposit_required, deposit_amount, deposit_percentage`,
          )
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .is("deleted_at", null);

        if (error) {
          console.error("Error fetching fallback services:", error);
          throw error;
        }

        return (data ?? []).map((service) => ({
          ...service,
          location_ids: locationIds,
        }));
      }

      const { data, error } = await supabase
        .from("services")
        .select(
          `id, name, description, price, duration_minutes, image_urls, category_id,
           deposit_required, deposit_amount, deposit_percentage`,
        )
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("id", serviceIds);

      if (error) {
        console.error("Error fetching services:", error);
        throw error;
      }

      return (data ?? []).map((service) => {
        const mappingsForService = mappedRows.filter((row) => row.service_id === service.id);
        const mappedLocationIds = Array.from(
          new Set(mappingsForService.map((row) => row.location_id)),
        );
        return {
          ...service,
          price: buildEffectivePrice(service.price, mappingsForService),
          location_ids: mappedLocationIds,
        };
      });
    },
    enabled: !!tenantId,
  });

  const packagesQuery = useQuery({
    queryKey: ["public-packages", tenantId, countryCode ?? null, locationIds],
    queryFn: async (): Promise<PublicPackage[]> => {
      if (!tenantId) return [];

      let mappedRows: Array<LocationMappedRow & { package_id: string }> = [];
      let packageIds: string[] = [];

      if (shouldUseLocationMappings) {
        const { data: packageMappings, error: mappingError } = await (supabase.from as any)("package_locations")
          .select("package_id, location_id, price_override")
          .eq("tenant_id", tenantId)
          .eq("is_enabled", true)
          .in("location_id", locationIds);

        if (mappingError) {
          console.warn("Package location mappings unavailable, falling back to base packages:", mappingError);
        } else {
          mappedRows = (packageMappings ?? []) as Array<
            LocationMappedRow & { package_id: string }
          >;
          packageIds = Array.from(new Set(mappedRows.map((row) => row.package_id)));
        }
      }

      // Backward-compatible fallback for tenants that do not have location mappings yet.
      if (!shouldUseLocationMappings || packageIds.length === 0) {
        const { data, error } = await supabase
          .from("packages")
          .select("id, name, description, price, original_price, image_urls")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .is("deleted_at", null);

        if (error) {
          console.error("Error fetching fallback packages:", error);
          throw error;
        }

        return (data ?? []).map((pkg) => ({
          ...pkg,
          location_ids: locationIds,
        }));
      }

      const { data, error } = await supabase
        .from("packages")
        .select("id, name, description, price, original_price, image_urls")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("id", packageIds);

      if (error) {
        console.error("Error fetching packages:", error);
        throw error;
      }

      return (data ?? []).map((pkg) => {
        const mappingsForPackage = mappedRows.filter((row) => row.package_id === pkg.id);
        const mappedLocationIds = Array.from(
          new Set(mappingsForPackage.map((row) => row.location_id)),
        );
        return {
          ...pkg,
          price: buildEffectivePrice(pkg.price, mappingsForPackage),
          location_ids: mappedLocationIds,
        };
      });
    },
    enabled: !!tenantId,
  });

  const productsQuery = useQuery({
    queryKey: ["public-products", tenantId, countryCode ?? null, locationIds],
    queryFn: async (): Promise<PublicProduct[]> => {
      if (!tenantId) return [];

      let mappedRows: Array<LocationMappedRow & { product_id: string }> = [];
      let productIds: string[] = [];

      if (shouldUseLocationMappings) {
        const { data: productMappings, error: mappingError } = await (supabase.from as any)("product_locations")
          .select("product_id, location_id, price_override")
          .eq("tenant_id", tenantId)
          .eq("is_enabled", true)
          .in("location_id", locationIds);

        if (mappingError) {
          console.warn("Product location mappings unavailable, falling back to base products:", mappingError);
        } else {
          mappedRows = (productMappings ?? []) as Array<
            LocationMappedRow & { product_id: string }
          >;
          productIds = Array.from(new Set(mappedRows.map((row) => row.product_id)));
        }
      }

      // Backward-compatible fallback for tenants that do not have location mappings yet.
      if (!shouldUseLocationMappings || productIds.length === 0) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, description, price, image_urls, stock_quantity")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .is("deleted_at", null);

        if (error) {
          console.error("Error fetching fallback products:", error);
          throw error;
        }

        return (data ?? []).map((product) => ({
          ...product,
          location_ids: locationIds,
        }));
      }

      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, image_urls, stock_quantity")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("id", productIds);

      if (error) {
        console.error("Error fetching products:", error);
        throw error;
      }

      return (data ?? []).map((product) => {
        const mappingsForProduct = mappedRows.filter((row) => row.product_id === product.id);
        const mappedLocationIds = Array.from(
          new Set(mappingsForProduct.map((row) => row.location_id)),
        );
        return {
          ...product,
          price: buildEffectivePrice(product.price, mappingsForProduct),
          location_ids: mappedLocationIds,
        };
      });
    },
    enabled: !!tenantId,
  });

  const categoriesQuery = useQuery({
    queryKey: ["public-categories", tenantId, countryCode ?? null, locationIds],
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
