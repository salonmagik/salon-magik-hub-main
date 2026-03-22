import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  status: "active" | "inactive" | "archived";
  image_urls: string[];
  created_at: string;
  updated_at: string;
}

export function useProducts() {
  const { currentTenant, activeLocationId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!currentTenant?.id) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let scopedProductIds: string[] | null = null;
      if (activeLocationId) {
        const { data: mappings, error: mappingError } = await (supabase.from as any)("product_locations")
          .select("product_id")
          .eq("tenant_id", currentTenant.id)
          .eq("location_id", activeLocationId)
          .eq("is_enabled", true);
        if (mappingError) throw mappingError;
        scopedProductIds = Array.from(
          new Set(((mappings ?? []) as Array<{ product_id: string }>).map((row) => row.product_id)),
        );
      }

      if (scopedProductIds && scopedProductIds.length === 0) {
        setProducts([]);
        return;
      }

      let query = supabase
        .from("products")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .neq("status", "archived")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (scopedProductIds) {
        query = query.in("id", scopedProductIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setProducts((data as Product[]) || []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [activeLocationId, currentTenant?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const resolveCreateLocationScope = async (tenantId: string, requestedLocationIds?: string[]) => {
    const isChainTier = String(currentTenant?.plan || "").toLowerCase() === "chain";
    const normalizedRequested = Array.from(new Set((requestedLocationIds ?? []).filter(Boolean)));
    const targetLocationIds = isChainTier
      ? normalizedRequested
      : Array.from(new Set([activeLocationId, ...normalizedRequested].filter(Boolean) as string[]));

    if (targetLocationIds.length === 0) {
      throw new Error(
        isChainTier
          ? "Select at least one branch before creating this item."
          : "No branch context found. Switch to a branch and try again.",
      );
    }

    const { data: locations, error } = await supabase
      .from("locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", targetLocationIds)
      .or("availability.is.null,availability.eq.open");
    if (error) throw error;
    const validLocationIds = Array.from(new Set((locations ?? []).map((row) => row.id)));
    if (validLocationIds.length !== targetLocationIds.length) {
      throw new Error("Some selected branches are unavailable. Refresh and try again.");
    }
    return validLocationIds;
  };

  const assignProductToLocations = async (tenantId: string, productId: string, locationIds: string[]) => {
    if (locationIds.length === 0) {
      throw new Error("No branch scope was provided for this product.");
    }

    const rows = locationIds.map((locationId) => ({
      tenant_id: tenantId,
      product_id: productId,
      location_id: locationId,
      is_enabled: true,
    }));

    const { error: mappingError } = await (supabase.from as any)("product_locations").upsert(rows, {
      onConflict: "product_id,location_id",
    });
    if (mappingError) throw mappingError;

    const { data: verifyRows, error: verifyError } = await (supabase.from as any)("product_locations")
      .select("location_id")
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .eq("is_enabled", true)
      .in("location_id", locationIds);
    if (verifyError) throw verifyError;
    const verifiedLocationIds = new Set(((verifyRows ?? []) as Array<{ location_id: string }>).map((row) => row.location_id));
    if (verifiedLocationIds.size !== locationIds.length) {
      throw new Error("Product branch mapping could not be verified. Please retry.");
    }
  };

  const createProduct = async (data: {
    name: string;
    price: number;
    description?: string;
    stockQuantity?: number;
    status?: Product["status"];
    imageUrls?: string[];
    locationIds?: string[];
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const locationScope = await resolveCreateLocationScope(currentTenant.id, data.locationIds);
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          tenant_id: currentTenant.id,
          name: data.name,
          price: data.price,
          description: data.description || null,
          stock_quantity: data.stockQuantity || 0,
          status: data.status || "active",
          image_urls: data.imageUrls || [],
        })
        .select()
        .single();

      if (error) throw error;
      await assignProductToLocations(currentTenant.id, product.id, locationScope);

      toast({ title: "Success", description: "Product created successfully" });
      await fetchProducts();
      return product;
    } catch (err: any) {
      console.error("Error creating product:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to create product",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Omit<Product, "id" | "tenant_id" | "created_at" | "updated_at">>) => {
    try {
      const { error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Product updated" });
      await fetchProducts();
      return true;
    } catch (err) {
      console.error("Error updating product:", err);
      toast({ title: "Error", description: "Failed to update product", variant: "destructive" });
      return false;
    }
  };

  return {
    products,
    isLoading,
    error,
    refetch: fetchProducts,
    createProduct,
    updateProduct,
  };
}
