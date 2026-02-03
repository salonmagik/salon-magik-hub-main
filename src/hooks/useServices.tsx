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
    imageUrls?: string[];
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
          image_urls: data.imageUrls || [],
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

  const createCategory = async (data: { name: string; description?: string }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      // Get the max sort_order to add new category at the end
      const maxSortOrder = categories.length > 0 
        ? Math.max(...categories.map(c => c.sort_order)) + 1 
        : 0;

      const { data: category, error } = await supabase
        .from("service_categories")
        .insert({
          tenant_id: currentTenant.id,
          name: data.name,
          description: data.description || null,
          sort_order: maxSortOrder,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Category created successfully" });
      await fetchServices();
      return category;
    } catch (err) {
      console.error("Error creating category:", err);
      toast({ title: "Error", description: "Failed to create category", variant: "destructive" });
      return null;
    }
  };

  const updateCategory = async (id: string, data: { name?: string; description?: string }) => {
    try {
      const { error } = await supabase
        .from("service_categories")
        .update({
          name: data.name,
          description: data.description,
        })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Category updated successfully" });
      await fetchServices();
      return true;
    } catch (err) {
      console.error("Error updating category:", err);
      toast({ title: "Error", description: "Failed to update category", variant: "destructive" });
      return false;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      // First, remove category_id from all services in this category
      await supabase
        .from("services")
        .update({ category_id: null })
        .eq("category_id", id);

      // Then delete the category
      const { error } = await supabase
        .from("service_categories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Category deleted successfully" });
      await fetchServices();
      return true;
    } catch (err) {
      console.error("Error deleting category:", err);
      toast({ title: "Error", description: "Failed to delete category", variant: "destructive" });
      return false;
    }
  };

  return {
    services,
    categories,
    isLoading,
    error,
    refetch: fetchServices,
    createService,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
