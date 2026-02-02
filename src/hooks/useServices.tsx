import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";

type Service = Tables<"services">;
type ServiceCategory = Tables<"service_categories">;

export interface ServiceWithCategory extends Service {
  category: ServiceCategory | null;
}

export function useServices() {
  const { currentTenant } = useAuth();
  const [services, setServices] = useState<ServiceWithCategory[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchServices = useCallback(async () => {
    if (!currentTenant?.id) {
      setServices([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch services with categories
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select(`
          *,
          category:service_categories(*)
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (servicesError) throw servicesError;

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("service_categories")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("sort_order", { ascending: true });

      if (categoriesError) throw categoriesError;

      setServices((servicesData as ServiceWithCategory[]) || []);
      setCategories(categoriesData || []);
    } catch (err) {
      console.error("Error fetching services:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const createService = async (data: {
    name: string;
    price: number;
    durationMinutes: number;
    description?: string;
    categoryId?: string;
    depositRequired?: boolean;
    depositAmount?: number;
    depositPercentage?: number;
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: service, error } = await supabase
        .from("services")
        .insert({
          tenant_id: currentTenant.id,
          name: data.name,
          price: data.price,
          duration_minutes: data.durationMinutes,
          description: data.description || null,
          category_id: data.categoryId || null,
          deposit_required: data.depositRequired || false,
          deposit_amount: data.depositAmount || null,
          deposit_percentage: data.depositPercentage || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Service created successfully" });
      await fetchServices();
      return service;
    } catch (err) {
      console.error("Error creating service:", err);
      toast({ title: "Error", description: "Failed to create service", variant: "destructive" });
      return null;
    }
  };

  return {
    services,
    categories,
    isLoading,
    error,
    refetch: fetchServices,
    createService,
  };
}
