import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

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
  const { currentTenant } = useAuth();
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
      const { data, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .neq("status", "archived")
        .order("name", { ascending: true });

      if (fetchError) throw fetchError;

      setProducts((data as Product[]) || []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const createProduct = async (data: {
    name: string;
    price: number;
    description?: string;
    stockQuantity?: number;
    imageUrls?: string[];
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          tenant_id: currentTenant.id,
          name: data.name,
          price: data.price,
          description: data.description || null,
          stock_quantity: data.stockQuantity || 0,
          image_urls: data.imageUrls || [],
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Product created successfully" });
      await fetchProducts();
      return product;
    } catch (err) {
      console.error("Error creating product:", err);
      toast({ title: "Error", description: "Failed to create product", variant: "destructive" });
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
