import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";
import { differenceInDays } from "date-fns";

export type BinItemType = "service" | "product" | "package" | "voucher";

export interface BinItem {
  id: string;
  type: BinItemType;
  name: string;
  description: string | null;
  price: number;
  deleted_at: string;
  deleted_by_id: string | null;
  deletion_reason: string | null;
  days_until_permanent: number;
  image_urls?: string[];
  location_names?: string[];
}

export function useBinItems() {
  const { currentTenant, user } = useAuth();
  const [binItems, setBinItems] = useState<BinItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBinItems = useCallback(async () => {
    if (!currentTenant?.id) {
      setBinItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();

      // Fetch deleted services
      const { data: deletedServices, error: servicesError } = await supabase
        .from("services")
        .select("id, name, description, price, deleted_at, deleted_by_id, deletion_reason, image_urls")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (servicesError) throw servicesError;

      // Fetch deleted products
      const { data: deletedProducts, error: productsError } = await supabase
        .from("products")
        .select("id, name, description, price, deleted_at, deleted_by_id, deletion_reason, image_urls")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (productsError) throw productsError;

      // Fetch deleted packages
      const { data: deletedPackages, error: packagesError } = await supabase
        .from("packages")
        .select("id, name, description, price, deleted_at, deleted_by_id, deletion_reason, image_urls")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (packagesError) throw packagesError;

      // Fetch deleted vouchers
      const { data: deletedVouchers, error: vouchersError } = await supabase
        .from("vouchers")
        .select("id, code, amount, deleted_at, deleted_by_id, deletion_reason")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (vouchersError) throw vouchersError;

      const [locationsResult, serviceLocationResult, productLocationResult, packageLocationResult, voucherLocationResult] =
        await Promise.all([
          supabase
            .from("locations")
            .select("id, name, city")
            .eq("tenant_id", currentTenant.id),
          (deletedServices || []).length > 0
            ? (supabase.from as any)("service_locations")
                .select("service_id, location_id")
                .in("service_id", (deletedServices || []).map((item) => item.id))
            : Promise.resolve({ data: [], error: null }),
          (deletedProducts || []).length > 0
            ? (supabase.from as any)("product_locations")
                .select("product_id, location_id")
                .in("product_id", (deletedProducts || []).map((item) => item.id))
            : Promise.resolve({ data: [], error: null }),
          (deletedPackages || []).length > 0
            ? (supabase.from as any)("package_locations")
                .select("package_id, location_id")
                .in("package_id", (deletedPackages || []).map((item) => item.id))
            : Promise.resolve({ data: [], error: null }),
          (deletedVouchers || []).length > 0
            ? (supabase.from as any)("voucher_locations")
                .select("voucher_id, location_id")
                .in("voucher_id", (deletedVouchers || []).map((item) => item.id))
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (locationsResult.error) throw locationsResult.error;
      if (serviceLocationResult.error) throw serviceLocationResult.error;
      if (productLocationResult.error) throw productLocationResult.error;
      if (packageLocationResult.error) throw packageLocationResult.error;
      if (voucherLocationResult.error) throw voucherLocationResult.error;

      const locationNameById = new Map<string, string>(
        ((locationsResult.data || []) as Array<{ id: string; name: string; city: string | null }>).map((location) => [
          location.id,
          location.city || location.name,
        ]),
      );

      const serviceLocationNamesById = new Map<string, string[]>();
      ((serviceLocationResult.data || []) as Array<{ service_id: string; location_id: string }>).forEach((mapping) => {
        const current = serviceLocationNamesById.get(mapping.service_id) || [];
        const locationName = locationNameById.get(mapping.location_id);
        if (locationName && !current.includes(locationName)) current.push(locationName);
        serviceLocationNamesById.set(mapping.service_id, current);
      });

      const productLocationNamesById = new Map<string, string[]>();
      ((productLocationResult.data || []) as Array<{ product_id: string; location_id: string }>).forEach((mapping) => {
        const current = productLocationNamesById.get(mapping.product_id) || [];
        const locationName = locationNameById.get(mapping.location_id);
        if (locationName && !current.includes(locationName)) current.push(locationName);
        productLocationNamesById.set(mapping.product_id, current);
      });

      const packageLocationNamesById = new Map<string, string[]>();
      ((packageLocationResult.data || []) as Array<{ package_id: string; location_id: string }>).forEach((mapping) => {
        const current = packageLocationNamesById.get(mapping.package_id) || [];
        const locationName = locationNameById.get(mapping.location_id);
        if (locationName && !current.includes(locationName)) current.push(locationName);
        packageLocationNamesById.set(mapping.package_id, current);
      });

      const voucherLocationNamesById = new Map<string, string[]>();
      ((voucherLocationResult.data || []) as Array<{ voucher_id: string; location_id: string }>).forEach((mapping) => {
        const current = voucherLocationNamesById.get(mapping.voucher_id) || [];
        const locationName = locationNameById.get(mapping.location_id);
        if (locationName && !current.includes(locationName)) current.push(locationName);
        voucherLocationNamesById.set(mapping.voucher_id, current);
      });

      // Combine and calculate days until permanent deletion
      const allItems: BinItem[] = [
        ...(deletedServices || []).map((s) => ({
          id: s.id,
          type: "service" as const,
          name: s.name,
          description: s.description,
          price: Number(s.price),
          deleted_at: s.deleted_at!,
          deleted_by_id: s.deleted_by_id,
          deletion_reason: s.deletion_reason,
          days_until_permanent: 7 - differenceInDays(now, new Date(s.deleted_at!)),
          image_urls: s.image_urls || [],
          location_names: serviceLocationNamesById.get(s.id) || [],
        })),
        ...(deletedProducts || []).map((p) => ({
          id: p.id,
          type: "product" as const,
          name: p.name,
          description: p.description,
          price: Number(p.price),
          deleted_at: p.deleted_at!,
          deleted_by_id: p.deleted_by_id,
          deletion_reason: p.deletion_reason,
          days_until_permanent: 7 - differenceInDays(now, new Date(p.deleted_at!)),
          image_urls: p.image_urls || [],
          location_names: productLocationNamesById.get(p.id) || [],
        })),
        ...(deletedPackages || []).map((p) => ({
          id: p.id,
          type: "package" as const,
          name: p.name,
          description: p.description,
          price: Number(p.price),
          deleted_at: p.deleted_at!,
          deleted_by_id: p.deleted_by_id,
          deletion_reason: p.deletion_reason,
          days_until_permanent: 7 - differenceInDays(now, new Date(p.deleted_at!)),
          image_urls: p.image_urls || [],
          location_names: packageLocationNamesById.get(p.id) || [],
        })),
        ...(deletedVouchers || []).map((v) => ({
          id: v.id,
          type: "voucher" as const,
          name: v.code,
          description: null,
          price: Number(v.amount),
          deleted_at: v.deleted_at!,
          deleted_by_id: v.deleted_by_id,
          deletion_reason: v.deletion_reason,
          days_until_permanent: 7 - differenceInDays(now, new Date(v.deleted_at!)),
          location_names: voucherLocationNamesById.get(v.id) || [],
        })),
      ];

      // Sort by deleted_at descending
      allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

      setBinItems(allItems);
    } catch (err) {
      console.error("Error fetching bin items:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchBinItems();
  }, [fetchBinItems]);

  const restoreItem = async (
    id: string,
    type: BinItemType,
    options?: { silent?: boolean; skipRefetch?: boolean },
  ) => {
    try {
      const updateData = {
        deleted_at: null,
        deleted_by_id: null,
        deletion_reason: null,
        status: "active" as const,
      };

      let error;
      switch (type) {
        case "service":
          ({ error } = await supabase.from("services").update(updateData).eq("id", id));
          break;
        case "product":
          ({ error } = await supabase.from("products").update(updateData).eq("id", id));
          break;
        case "package":
          ({ error } = await supabase.from("packages").update(updateData).eq("id", id));
          break;
        case "voucher":
          ({ error } = await supabase.from("vouchers").update({
            deleted_at: null,
            deleted_by_id: null,
            deletion_reason: null,
            status: "active" as const,
          }).eq("id", id));
          break;
      }

      if (error) throw error;
      setBinItems((prev) => prev.filter((item) => !(item.id === id && item.type === type)));

      if (!options?.silent) {
        toast({ title: "Restored", description: "Item has been restored" });
      }
      if (!options?.skipRefetch) {
        await fetchBinItems();
      }
      return true;
    } catch (err) {
      console.error("Error restoring item:", err);
      toast({ title: "Error", description: "Failed to restore item", variant: "destructive" });
      return false;
    }
  };

  const permanentlyDeleteItem = async (
    id: string,
    type: BinItemType,
    options?: { silent?: boolean; skipRefetch?: boolean },
  ) => {
    try {
      if (!currentTenant?.id || !user?.id) {
        throw new Error("Missing tenant or user context");
      }

      const { data, error } = await (supabase.rpc as any)("permanently_delete_catalog_bin_item", {
        p_tenant_id: currentTenant.id,
        p_item_type: type,
        p_item_id: id,
      });

      if (error) throw error;
      if (data !== true) {
        throw new Error("Item was not permanently deleted. Please try again.");
      }
      setBinItems((prev) => prev.filter((item) => !(item.id === id && item.type === type)));

      if (!options?.silent) {
        toast({ title: "Deleted", description: "Item permanently deleted" });
      }
      if (!options?.skipRefetch) {
        await fetchBinItems();
      }
      return true;
    } catch (err) {
      console.error("Error deleting item:", err);
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
      return false;
    }
  };

  const emptyBin = async () => {
    if (!currentTenant?.id) return false;

    try {
      // Delete all items from each table
      const serviceItems = binItems.filter((i) => i.type === "service");
      const productItems = binItems.filter((i) => i.type === "product");
      const packageItems = binItems.filter((i) => i.type === "package");
      const voucherItems = binItems.filter((i) => i.type === "voucher");

      if (serviceItems.length > 0) {
        const { error } = await supabase.from("services").delete()
          .eq("tenant_id", currentTenant.id).not("deleted_at", "is", null);
        if (error) throw error;
      }
      if (productItems.length > 0) {
        const { error } = await supabase.from("products").delete()
          .eq("tenant_id", currentTenant.id).not("deleted_at", "is", null);
        if (error) throw error;
      }
      if (packageItems.length > 0) {
        const { error } = await supabase.from("packages").delete()
          .eq("tenant_id", currentTenant.id).not("deleted_at", "is", null);
        if (error) throw error;
      }
      if (voucherItems.length > 0) {
        const { error } = await supabase.from("vouchers").delete()
          .eq("tenant_id", currentTenant.id).not("deleted_at", "is", null);
        if (error) throw error;
      }

      toast({ title: "Bin Emptied", description: "All items permanently deleted" });
      await fetchBinItems();
      return true;
    } catch (err) {
      console.error("Error emptying bin:", err);
      toast({ title: "Error", description: "Failed to empty bin", variant: "destructive" });
      return false;
    }
  };

  return {
    binItems,
    isLoading,
    error,
    refetch: fetchBinItems,
    restoreItem,
    permanentlyDeleteItem,
    emptyBin,
  };
}
