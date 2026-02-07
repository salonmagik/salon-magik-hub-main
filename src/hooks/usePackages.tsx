import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

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
  const { currentTenant } = useAuth();
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
      const { data, error: fetchError } = await supabase
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

      if (fetchError) throw fetchError;

      setPackages((data as Package[]) || []);
    } catch (err) {
      console.error("Error fetching packages:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const createPackage = async (data: {
    name: string;
    price: number;
    description?: string;
    originalPrice?: number;
    imageUrls?: string[];
    serviceItems?: { serviceId: string; quantity: number }[];
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
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

      toast({ title: "Success", description: "Package created successfully" });
      await fetchPackages();
      return pkg;
    } catch (err) {
      console.error("Error creating package:", err);
      toast({ title: "Error", description: "Failed to create package", variant: "destructive" });
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
