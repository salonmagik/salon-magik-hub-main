import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";

type Customer = Tables<"customers">;

export function useCustomers() {
  const { currentTenant } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCustomers = useCallback(async () => {
    if (!currentTenant?.id) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("full_name", { ascending: true });

      if (fetchError) throw fetchError;

      setCustomers(data || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const createCustomer = async (data: {
    fullName: string;
    phone?: string;
    email?: string;
    notes?: string;
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: customer, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: currentTenant.id,
          full_name: data.fullName,
          phone: data.phone || null,
          email: data.email || null,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Customer created successfully" });
      await fetchCustomers();
      return customer;
    } catch (err) {
      console.error("Error creating customer:", err);
      toast({ title: "Error", description: "Failed to create customer", variant: "destructive" });
      return null;
    }
  };

  return {
    customers,
    isLoading,
    error,
    refetch: fetchCustomers,
    createCustomer,
  };
}
