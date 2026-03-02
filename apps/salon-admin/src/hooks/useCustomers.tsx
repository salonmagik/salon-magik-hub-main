import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { useLocationScope } from "./useLocationScope";
import type { Tables } from "@supabase-client";
import { toast } from "@ui/ui/use-toast";

type Customer = Tables<"customers">;

export function useCustomers() {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
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
      if (hasScope && scopedLocationIds.length === 0) {
        setCustomers([]);
        return;
      }

      let customerQuery = supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("full_name", { ascending: true });

      if (hasScope) {
        const { data: appointmentCustomers, error: appointmentCustomerError } = await supabase
          .from("appointments")
          .select("customer_id")
          .eq("tenant_id", currentTenant.id)
          .in("location_id", scopedLocationIds);

        if (appointmentCustomerError) throw appointmentCustomerError;

        const scopedCustomerIds = [
          ...new Set((appointmentCustomers || []).map((row) => row.customer_id).filter(Boolean)),
        ];

        if (scopedCustomerIds.length === 0) {
          setCustomers([]);
          return;
        }

        customerQuery = customerQuery.in("id", scopedCustomerIds);
      }

      const { data, error: fetchError } = await customerQuery;

      if (fetchError) throw fetchError;

      setCustomers(data || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, hasScope, scopedLocationIds]);

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

  const updateCustomerStatus = async (id: string, status: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status })
        .eq("id", id)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer status updated" });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error updating customer status:", err);
      toast({ title: "Error", description: "Failed to update customer status", variant: "destructive" });
      return false;
    }
  };

  const flagCustomer = async (id: string, reason: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status: "blocked", flag_reason: reason })
        .eq("id", id)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer has been flagged" });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error flagging customer:", err);
      toast({ title: "Error", description: "Failed to flag customer", variant: "destructive" });
      return false;
    }
  };

  const unflagCustomer = async (id: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status: "active", flag_reason: null })
        .eq("id", id)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer has been unflagged" });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error unflagging customer:", err);
      toast({ title: "Error", description: "Failed to unflag customer", variant: "destructive" });
      return false;
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status: "deleted" })
        .eq("id", id)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({ title: "Success", description: "Customer has been deleted" });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error deleting customer:", err);
      toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
      return false;
    }
  };

  return {
    customers,
    isLoading,
    error,
    refetch: fetchCustomers,
    createCustomer,
    updateCustomerStatus,
    flagCustomer,
    unflagCustomer,
    deleteCustomer,
  };
}
