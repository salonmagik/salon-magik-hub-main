import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";
import { toast } from "@ui/ui/use-toast";

type Customer = Tables<"customers">;
type Location = Tables<"locations">;

export interface CustomerVisitedLocation {
  locationId: string;
  locationName: string;
  visitCount: number;
}

export interface CustomerWithVisitSummary extends Customer {
  visitedLocations: CustomerVisitedLocation[];
}

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
}

function normalizePhone(phone?: string) {
  return phone?.replace(/[^\d]/g, "") || "";
}

export function useCustomers() {
  const { currentTenant } = useAuth();
  const [customers, setCustomers] = useState<CustomerWithVisitSummary[]>([]);
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
      const { data: customerRows, error: fetchError } = await supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("full_name", { ascending: true });

      if (fetchError) throw fetchError;

      const customersData = customerRows || [];

      const { data: appointmentRows, error: appointmentError } = await supabase
        .from("appointments")
        .select("customer_id, location_id, actual_start, status")
        .eq("tenant_id", currentTenant.id)
        .not("customer_id", "is", null)
        .not("location_id", "is", null)
        .in("status", ["started", "paused", "completed"]);

      if (appointmentError) throw appointmentError;

      const locationIds = [
        ...new Set((appointmentRows || []).map((row) => row.location_id).filter(Boolean)),
      ];

      let locationsById = new Map<string, Location>();
      if (locationIds.length > 0) {
        const { data: locationRows, error: locationError } = await supabase
          .from("locations")
          .select("*")
          .in("id", locationIds);

        if (locationError) throw locationError;
        locationsById = new Map((locationRows || []).map((location) => [location.id, location]));
      }

      const visitsByCustomer = new Map<string, Map<string, number>>();
      for (const row of appointmentRows || []) {
        if (!row.customer_id || !row.location_id) continue;
        if (!row.actual_start && row.status !== "completed") continue;
        const perCustomer = visitsByCustomer.get(row.customer_id) ?? new Map<string, number>();
        perCustomer.set(row.location_id, (perCustomer.get(row.location_id) || 0) + 1);
        visitsByCustomer.set(row.customer_id, perCustomer);
      }

      const enrichedCustomers: CustomerWithVisitSummary[] = customersData.map((customer) => {
        const locationCounts = visitsByCustomer.get(customer.id) ?? new Map<string, number>();
        const visitedLocations = Array.from(locationCounts.entries())
          .map(([locationId, visitCount]) => ({
            locationId,
            locationName: locationsById.get(locationId)?.name || "Unknown branch",
            visitCount,
          }))
          .sort((a, b) => b.visitCount - a.visitCount || a.locationName.localeCompare(b.locationName));

        return {
          ...customer,
          visitedLocations,
        };
      });

      setCustomers(enrichedCustomers);
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
    birthday?: string;
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const normalizedEmail = normalizeEmail(data.email);
      const normalizedPhone = normalizePhone(data.phone);

      const { data: existingCustomers, error: existingCustomersError } = await supabase
        .from("customers")
        .select("id, full_name, email, phone, status")
        .eq("tenant_id", currentTenant.id);

      if (existingCustomersError) throw existingCustomersError;

      const conflictingCustomer = (existingCustomers || []).find((customer) => {
        if (customer.status === "deleted") return false;
        const emailMatches = normalizedEmail
          ? normalizeEmail(customer.email || undefined) === normalizedEmail
          : false;
        const phoneMatches = normalizedPhone
          ? normalizePhone(customer.phone || undefined) === normalizedPhone
          : false;
        return emailMatches || phoneMatches;
      });

      if (conflictingCustomer) {
        const duplicateField =
          normalizedEmail && normalizeEmail(conflictingCustomer.email || undefined) === normalizedEmail
            ? "email address"
            : "phone number";
        toast({
          title: "Duplicate customer",
          description: `${conflictingCustomer.full_name} already uses this ${duplicateField}.`,
          variant: "destructive",
        });
        return null;
      }

      const { data: customer, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: currentTenant.id,
          full_name: data.fullName,
          phone: data.phone?.trim() || null,
          email: normalizedEmail || null,
          notes: data.notes || null,
          birthday: data.birthday || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Customer created successfully" });
      await fetchCustomers();
      return customer;
    } catch (err) {
      console.error("Error creating customer:", err);
      const message =
        err instanceof Error && /customer.*(email|phone)|already exists|duplicate/i.test(err.message)
          ? err.message
          : "Failed to create customer";
      toast({ title: "Error", description: message, variant: "destructive" });
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

  const bulkUpdateCustomerStatus = async (ids: string[], status: string) => {
    if (!currentTenant?.id || ids.length === 0) {
      toast({ title: "Error", description: "No customers selected", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status })
        .in("id", ids)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${ids.length} customer${ids.length === 1 ? "" : "s"} updated`,
      });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error bulk updating customer status:", err);
      toast({ title: "Error", description: "Failed to update selected customers", variant: "destructive" });
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

  const bulkFlagCustomers = async (ids: string[], reason: string) => {
    if (!currentTenant?.id || ids.length === 0) {
      toast({ title: "Error", description: "No customers selected", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status: "blocked", flag_reason: reason })
        .in("id", ids)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${ids.length} customer${ids.length === 1 ? "" : "s"} flagged`,
      });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error bulk flagging customers:", err);
      toast({ title: "Error", description: "Failed to flag selected customers", variant: "destructive" });
      return false;
    }
  };

  const bulkDeleteCustomers = async (ids: string[]) => {
    if (!currentTenant?.id || ids.length === 0) {
      toast({ title: "Error", description: "No customers selected", variant: "destructive" });
      return false;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status: "deleted" })
        .in("id", ids)
        .eq("tenant_id", currentTenant.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${ids.length} customer${ids.length === 1 ? "" : "s"} deleted`,
      });
      await fetchCustomers();
      return true;
    } catch (err) {
      console.error("Error bulk deleting customers:", err);
      toast({ title: "Error", description: "Failed to delete selected customers", variant: "destructive" });
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
    bulkUpdateCustomerStatus,
    flagCustomer,
    bulkFlagCustomers,
    unflagCustomer,
    deleteCustomer,
    bulkDeleteCustomers,
  };
}
