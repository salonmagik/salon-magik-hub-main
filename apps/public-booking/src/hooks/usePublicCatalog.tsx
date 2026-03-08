import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/supabase";

export interface PublicBranch {
  id: string;
  name: string;
  city: string | null;
  country_code: string;
}

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
  branches?: PublicBranch[];
  location_ids?: string[];
};

export type PublicPackage = Pick<
  Tables<"packages">,
  "id" | "name" | "description" | "price" | "original_price" | "image_urls"
> & {
  branches?: PublicBranch[];
  location_ids?: string[];
};

export type PublicProduct = Pick<
  Tables<"products">,
  "id" | "name" | "description" | "price" | "image_urls" | "stock_quantity"
> & {
  branches?: PublicBranch[];
  location_ids?: string[];
};

export type PublicCategory = Pick<
  Tables<"service_categories">,
  "id" | "name" | "description" | "sort_order"
>;

export type PublicCatalogMode = "legacy" | "chain_country_scoped";

interface PublicCatalogPayload {
  services?: PublicService[];
  packages?: PublicPackage[];
  products?: PublicProduct[];
  categories?: PublicCategory[];
}

export function usePublicCatalog(
  tenantId: string | undefined,
  countryCode?: string | null,
  locationIds: string[] = [],
  mode: PublicCatalogMode = "legacy",
) {
  const isChainCountryScoped = mode === "chain_country_scoped";

  const catalogQuery = useQuery({
    queryKey: ["public-catalog-payload", tenantId, countryCode ?? null, locationIds, mode],
    queryFn: async (): Promise<PublicCatalogPayload> => {
      if (!tenantId) {
        return {
          services: [],
          packages: [],
          products: [],
          categories: [],
        };
      }

      const { data, error } = await (supabase.rpc as any)("get_public_catalog_payload", {
        p_tenant_id: tenantId,
        p_mode: mode,
        p_country_code: isChainCountryScoped ? countryCode || null : null,
        p_location_ids: isChainCountryScoped ? locationIds : null,
      });

      if (error) {
        console.error("Error fetching public catalog payload:", error);
        throw error;
      }

      return (data as PublicCatalogPayload) || {
        services: [],
        packages: [],
        products: [],
        categories: [],
      };
    },
    enabled: !!tenantId,
  });

  return {
    services: catalogQuery.data?.services || [],
    packages: catalogQuery.data?.packages || [],
    products: catalogQuery.data?.products || [],
    categories: catalogQuery.data?.categories || [],
    isLoading: catalogQuery.isLoading,
    error: catalogQuery.error,
  };
}
