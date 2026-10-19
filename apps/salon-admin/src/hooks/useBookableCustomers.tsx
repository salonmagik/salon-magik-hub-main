import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface BookableCustomer {
  id: string;
  full_name: string;
}

// Narrow, permission-independent customer lookup for the appointment/walk-in
// booking modals: any active tenant member can pick an existing customer to
// book for, even without the 'customers' module permission that gates the
// full CRM (Customers page + useCustomers()) -- otherwise a staff member
// without that permission can't complete a booking at all.
export function useBookableCustomers() {
  const { currentTenant } = useAuth();
  const [customers, setCustomers] = useState<BookableCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    if (!currentTenant?.id) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("list_bookable_customers", {
        p_tenant_id: currentTenant.id,
      });
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error("Error fetching bookable customers:", err);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  return { customers, isLoading, refetch: fetchCustomers };
}
