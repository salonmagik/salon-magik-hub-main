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
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Fetch deleted services
      const { data: deletedServices, error: servicesError } = await supabase
        .from("services")
        .select("id, name, description, price, deleted_at, deleted_by_id, deletion_reason, image_urls")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .gte("deleted_at", sevenDaysAgo.toISOString())
        .order("deleted_at", { ascending: false });

      if (servicesError) throw servicesError;

      // Fetch deleted products
      const { data: deletedProducts, error: productsError } = await supabase
        .from("products")
        .select("id, name, description, price, deleted_at, deleted_by_id, deletion_reason, image_urls")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .gte("deleted_at", sevenDaysAgo.toISOString())
        .order("deleted_at", { ascending: false });

      if (productsError) throw productsError;

      // Fetch deleted packages
      const { data: deletedPackages, error: packagesError } = await supabase
        .from("packages")
        .select("id, name, description, price, deleted_at, deleted_by_id, deletion_reason, image_urls")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .gte("deleted_at", sevenDaysAgo.toISOString())
        .order("deleted_at", { ascending: false });

      if (packagesError) throw packagesError;

      // Fetch deleted vouchers
      const { data: deletedVouchers, error: vouchersError } = await supabase
        .from("vouchers")
        .select("id, code, amount, deleted_at, deleted_by_id, deletion_reason")
        .eq("tenant_id", currentTenant.id)
        .not("deleted_at", "is", null)
        .gte("deleted_at", sevenDaysAgo.toISOString())
        .order("deleted_at", { ascending: false });

      if (vouchersError) throw vouchersError;

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

  const restoreItem = async (id: string, type: BinItemType) => {
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

      toast({ title: "Restored", description: "Item has been restored" });
      await fetchBinItems();
      return true;
    } catch (err) {
      console.error("Error restoring item:", err);
      toast({ title: "Error", description: "Failed to restore item", variant: "destructive" });
      return false;
    }
  };

  const permanentlyDeleteItem = async (id: string, type: BinItemType) => {
    try {
      let error;
      switch (type) {
        case "service":
          ({ error } = await supabase.from("services").delete().eq("id", id));
          break;
        case "product":
          ({ error } = await supabase.from("products").delete().eq("id", id));
          break;
        case "package":
          ({ error } = await supabase.from("packages").delete().eq("id", id));
          break;
        case "voucher":
          ({ error } = await supabase.from("vouchers").delete().eq("id", id));
          break;
      }

      if (error) throw error;

      toast({ title: "Deleted", description: "Item permanently deleted" });
      await fetchBinItems();
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
