import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export type WhatsAppTemplateType =
  | "appointment_confirmation"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "payment_receipt";

export interface WhatsAppTemplate {
  id: string;
  tenant_id: string;
  template_name: string;
  template_id: string | null;
  template_content: string;
  variables: string[];
  status: "pending" | "approved" | "rejected";
  provider: "termii" | "meta";
  created_at: string;
  updated_at: string;
}

export const whatsappTemplateTypeLabels: Record<WhatsAppTemplateType, string> = {
  appointment_confirmation: "Appointment Confirmation",
  appointment_reminder: "Appointment Reminder",
  appointment_cancelled: "Appointment Cancelled",
  payment_receipt: "Payment Receipt",
};

export const whatsappTemplateAutoSendTriggers: Record<string, string> = {
  on_booking: "When appointment is booked",
  "24h_before": "24 hours before appointment",
  on_cancellation: "When appointment is cancelled",
  on_payment: "When payment is received",
};

// Available variables for WhatsApp templates
export const whatsappTemplateVariables: Record<WhatsAppTemplateType, string[]> = {
  appointment_confirmation: [
    "customer_name",
    "appointment_date",
    "appointment_time",
    "service_name",
    "salon_name",
  ],
  appointment_reminder: [
    "customer_name",
    "appointment_date",
    "appointment_time",
    "service_name",
    "salon_name",
  ],
  appointment_cancelled: ["customer_name", "appointment_date", "salon_name"],
  payment_receipt: ["customer_name", "amount", "salon_name"],
};

// Default WhatsApp templates
export const defaultWhatsAppTemplates: Record<
  WhatsAppTemplateType,
  { message: string; variables: string[]; auto_send_trigger?: string }
> = {
  appointment_confirmation: {
    message:
      "Hi {{customer_name}}, your appointment at {{salon_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. See you soon!",
    variables: ["customer_name", "salon_name", "appointment_date", "appointment_time"],
    auto_send_trigger: "on_booking",
  },
  appointment_reminder: {
    message:
      "Reminder: Your appointment at {{salon_name}} is tomorrow at {{appointment_time}}. We look forward to seeing you!",
    variables: ["salon_name", "appointment_time"],
    auto_send_trigger: "24h_before",
  },
  appointment_cancelled: {
    message:
      "Hi {{customer_name}}, your appointment on {{appointment_date}} at {{salon_name}} has been cancelled. Contact us to reschedule.",
    variables: ["customer_name", "appointment_date", "salon_name"],
    auto_send_trigger: "on_cancellation",
  },
  payment_receipt: {
    message:
      "Thank you {{customer_name}}! Payment of {{amount}} received at {{salon_name}}. We appreciate your business!",
    variables: ["customer_name", "amount", "salon_name"],
    auto_send_trigger: "on_payment",
  },
};

/**
 * Convert user-friendly message with {{variable_name}} to Termii format with {{1}}, {{2}}, etc.
 */
export function convertToTermiiFormat(message: string, variables: string[]): string {
  let content = message;
  variables.forEach((varName, index) => {
    content = content.replace(
      new RegExp(`\\{\\{${varName}\\}\\}`, "g"),
      `{{${index + 1}}}`
    );
  });
  return content;
}

/**
 * Convert Termii format with {{1}}, {{2}}, etc. to user-friendly {{variable_name}}
 */
export function convertFromTermiiFormat(content: string, variables: string[]): string {
  let message = content;
  variables.forEach((varName, index) => {
    message = message.replace(
      new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"),
      `{{${varName}}}`
    );
  });
  return message;
}

export function useWhatsAppTemplates() {
  const { currentTenant } = useAuth();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!currentTenant?.id) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setTemplates((data as WhatsAppTemplate[]) || []);
    } catch (err) {
      console.error("Error fetching WhatsApp templates:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = async (
    templateName: string,
    message: string,
    variables: string[]
  ) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      // Convert user-friendly message to Termii format
      const templateContent = convertToTermiiFormat(message, variables);

      const response = await supabase.functions.invoke("manage-whatsapp-templates/create", {
        body: {
          templateName,
          templateContent,
          variables,
          provider: "termii",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to create template");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: "Template Created",
        description: "WhatsApp template submitted for approval. This may take 1-2 business days.",
      });

      await fetchTemplates();
      return response.data?.template;
    } catch (err: any) {
      console.error("Error creating WhatsApp template:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to create WhatsApp template",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateTemplate = async (
    templateId: string,
    data: {
      templateName?: string;
      message?: string;
      variables?: string[];
    }
  ) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      // Convert user-friendly message to Termii format if provided
      let templateContent: string | undefined;
      if (data.message && data.variables) {
        templateContent = convertToTermiiFormat(data.message, data.variables);
      }

      const response = await supabase.functions.invoke(
        `manage-whatsapp-templates/update/${templateId}`,
        {
          body: {
            templateName: data.templateName,
            templateContent,
            variables: data.variables,
          },
        }
      );

      if (response.error) {
        throw new Error(response.error.message || "Failed to update template");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: "Template Updated",
        description: "Changes will require re-approval from Termii.",
      });

      await fetchTemplates();
      return response.data?.template;
    } catch (err: any) {
      console.error("Error updating WhatsApp template:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update WhatsApp template",
        variant: "destructive",
      });
      return null;
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    try {
      const response = await supabase.functions.invoke(
        `manage-whatsapp-templates/${templateId}`,
        {
          method: "DELETE",
        }
      );

      if (response.error) {
        throw new Error(response.error.message || "Failed to delete template");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: "Template Deleted",
        description: "WhatsApp template has been deleted.",
      });

      await fetchTemplates();
      return true;
    } catch (err: any) {
      console.error("Error deleting WhatsApp template:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete WhatsApp template",
        variant: "destructive",
      });
      return false;
    }
  };

  const getTemplate = (templateName: string): WhatsAppTemplate | undefined => {
    return templates.find((t) => t.template_name === templateName);
  };

  const getTemplateOrDefault = (
    type: WhatsAppTemplateType
  ): { message: string; variables: string[]; auto_send_trigger?: string } => {
    const template = getTemplate(type);
    if (template && template.template_content) {
      return {
        message: convertFromTermiiFormat(template.template_content, template.variables),
        variables: template.variables,
      };
    }
    return defaultWhatsAppTemplates[type];
  };

  return {
    templates,
    isLoading,
    error,
    refetch: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    getTemplateOrDefault,
  };
}
