import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";
import { startOfDay, endOfDay } from "date-fns";
import type { FulfillmentStatus, AppointmentProduct } from "./useAppointmentProducts";
import type { TablesUpdate } from "@supabase-client";

export type ProductFulfillmentType = "pickup" | "delivery";

export interface FulfillmentItem extends AppointmentProduct {
  customer_name?: string;
  customer_email?: string | null;
  appointment_date?: string | null;
  // appointment_products has no fulfillment_type column of its own -- this
  // is read off the parent appointment's booking_metadata.line_item
  // (set at checkout; see create-public-booking). Defaults to "pickup" for
  // rows predating that field or added directly by the salon.
  fulfillment_type: ProductFulfillmentType;
}

interface FulfillmentCount {
  pickup: number;
  delivery: number;
}

// Combined counts (pickup + delivery together) with the per-type split kept
// alongside -- 6 separate cards was too much chrome for what's usually a
// handful of orders, but the pickup/delivery breakdown still matters
// operationally, so each stat keeps both numbers.
export interface FulfillmentStats {
  pending: FulfillmentCount;
  ready: FulfillmentCount;
  completedToday: FulfillmentCount;
}

const EMPTY_STATS: FulfillmentStats = {
  pending: { pickup: 0, delivery: 0 },
  ready: { pickup: 0, delivery: 0 },
  completedToday: { pickup: 0, delivery: 0 },
};

export function useProductFulfillment() {
  const { currentTenant } = useAuth();
  const [items, setItems] = useState<FulfillmentItem[]>([]);
  const [stats, setStats] = useState<FulfillmentStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFulfillmentData = useCallback(async () => {
    if (!currentTenant?.id) {
      setItems([]);
      setStats(EMPTY_STATS);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First get all tenant appointments. The customers(...) embed must be
      // qualified by FK name -- appointments has two FKs into customers
      // (customer_id and gift_recipient_customer_id), so the unqualified
      // form is ambiguous and PostgREST errors (PGRST201). That error was
      // going unnoticed here because only `data` was destructured, not
      // `error`, so a failed query silently looked identical to "this
      // tenant has no appointments yet" -- the Fulfillment tab showed
      // empty with zero console output even though the product line items
      // existed (and showed up fine in the appointment detail view, which
      // doesn't embed customers at all).
      const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("id, customer_id, scheduled_start, booking_metadata, customers!appointments_customer_id_fkey(full_name, email)")
        .eq("tenant_id", currentTenant.id);

      if (appointmentsError) throw appointmentsError;

      if (!appointments?.length) {
        setItems([]);
        setStats(EMPTY_STATS);
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

      // Merge with customer info and the fulfillment type off booking_metadata
      const enrichedItems: FulfillmentItem[] = (products || []).map((p) => {
        const apt = appointments.find((a) => a.id === p.appointment_id);
        const metadata = apt?.booking_metadata as { line_item?: { fulfillment_type?: string | null } } | null;
        const fulfillmentType: ProductFulfillmentType =
          metadata?.line_item?.fulfillment_type === "delivery" ? "delivery" : "pickup";
        return {
          ...p,
          customer_name: (apt?.customers as any)?.full_name || "Unknown",
          customer_email: (apt?.customers as any)?.email || null,
          appointment_date: apt?.scheduled_start,
          fulfillment_type: fulfillmentType,
        } as FulfillmentItem;
      });

      setItems(enrichedItems);

      // Calculate stats, split by pickup vs delivery
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);
      const isCompletedToday = (item: FulfillmentItem) => {
        if (item.fulfillment_status !== "fulfilled" || !item.fulfilled_at) return false;
        const fulfilledDate = new Date(item.fulfilled_at);
        return fulfilledDate >= todayStart && fulfilledDate <= todayEnd;
      };

      const pickupItems = enrichedItems.filter((i) => i.fulfillment_type === "pickup");
      const deliveryItems = enrichedItems.filter((i) => i.fulfillment_type === "delivery");

      setStats({
        pending: {
          pickup: pickupItems.filter((i) => i.fulfillment_status === "pending").length,
          delivery: deliveryItems.filter((i) => i.fulfillment_status === "pending").length,
        },
        ready: {
          pickup: pickupItems.filter((i) => i.fulfillment_status === "ready").length,
          delivery: deliveryItems.filter((i) => i.fulfillment_status === "ready").length,
        },
        completedToday: {
          pickup: pickupItems.filter(isCompletedToday).length,
          delivery: deliveryItems.filter(isCompletedToday).length,
        },
      });
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
      const updates: TablesUpdate<"appointment_products"> = {
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
