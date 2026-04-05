import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";
import { toast } from "@ui/ui/use-toast";

type WhatsAppTemplate = Tables<"whatsapp_templates">;

export interface UseWhatsAppTemplatesOptions {
  tenantId: string;
  provider?: "termii" | "meta";
  status?: "pending" | "approved" | "rejected";
}

export interface CreateTemplateOptions {
  templateName: string;
  templateContent: string;
  variables: string[];
  provider: "termii" | "meta";
}

export interface UpdateTemplateOptions {
  id: string;
  templateName?: string;
  templateContent?: string;
  variables?: string[];
}

export function useWhatsAppTemplates(options: UseWhatsAppTemplatesOptions) {
  const { currentTenant, user } = useAuth();
  const { tenantId, provider, status } = options;
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!tenantId) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (provider) {
        query = query.eq("provider", provider);
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTemplates(data || []);
    } catch (err) {
      console.error("Error fetching WhatsApp templates:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, provider, status]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = async (templateOptions: CreateTemplateOptions) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    if (!user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return null;
    }

    try {
      // Call manage-whatsapp-templates edge function with POST
      const { data, error: createError } = await supabase.functions.invoke(
        "manage-whatsapp-templates",
        {
          method: "POST",
          body: {
            templateName: templateOptions.templateName,
            templateContent: templateOptions.templateContent,
            variables: templateOptions.variables,
            provider: templateOptions.provider,
          },
        }
      );

      if (createError) throw createError;

      toast({
        title: "Success",
        description: "WhatsApp template created successfully",
      });

      // Refresh templates list
      await fetchTemplates();

      return data;
    } catch (err) {
      console.error("Error creating template:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create template";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return null;
    }
  };

  const updateTemplate = async (templateOptions: UpdateTemplateOptions) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    if (!user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return null;
    }

    try {
      // Call manage-whatsapp-templates edge function with PUT
      const { data, error: updateError } = await supabase.functions.invoke(
        "manage-whatsapp-templates",
        {
          method: "PUT",
          body: {
            id: templateOptions.id,
            templateName: templateOptions.templateName,
            templateContent: templateOptions.templateContent,
            variables: templateOptions.variables,
          },
        }
      );

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "WhatsApp template updated successfully",
      });

      // Refresh templates list
      await fetchTemplates();

      return data;
    } catch (err) {
      console.error("Error updating template:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to update template";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return null;
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    if (!user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return false;
    }

    try {
      // Call manage-whatsapp-templates edge function with DELETE
      const { error: deleteError } = await supabase.functions.invoke(
        "manage-whatsapp-templates",
        {
          method: "DELETE",
          body: { id: templateId },
        }
      );

      if (deleteError) throw deleteError;

      toast({
        title: "Success",
        description: "WhatsApp template deleted successfully",
      });

      // Refresh templates list
      await fetchTemplates();

      return true;
    } catch (err) {
      console.error("Error deleting template:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to delete template";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return false;
    }
  };

  const checkStatus = async (templateId: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    if (!user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return null;
    }

    try {
      // Call manage-whatsapp-templates edge function to check status
      const { data, error: statusError } = await supabase.functions.invoke(
        "manage-whatsapp-templates",
        {
          method: "GET",
          body: { action: "status", id: templateId },
        }
      );

      if (statusError) throw statusError;

      // Refresh templates list to show updated status
      await fetchTemplates();

      return data;
    } catch (err) {
      console.error("Error checking template status:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to check template status";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return null;
    }
  };

  return {
    templates,
    isLoading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    checkStatus,
    refetch: fetchTemplates,
  };
}
