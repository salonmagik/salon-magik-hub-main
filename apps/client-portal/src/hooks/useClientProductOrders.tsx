import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "./useClientAuth";
import type { Tables } from "@/lib/supabase";

type AppointmentProduct = Tables<"appointment_products">;

export interface ClientProductOrder extends AppointmentProduct {
  appointmentId: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantCurrency: string;
  locationName: string | null;
  locationCity: string | null;
}

// Products are fulfillment line items on an appointment (appointment_products),
// not purchases of their own. There is no pickup-vs-delivery column on this
// table, only fulfillment_status (pending | ready | fulfilled | cancelled) -
// this hook surfaces exactly that, nothing invented.
export function useClientProductOrders() {
  const { customers, isAuthenticated } = useClientAuth();
  const [orders, setOrders] = useState<ClientProductOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const customerIds = useMemo(() => customers.map((customer) => customer.id), [customers]);

  const refetch = useCallback(async () => {
    if (!isAuthenticated || customerIds.length === 0) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("appointments")
        .select("id, tenant_id, tenant:tenants(name, currency), location:locations(name, city), products:appointment_products(*)")
        .in("customer_id", customerIds);

      if (fetchError) throw fetchError;

      const flattened: ClientProductOrder[] = [];
      for (const appointment of (data || []) as any[]) {
        const tenant = appointment.tenant as { name: string | null; currency: string } | null;
        const location = appointment.location as { name: string | null; city: string | null } | null;
        for (const product of (appointment.products || []) as AppointmentProduct[]) {
          flattened.push({
            ...product,
            appointmentId: appointment.id,
            tenantId: appointment.tenant_id ?? null,
            tenantName: tenant?.name ?? null,
            tenantCurrency: tenant?.currency || "GHS",
            locationName: location?.name ?? null,
            locationCity: location?.city ?? null,
          });
        }
      }

      flattened.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setOrders(flattened);
    } catch (err) {
      console.error("Error fetching client product orders:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, customerIds.join(",")]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { orders, isLoading, error, refetch };
}
