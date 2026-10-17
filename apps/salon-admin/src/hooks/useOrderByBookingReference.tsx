import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface OrderServiceLine {
  id: string;
  appointment_id: string;
  service_id: string | null;
  package_id: string | null;
  service_name: string;
  duration_minutes: number | null;
  price: number;
}

export interface OrderProductLine {
  id: string;
  appointment_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  fulfillment_status: string;
  fulfillment_type: "pickup" | "delivery";
}

export interface OrderVoucher {
  voucher_id: string;
  discount_amount: number;
  stored_value_amount: number;
}

export interface OrderOverview {
  bookingReference: string;
  customerId: string | null;
  customer: { full_name: string; phone: string | null } | null;
  createdAt: string;
  // appointment_services rows with no package_id -- plain services
  services: OrderServiceLine[];
  // appointment_services rows with a package_id set -- one per package
  // purchased in this order
  packages: OrderServiceLine[];
  products: OrderProductLine[];
  voucher: OrderVoucher | null;
  totalAmount: number;
  amountPaid: number;
  appointmentIds: string[];
}

// Every line item (service, package or product) added to one checkout in
// create-public-booking/index.ts becomes its own appointments row, and all
// of those rows share the same booking_reference -- the only order-level
// identifier that already exists. This hook is the shared mechanism the
// Product Order, Package Purchase and Mixed Purchase detail dialogs all
// use to reassemble "everything that was in this order" from a single
// notification's entity_id (which only ever points at one of those rows),
// instead of each dialog inventing its own query.
export function useOrderByBookingReference(bookingReference?: string | null) {
  const { currentTenant } = useAuth();
  const [order, setOrder] = useState<OrderOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!bookingReference || !currentTenant?.id) {
      setOrder(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("appointments")
        .select(
          "id, created_at, customer_id, total_amount, amount_paid, booking_reference, booking_metadata, customer:customers!appointments_customer_id_fkey(full_name, phone), services:appointment_services(id, appointment_id, service_id, package_id, service_name, duration_minutes, price), products:appointment_products(id, appointment_id, product_id, product_name, quantity, unit_price, total_price, fulfillment_status)",
        )
        .eq("tenant_id", currentTenant.id)
        .eq("booking_reference", bookingReference)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      const rows = (data || []) as any[];
      if (rows.length === 0) {
        setOrder(null);
        return;
      }

      const services: OrderServiceLine[] = [];
      const packages: OrderServiceLine[] = [];
      const products: OrderProductLine[] = [];
      let voucher: OrderVoucher | null = null;
      let totalAmount = 0;
      let amountPaid = 0;
      const appointmentIds: string[] = [];

      for (const row of rows) {
        appointmentIds.push(row.id);
        totalAmount += Number(row.total_amount || 0);
        amountPaid += Number(row.amount_paid || 0);

        const lineFulfillmentType: "pickup" | "delivery" =
          row.booking_metadata?.line_item?.fulfillment_type === "delivery" ? "delivery" : "pickup";

        if (!voucher && row.booking_metadata?.voucher) {
          voucher = row.booking_metadata.voucher as OrderVoucher;
        }

        for (const service of (row.services || []) as OrderServiceLine[]) {
          if (service.package_id) {
            packages.push(service);
          } else {
            services.push(service);
          }
        }

        for (const product of (row.products || []) as OrderProductLine[]) {
          products.push({ ...product, fulfillment_type: lineFulfillmentType });
        }
      }

      setOrder({
        bookingReference,
        customerId: rows[0].customer_id || null,
        customer: rows[0].customer || null,
        createdAt: rows[0].created_at,
        services,
        packages,
        products,
        voucher,
        totalAmount,
        amountPaid,
        appointmentIds,
      });
    } catch (err) {
      console.error("Error fetching order by booking reference:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [bookingReference, currentTenant?.id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  return { order, isLoading, error, refetch: fetchOrder };
}
