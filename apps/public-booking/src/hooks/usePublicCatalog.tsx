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

export type PublicCatalogMode = "legacy" | "chain_country_scoped";

type LocationMappedRow = {
  location_id: string;
  price_override: number | null;
};

type CatalogVisibilityRow = {
  status?: string | null;
  deleted_at?: string | null;
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

function isPubliclyVisible<T extends CatalogVisibilityRow>(row: T): boolean {
  if (row.deleted_at) return false;
  if (!row.status) return true;
  return row.status === "active";
}

async function fetchBlockingIssueItemIds(
  tenantId: string,
  itemType: "service" | "product" | "package" | "voucher",
): Promise<Set<string>> {
  const { data, error } = await (supabase.from as any)("catalog_item_integrity_issues")
    .select("item_id")
    .eq("tenant_id", tenantId)
    .eq("item_type", itemType)
    .eq("severity", "blocking")
    .is("resolved_at", null);

  if (error) {
    console.warn("Error fetching catalog integrity blocking issues:", error);
    return new Set();
  }

  return new Set(((data ?? []) as Array<{ item_id: string }>).map((row) => row.item_id));
}

async function fetchLegacyServices(tenantId: string): Promise<PublicService[]> {
  const blockedItemIds = await fetchBlockingIssueItemIds(tenantId, "service");
  const { data, error } = await supabase
    .from("services")
    .select(
      `id, name, description, price, duration_minutes, image_urls, category_id,
       deposit_required, deposit_amount, deposit_percentage, status, deleted_at`,
    )
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter(isPubliclyVisible)
    .filter((service) => !blockedItemIds.has(service.id))
    .map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      duration_minutes: service.duration_minutes,
      image_urls: service.image_urls,
      category_id: service.category_id,
      deposit_required: service.deposit_required,
      deposit_amount: service.deposit_amount,
      deposit_percentage: service.deposit_percentage,
      location_ids: [],
    }));
}

async function fetchLegacyPackages(tenantId: string): Promise<PublicPackage[]> {
  const blockedItemIds = await fetchBlockingIssueItemIds(tenantId, "package");
  const { data, error } = await supabase
    .from("packages")
    .select("id, name, description, price, original_price, image_urls, status, deleted_at")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  return (data ?? [])
    .filter(isPubliclyVisible)
    .filter((pkg) => !blockedItemIds.has(pkg.id))
    .map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      price: pkg.price,
      original_price: pkg.original_price,
      image_urls: pkg.image_urls,
      location_ids: [],
    }));
}

async function fetchLegacyProducts(tenantId: string): Promise<PublicProduct[]> {
  const blockedItemIds = await fetchBlockingIssueItemIds(tenantId, "product");
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, price, image_urls, stock_quantity, status, deleted_at")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  return (data ?? [])
    .filter(isPubliclyVisible)
    .filter((product) => !blockedItemIds.has(product.id))
    .map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      image_urls: product.image_urls,
      stock_quantity: product.stock_quantity,
      location_ids: [],
    }));
}

