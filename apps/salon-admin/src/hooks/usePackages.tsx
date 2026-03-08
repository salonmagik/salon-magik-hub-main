import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface PackageItem {
  id: string;
  package_id: string;
  service_id: string;
  quantity: number;
  service?: {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
  };
}

export interface Package {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  status: "active" | "inactive" | "archived";
  image_urls: string[];
  created_at: string;
  updated_at: string;
  items?: PackageItem[];
}

export function usePackages() {
  const { currentTenant, activeLocationId } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPackages = useCallback(async () => {
    if (!currentTenant?.id) {
      setPackages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let scopedPackageIds: string[] | null = null;
      if (activeLocationId) {
        const { data: mappings, error: mappingError } = await (supabase.from as any)("package_locations")
          .select("package_id")
          .eq("tenant_id", currentTenant.id)
          .eq("location_id", activeLocationId)
          .eq("is_enabled", true);
        if (mappingError) throw mappingError;
        scopedPackageIds = Array.from(
          new Set(((mappings ?? []) as Array<{ package_id: string }>).map((row) => row.package_id)),
        );
      }

      if (scopedPackageIds && scopedPackageIds.length === 0) {
        setPackages([]);
        return;
      }

      let query = supabase
        .from("packages")
        .select(`
          *,
          items:package_items(
            *,
            service:services(id, name, price, duration_minutes)
          )
        `)
        .eq("tenant_id", currentTenant.id)
        .neq("status", "archived")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (scopedPackageIds) {
        query = query.in("id", scopedPackageIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setPackages((data as Package[]) || []);
    } catch (err) {
      console.error("Error fetching packages:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [activeLocationId, currentTenant?.id]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

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

  const assignPackageToLocations = async (tenantId: string, packageId: string, locationIds: string[]) => {
    if (locationIds.length === 0) {
      throw new Error("No branch scope was provided for this package.");
    }

    const rows = locationIds.map((locationId) => ({
      tenant_id: tenantId,
      package_id: packageId,
      location_id: locationId,
      is_enabled: true,
    }));

    const { error: mappingError } = await (supabase.from as any)("package_locations").upsert(rows, {
      onConflict: "package_id,location_id",
    });
    if (mappingError) throw mappingError;

    const { data: verifyRows, error: verifyError } = await (supabase.from as any)("package_locations")
      .select("location_id")
      .eq("tenant_id", tenantId)
      .eq("package_id", packageId)
      .eq("is_enabled", true)
      .in("location_id", locationIds);
    if (verifyError) throw verifyError;
    const verifiedLocationIds = new Set(((verifyRows ?? []) as Array<{ location_id: string }>).map((row) => row.location_id));
    if (verifiedLocationIds.size !== locationIds.length) {
      throw new Error("Package branch mapping could not be verified. Please retry.");
    }
  };

  const createPackage = async (data: {
    name: string;
    price: number;
    description?: string;
    originalPrice?: number;
    imageUrls?: string[];
    serviceItems?: { serviceId: string; quantity: number }[];
    productItems?: { productId: string; quantity: number }[];
    fallbackServiceId?: string;
    locationIds?: string[];
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const locationScope = await resolveCreateLocationScope(currentTenant.id, data.locationIds);
      // Create package
      const { data: pkg, error: pkgError } = await supabase
        .from("packages")
        .insert({
          tenant_id: currentTenant.id,
          name: data.name,
          price: data.price,
          description: data.description || null,
          original_price: data.originalPrice || null,
          image_urls: data.imageUrls || [],
        })
        .select()
        .single();

      if (pkgError) throw pkgError;

      // Add package items if provided
      if (data.serviceItems && data.serviceItems.length > 0) {
        const items = data.serviceItems.map((item) => ({
          package_id: pkg.id,
          service_id: item.serviceId,
          quantity: item.quantity,
        }));

        const { error: itemsError } = await supabase
          .from("package_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }
      if (data.productItems && data.productItems.length > 0) {
        const fallbackServiceId = data.fallbackServiceId || data.serviceItems?.[0]?.serviceId;
        if (!fallbackServiceId) {
          throw new Error("Add at least one service or provide a fallback service for package products.");
        }
        const items = data.productItems.map((item) => ({
          package_id: pkg.id,
          service_id: fallbackServiceId,
          product_id: item.productId,
          quantity: item.quantity,
        }));

        const { error: itemsError } = await supabase.from("package_items").insert(items);
        if (itemsError) throw itemsError;
      }

      await assignPackageToLocations(currentTenant.id, pkg.id, locationScope);

      toast({ title: "Success", description: "Package created successfully" });
      await fetchPackages();
      return pkg;
    } catch (err: any) {
      console.error("Error creating package:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to create package",
        variant: "destructive",
      });
      return null;
    }
  };

  const updatePackage = async (id: string, updates: Partial<Omit<Package, "id" | "tenant_id" | "created_at" | "updated_at" | "items">>) => {
    try {
      const { error } = await supabase
        .from("packages")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Package updated" });
      await fetchPackages();
      return true;
    } catch (err) {
      console.error("Error updating package:", err);
      toast({ title: "Error", description: "Failed to update package", variant: "destructive" });
      return false;
    }
  };

  return {
    packages,
    isLoading,
    error,
    refetch: fetchPackages,
    createPackage,
    updatePackage,
  };
}
