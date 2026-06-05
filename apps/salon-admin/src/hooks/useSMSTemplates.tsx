import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export type SMSTemplateType =
  | "appointment_confirmation"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "payment_receipt";

export interface SMSTemplate {
  id: string;
  tenant_id: string;
  template_type: SMSTemplateType;
  message: string;
  is_active: boolean;
  auto_send_enabled: boolean;
  auto_send_trigger?: string; // e.g., "on_booking", "24h_before", "on_cancellation", "on_payment"
  created_at: string;
  updated_at: string;
}

export const smsTemplateTypeLabels: Record<SMSTemplateType, string> = {
  appointment_confirmation: "Confirmed booking text",
  appointment_reminder: "Appointment reminder text",
  appointment_cancelled: "Cancelled booking text",
  payment_receipt: "Payment receipt text",
};

export const smsTemplateAutoSendTriggers: Record<string, string> = {
  on_booking: "When appointment is booked",
  "24h_before": "24 hours before appointment",
  on_cancellation: "When appointment is cancelled",
  on_payment: "When payment is received",
};

// Available variables for SMS templates
export const smsTemplateVariables: Record<SMSTemplateType, string[]> = {
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

// Default SMS templates (160 chars limit for plain text)
export const defaultSMSTemplates: Record<
  SMSTemplateType,
  { message: string; auto_send_trigger?: string }
> = {
  appointment_confirmation: {
    message:
      "Hi {{customer_name}}, your appointment at {{salon_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. See you soon!",
    auto_send_trigger: "on_booking",
  },
  appointment_reminder: {
    message:
      "Reminder: Your appointment at {{salon_name}} is tomorrow at {{appointment_time}}. We look forward to seeing you!",
    auto_send_trigger: "24h_before",
  },
  appointment_cancelled: {
    message:
      "Hi {{customer_name}}, your appointment on {{appointment_date}} at {{salon_name}} has been cancelled. Contact us to reschedule.",
    auto_send_trigger: "on_cancellation",
  },
  payment_receipt: {
    message:
      "Thank you {{customer_name}}! Payment of {{amount}} received at {{salon_name}}. We appreciate your business!",
    auto_send_trigger: "on_payment",
  },
};

export function useSMSTemplates() {
  const { currentTenant } = useAuth();
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
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
        .from("sms_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("template_type", { ascending: true });

      if (fetchError) throw fetchError;

      setTemplates((data as SMSTemplate[]) || []);
    } catch (err) {
      console.error("Error fetching SMS templates:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const upsertTemplate = async (
    templateType: SMSTemplateType,
    data: {
      message: string;
      is_active?: boolean;
      auto_send_enabled?: boolean;
      auto_send_trigger?: string;
    }
  ) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: template, error } = await supabase
        .from("sms_templates")
        .upsert(
          {
            tenant_id: currentTenant.id,
            template_type: templateType,
            message: data.message,
            is_active: data.is_active ?? true,
            auto_send_enabled: data.auto_send_enabled ?? false,
            auto_send_trigger: data.auto_send_trigger,
          },
          { onConflict: "tenant_id,template_type" }
        )
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "SMS template saved" });
      await fetchTemplates();
      return template;
    } catch (err) {
      console.error("Error saving SMS template:", err);
      toast({
        title: "Error",
        description: "Failed to save SMS template",
        variant: "destructive",
      });
      return null;
    }
  };

  const getTemplate = (type: SMSTemplateType): SMSTemplate | undefined => {
    return templates.find((t) => t.template_type === type);
  };

  const getTemplateOrDefault = (
    type: SMSTemplateType
  ): { message: string; auto_send_trigger?: string } => {
    const template = getTemplate(type);
    if (template) {
      return {
        message: template.message,
        auto_send_trigger: template.auto_send_trigger,
      };
    }
    return defaultSMSTemplates[type];
  };

  return {
    templates,
    isLoading,
    error,
    refetch: fetchTemplates,
    upsertTemplate,
    getTemplate,
    getTemplateOrDefault,
  };
}