export function usePublicCatalog(
  tenantId: string | undefined,
  countryCode?: string | null,
  locationIds: string[] = [],
  mode: PublicCatalogMode = "legacy",
) {
  const isChainCountryScoped = mode === "chain_country_scoped";

  const servicesQuery = useQuery({
    queryKey: ["public-services", tenantId, countryCode ?? null, locationIds, mode],
    queryFn: async (): Promise<PublicService[]> => {
      if (!tenantId) return [];

      if (!isChainCountryScoped) {
        return fetchLegacyServices(tenantId);
      }

      let mappingsQuery = (supabase.from as any)("service_locations")
        .select("service_id, location_id, price_override")
        .eq("tenant_id", tenantId)
        .eq("is_enabled", true);
      if (locationIds.length > 0) {
        mappingsQuery = mappingsQuery.in("location_id", locationIds);
      }
      const { data: serviceMappings, error: mappingError } = await mappingsQuery;

      if (mappingError) {
        console.warn("Error fetching service location mappings:", mappingError);
        return fetchLegacyServices(tenantId);
      }

      const mappedRows = (serviceMappings ?? []) as Array<LocationMappedRow & { service_id: string }>;
      if (mappedRows.length === 0) {
        return fetchLegacyServices(tenantId);
      }
      const serviceIds = Array.from(new Set(mappedRows.map((row) => row.service_id)));
      if (serviceIds.length === 0) return [];

      const { data, error } = await supabase
        .from("services")
        .select(
          `id, name, description, price, duration_minutes, image_urls, category_id,
           deposit_required, deposit_amount, deposit_percentage, status, deleted_at`,
        )
        .eq("tenant_id", tenantId)
        .in("id", serviceIds);

      if (error) {
        console.error("Error fetching services:", error);
        throw error;
      }

      const blockedItemIds = await fetchBlockingIssueItemIds(tenantId, "service");

      return (data ?? [])
        .filter(isPubliclyVisible)
        .filter((service) => !blockedItemIds.has(service.id))
        .map((service) => {
          const mappingsForService = mappedRows.filter((row) => row.service_id === service.id);
          const mappedLocationIds = Array.from(
            new Set(mappingsForService.map((row) => row.location_id)),
          );
          return {
            id: service.id,
            name: service.name,
            description: service.description,
            price: buildEffectivePrice(service.price, mappingsForService),
            duration_minutes: service.duration_minutes,
            image_urls: service.image_urls,
            category_id: service.category_id,
            deposit_required: service.deposit_required,
            deposit_amount: service.deposit_amount,
            deposit_percentage: service.deposit_percentage,
            location_ids: mappedLocationIds,
          };
        });
    },
    enabled: !!tenantId,
  });

  const packagesQuery = useQuery({
    queryKey: ["public-packages", tenantId, countryCode ?? null, locationIds, mode],
    queryFn: async (): Promise<PublicPackage[]> => {
      if (!tenantId) return [];

      if (!isChainCountryScoped) {
        return fetchLegacyPackages(tenantId);
      }

      let mappingsQuery = (supabase.from as any)("package_locations")
        .select("package_id, location_id, price_override")
        .eq("tenant_id", tenantId)
        .eq("is_enabled", true);
      if (locationIds.length > 0) {
        mappingsQuery = mappingsQuery.in("location_id", locationIds);
      }
      const { data: packageMappings, error: mappingError } = await mappingsQuery;

      if (mappingError) {
        console.warn("Error fetching package location mappings:", mappingError);
        return fetchLegacyPackages(tenantId);
      }

      const mappedRows = (packageMappings ?? []) as Array<LocationMappedRow & { package_id: string }>;
      if (mappedRows.length === 0) {
        return fetchLegacyPackages(tenantId);
      }
      const packageIds = Array.from(new Set(mappedRows.map((row) => row.package_id)));
      if (packageIds.length === 0) return [];

      const { data, error } = await supabase
        .from("packages")
        .select("id, name, description, price, original_price, image_urls, status, deleted_at")
        .eq("tenant_id", tenantId)
        .in("id", packageIds);

      if (error) {
        console.error("Error fetching packages:", error);
        throw error;
      }

      const blockedItemIds = await fetchBlockingIssueItemIds(tenantId, "package");

      return (data ?? [])
        .filter(isPubliclyVisible)
        .filter((pkg) => !blockedItemIds.has(pkg.id))
        .map((pkg) => {
          const mappingsForPackage = mappedRows.filter((row) => row.package_id === pkg.id);
          const mappedLocationIds = Array.from(
            new Set(mappingsForPackage.map((row) => row.location_id)),
          );
          return {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            price: buildEffectivePrice(pkg.price, mappingsForPackage),
            original_price: pkg.original_price,
            image_urls: pkg.image_urls,
            location_ids: mappedLocationIds,
          };
        });
    },
    enabled: !!tenantId,
  });

  const productsQuery = useQuery({
    queryKey: ["public-products", tenantId, countryCode ?? null, locationIds, mode],
    queryFn: async (): Promise<PublicProduct[]> => {
      if (!tenantId) return [];

      if (!isChainCountryScoped) {
        return fetchLegacyProducts(tenantId);
      }

      let mappingsQuery = (supabase.from as any)("product_locations")
        .select("product_id, location_id, price_override")
        .eq("tenant_id", tenantId)
        .eq("is_enabled", true);
      if (locationIds.length > 0) {
        mappingsQuery = mappingsQuery.in("location_id", locationIds);
      }
      const { data: productMappings, error: mappingError } = await mappingsQuery;

      if (mappingError) {
        console.warn("Error fetching product location mappings:", mappingError);
        return fetchLegacyProducts(tenantId);
      }

      const mappedRows = (productMappings ?? []) as Array<LocationMappedRow & { product_id: string }>;
      if (mappedRows.length === 0) {
        return fetchLegacyProducts(tenantId);
      }
      const productIds = Array.from(new Set(mappedRows.map((row) => row.product_id)));
      if (productIds.length === 0) return [];

      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, image_urls, stock_quantity, status, deleted_at")
        .eq("tenant_id", tenantId)
        .in("id", productIds);

      if (error) {
        console.error("Error fetching products:", error);
        throw error;
      }

      const blockedItemIds = await fetchBlockingIssueItemIds(tenantId, "product");

      return (data ?? [])
        .filter(isPubliclyVisible)
        .filter((product) => !blockedItemIds.has(product.id))
        .map((product) => {
          const mappingsForProduct = mappedRows.filter((row) => row.product_id === product.id);
          const mappedLocationIds = Array.from(
            new Set(mappingsForProduct.map((row) => row.location_id)),
          );
          return {
            id: product.id,
            name: product.name,
            description: product.description,
            price: buildEffectivePrice(product.price, mappingsForProduct),
            image_urls: product.image_urls,
            stock_quantity: product.stock_quantity,
            location_ids: mappedLocationIds,
          };
        });
    },
    enabled: !!tenantId,
  });

  const categoriesQuery = useQuery({
    queryKey: ["public-categories", tenantId, countryCode ?? null, locationIds, mode],
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
