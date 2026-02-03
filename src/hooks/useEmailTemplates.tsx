import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export type TemplateType =
  | "appointment_confirmation"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "booking_confirmation"
  | "payment_receipt"
  | "refund_confirmation"
  | "staff_invitation"
  | "welcome";

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  template_type: TemplateType;
  subject: string;
  body_html: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const templateTypeLabels: Record<TemplateType, string> = {
  appointment_confirmation: "Appointment Confirmation",
  appointment_reminder: "Appointment Reminder",
  appointment_cancelled: "Appointment Cancelled",
  booking_confirmation: "Booking Confirmation",
  payment_receipt: "Payment Receipt",
  refund_confirmation: "Refund Confirmation",
  staff_invitation: "Staff Invitation",
  welcome: "Welcome Email",
};

export const defaultTemplates: Record<TemplateType, { subject: string; body_html: string }> = {
  appointment_confirmation: {
    subject: "Your appointment is confirmed!",
    body_html: `<h1>Appointment Confirmed</h1>
<p>Hi {{customer_name}},</p>
<p>Your appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.</p>
<p><strong>Service:</strong> {{service_name}}</p>
<p>We look forward to seeing you!</p>`,
  },
  appointment_reminder: {
    subject: "Reminder: Your appointment is coming up",
    body_html: `<h1>Appointment Reminder</h1>
<p>Hi {{customer_name}},</p>
<p>This is a reminder about your upcoming appointment on {{appointment_date}} at {{appointment_time}}.</p>
<p><strong>Service:</strong> {{service_name}}</p>
<p>See you soon!</p>`,
  },
  appointment_cancelled: {
    subject: "Your appointment has been cancelled",
    body_html: `<h1>Appointment Cancelled</h1>
<p>Hi {{customer_name}},</p>
<p>Your appointment scheduled for {{appointment_date}} has been cancelled.</p>
<p>If you'd like to reschedule, please contact us.</p>`,
  },
  booking_confirmation: {
    subject: "Booking confirmed!",
    body_html: `<h1>Booking Confirmed</h1>
<p>Hi {{customer_name}},</p>
<p>Thank you for booking with us! Your appointment is scheduled for {{appointment_date}} at {{appointment_time}}.</p>`,
  },
  payment_receipt: {
    subject: "Payment Receipt",
    body_html: `<h1>Payment Receipt</h1>
<p>Hi {{customer_name}},</p>
<p>Thank you for your payment of {{amount}}.</p>
<p>Transaction ID: {{transaction_id}}</p>`,
  },
  refund_confirmation: {
    subject: "Refund Processed",
    body_html: `<h1>Refund Confirmation</h1>
<p>Hi {{customer_name}},</p>
<p>Your refund of {{amount}} has been processed.</p>`,
  },
  staff_invitation: {
    subject: "You're invited to join {{salon_name}}",
    body_html: `<h1>Join Our Team</h1>
<p>Hi {{staff_name}},</p>
<p>You've been invited to join {{salon_name}} as a {{role}}.</p>
<p><a href="{{invitation_link}}">Accept Invitation</a></p>`,
  },
  welcome: {
    subject: "Welcome to {{salon_name}}!",
    body_html: `<h1>Welcome!</h1>
<p>Hi {{customer_name}},</p>
<p>Welcome to {{salon_name}}! We're excited to have you.</p>`,
  },
};

export function useEmailTemplates() {
  const { currentTenant } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
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
        .from("email_templates")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("template_type", { ascending: true });

      if (fetchError) throw fetchError;

      setTemplates((data as EmailTemplate[]) || []);
    } catch (err) {
      console.error("Error fetching email templates:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const upsertTemplate = async (
    templateType: TemplateType,
    data: { subject: string; body_html: string; is_active?: boolean }
  ) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const { data: template, error } = await supabase
        .from("email_templates")
        .upsert(
          {
            tenant_id: currentTenant.id,
            template_type: templateType,
            subject: data.subject,
            body_html: data.body_html,
            is_active: data.is_active ?? true,
          },
          { onConflict: "tenant_id,template_type" }
        )
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Success", description: "Template saved" });
      await fetchTemplates();
      return template;
    } catch (err) {
      console.error("Error saving template:", err);
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
      return null;
    }
  };

  const getTemplate = (type: TemplateType): EmailTemplate | undefined => {
    return templates.find((t) => t.template_type === type);
  };

  const getTemplateOrDefault = (type: TemplateType): { subject: string; body_html: string } => {
    const template = getTemplate(type);
    if (template) {
      return { subject: template.subject, body_html: template.body_html };
    }
    return defaultTemplates[type];
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
