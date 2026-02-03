import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export type FulfillmentStatus = "pending" | "ready" | "fulfilled" | "cancelled";

export interface AppointmentProduct {
  id: string;
  appointment_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  fulfillment_status: FulfillmentStatus;
  fulfilled_at: string | null;
  created_at: string;
}

export function useAppointmentProducts(appointmentId?: string) {
  const { currentTenant } = useAuth();
  const [products, setProducts] = useState<AppointmentProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!appointmentId) {
      setProducts([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("appointment_products")
        .select("*")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      setProducts((data as AppointmentProduct[]) || []);
    } catch (err) {
      console.error("Error fetching appointment products:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const addProduct = async (data: {
    appointmentId: string;
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }) => {
    try {
      const { error } = await supabase.from("appointment_products").insert({
        appointment_id: data.appointmentId,
        product_id: data.productId || null,
        product_name: data.productName,
        quantity: data.quantity,
        unit_price: data.unitPrice,
        total_price: data.unitPrice * data.quantity,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Product added to appointment" });
      await fetchProducts();
      return true;
    } catch (err) {
      console.error("Error adding product:", err);
      toast({ title: "Error", description: "Failed to add product", variant: "destructive" });
      return false;
    }
  };

  const updateFulfillmentStatus = async (id: string, status: FulfillmentStatus) => {
    try {
      const updates: Partial<AppointmentProduct> = {
        fulfillment_status: status,
      };

      if (status === "fulfilled") {
        updates.fulfilled_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("appointment_products")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: `Status updated to ${status}` });
      await fetchProducts();
      return true;
    } catch (err) {
      console.error("Error updating fulfillment status:", err);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      return false;
    }
  };

  const removeProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from("appointment_products")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Product removed" });
      await fetchProducts();
      return true;
    } catch (err) {
      console.error("Error removing product:", err);
      toast({ title: "Error", description: "Failed to remove product", variant: "destructive" });
      return false;
    }
  };

  return {
    products,
    isLoading,
    error,
    refetch: fetchProducts,
    addProduct,
    updateFulfillmentStatus,
    removeProduct,
  };
}
