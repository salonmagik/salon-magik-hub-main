import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";
import { startOfDay, endOfDay } from "date-fns";
import type { FulfillmentStatus, AppointmentProduct } from "./useAppointmentProducts";

export interface FulfillmentItem extends AppointmentProduct {
  customer_name?: string;
  appointment_date?: string | null;
}

export interface FulfillmentStats {
  pending: number;
  ready: number;
  fulfilledToday: number;
}

export function useProductFulfillment() {
  const { currentTenant } = useAuth();
  const [items, setItems] = useState<FulfillmentItem[]>([]);
  const [stats, setStats] = useState<FulfillmentStats>({
    pending: 0,
    ready: 0,
    fulfilledToday: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFulfillmentData = useCallback(async () => {
    if (!currentTenant?.id) {
      setItems([]);
      setStats({ pending: 0, ready: 0, fulfilledToday: 0 });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First get all tenant appointments
      const { data: appointments } = await supabase
        .from("appointments")
        .select("id, customer_id, scheduled_start, customers(full_name)")
        .eq("tenant_id", currentTenant.id);

      if (!appointments?.length) {
        setItems([]);
        setStats({ pending: 0, ready: 0, fulfilledToday: 0 });
        setIsLoading(false);
        return;
      }

      const appointmentIds = appointments.map((a) => a.id);

      // Get all products for these appointments that aren't cancelled
      const { data: products, error: productsError } = await supabase
        .from("appointment_products")
        .select("*")
        .in("appointment_id", appointmentIds)
        .neq("fulfillment_status", "cancelled")
        .order("created_at", { ascending: false });

      if (productsError) throw productsError;

      // Merge with customer info
      const enrichedItems: FulfillmentItem[] = (products || []).map((p) => {
        const apt = appointments.find((a) => a.id === p.appointment_id);
        return {
          ...p,
          customer_name: (apt?.customers as any)?.full_name || "Unknown",
          appointment_date: apt?.scheduled_start,
        } as FulfillmentItem;
      });

      setItems(enrichedItems);

      // Calculate stats
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);

      const pending = enrichedItems.filter((i) => i.fulfillment_status === "pending").length;
      const ready = enrichedItems.filter((i) => i.fulfillment_status === "ready").length;
      const fulfilledToday = enrichedItems.filter((i) => {
        if (i.fulfillment_status !== "fulfilled" || !i.fulfilled_at) return false;
        const fulfilledDate = new Date(i.fulfilled_at);
        return fulfilledDate >= todayStart && fulfilledDate <= todayEnd;
      }).length;

      setStats({ pending, ready, fulfilledToday });
    } catch (err) {
      console.error("Error fetching fulfillment data:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchFulfillmentData();
  }, [fetchFulfillmentData]);

  const updateStatus = async (id: string, status: FulfillmentStatus) => {
    try {
      const updates: Record<string, any> = {
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
      await fetchFulfillmentData();
      return true;
    } catch (err) {
      console.error("Error updating status:", err);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      return false;
    }
  };

  return {
    items,
    stats,
    isLoading,
    error,
    refetch: fetchFulfillmentData,
    updateStatus,
  };
}
