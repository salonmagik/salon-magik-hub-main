import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export type TemplateType =
  | "appointment_confirmation"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "booking_confirmation"
  | "payment_receipt"
  | "refund_confirmation"
  | "staff_invitation"
  | "welcome"
  | "password_reset"
  | "password_changed"
  | "email_verification"
  | "welcome_owner"
  | "service_started"
  | "buffer_requested"
  | "service_change_approval"
  | "trial_ending_7d"
  | "trial_ending_3h"
  | "payment_failed"
  | "store_credit_restored"
  | "gift_received"
  | "voucher_applied";

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
  password_reset: "Password Reset",
  password_changed: "Password Changed",
  email_verification: "Email Verification",
  welcome_owner: "Welcome (Salon Owner)",
  service_started: "Service Started",
  buffer_requested: "Buffer Requested",
  service_change_approval: "Service Change Approval",
  trial_ending_7d: "Trial Ending (7 Days)",
  trial_ending_3h: "Trial Ending (3 Hours)",
  payment_failed: "Payment Failed",
  store_credit_restored: "Store Credit Restored",
  gift_received: "Gift Received",
  voucher_applied: "Voucher Applied",
};

export const templateTypeCategories: Record<string, TemplateType[]> = {
  "Appointments": [
    "appointment_confirmation",
    "appointment_reminder",
    "appointment_cancelled",
    "booking_confirmation",
    "service_started",
    "buffer_requested",
    "service_change_approval",
  ],
  "Authentication": [
    "welcome",
    "welcome_owner",
    "email_verification",
    "password_reset",
    "password_changed",
    "staff_invitation",
  ],
  "Payments": [
    "payment_receipt",
    "refund_confirmation",
    "store_credit_restored",
    "gift_received",
    "voucher_applied",
  ],
  "Subscription": [
    "trial_ending_7d",
    "trial_ending_3h",
    "payment_failed",
  ],
};

const salonMagikBrandWrapper = (content: string) => `<div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #E11D48; font-style: italic; margin: 0; font-size: 32px;">Salon Magik</h1>
  </div>
  
  ${content}
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    © 2025 Salon Magik. All rights reserved.
  </p>
</div>`;

export const defaultTemplates: Record<TemplateType, { subject: string; body_html: string }> = {
  appointment_confirmation: {
    subject: "Appointment confirmed at {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Appointment Confirmed</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your appointment has been confirmed.</p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Service:</strong> {{service_name}}</p>
        <p style="margin: 0 0 8px 0;"><strong>Date:</strong> {{appointment_date}}</p>
        <p style="margin: 0 0 8px 0;"><strong>Time:</strong> {{appointment_time}}</p>
        <p style="margin: 0;"><strong>Location:</strong> {{location_name}}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{cta_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Manage Booking</a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">We look forward to seeing you!</p>
    `),
  },
  appointment_reminder: {
    subject: "Reminder: upcoming appointment at {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Appointment Reminder</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Just a reminder about your upcoming appointment.</p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Service:</strong> {{service_name}}</p>
        <p style="margin: 0 0 8px 0;"><strong>Date:</strong> {{appointment_date}}</p>
        <p style="margin: 0;"><strong>Time:</strong> {{appointment_time}}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{cta_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">I'm on my way</a>
      </div>
    `),
  },
  appointment_cancelled: {
    subject: "Your appointment has been cancelled",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Appointment Cancelled</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your appointment scheduled for {{appointment_date}} has been cancelled.</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">If you'd like to reschedule, please contact us or book online.</p>
    `),
  },
  booking_confirmation: {
    subject: "Booking confirmed at {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Booking Confirmed</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Thank you for booking with us! Your appointment is scheduled for {{appointment_date}} at {{appointment_time}}.</p>
    `),
  },
  payment_receipt: {
    subject: "Payment Receipt from {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Payment Receipt</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Thank you for your payment.</p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Amount:</strong> {{amount}}</p>
        <p style="margin: 0;"><strong>Transaction ID:</strong> {{transaction_id}}</p>
      </div>
    `),
  },
  refund_confirmation: {
    subject: "Refund Processed from {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Refund Processed</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your refund of {{amount}} has been processed.</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Method:</strong> {{refund_method}}</p>
    `),
  },
  staff_invitation: {
    subject: "You're invited to join {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Join Our Team</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{staff_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">You've been invited to join <strong>{{salon_name}}</strong> as a <strong>{{role}}</strong>.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{invitation_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Accept Invitation</a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This invitation expires in 7 days.</p>
    `),
  },
  welcome: {
    subject: "Welcome to {{salon_name}}!",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Welcome!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Welcome to {{salon_name}}! We're excited to have you.</p>
    `),
  },
  password_reset: {
    subject: "Reset your Salon Magik password",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Reset Your Password</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi there,</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">We received a request to reset your password. Click the button below:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{reset_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Reset Password</a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour.</p>
    `),
  },
  password_changed: {
    subject: "Your Salon Magik password has been changed",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Password Changed</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi there,</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your password has been successfully changed.</p>
      <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #E11D48;">
        <p style="color: #991b1b; margin: 0; font-size: 14px;"><strong>Didn't make this change?</strong> Contact support immediately.</p>
      </div>
    `),
  },
  email_verification: {
    subject: "Verify your email for Salon Magik",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Verify Your Email</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{first_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Please verify your email address to get started:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{verification_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Verify Email</a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
    `),
  },
  welcome_owner: {
    subject: "Welcome to Salon Magik",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Welcome to Salon Magik!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{first_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">You're officially in.</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Salon Magik helps you manage bookings, payments, and customers without chaos.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{cta_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Complete Setup</a>
      </div>
      <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #991b1b; margin: 0; font-size: 14px;"><strong>🎉 Your 14-day free trial has started!</strong><br/>No credit card required.</p>
      </div>
    `),
  },
  service_started: {
    subject: "Your service at {{salon_name}} has started",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Service Started</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your service at {{salon_name}} has started. Enjoy!</p>
    `),
  },
  buffer_requested: {
    subject: "{{salon_name}} has requested a buffer",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Buffer Requested</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">{{salon_name}} has requested a {{buffer_duration}} minute buffer.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{accept_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500; margin-right: 12px;">Accept</a>
        <a href="{{reschedule_link}}" style="background-color: #6b7280; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Suggest Reschedule</a>
      </div>
    `),
  },
  service_change_approval: {
    subject: "Approval needed for service update at {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Service Change Requested</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">{{salon_name}} has requested a change to your service.</p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Original service:</strong> {{old_service}}</p>
        <p style="margin: 0 0 8px 0;"><strong>Updated service:</strong> {{new_service}}</p>
        <p style="margin: 0;"><strong>Price difference:</strong> {{amount}}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{approve_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Approve Change</a>
      </div>
    `),
  },
  trial_ending_7d: {
    subject: "Your Salon Magik trial ends soon",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Your Trial is Ending</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{first_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">You're enjoying Salon Magik. Your trial ends in 7 days.</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Add a card to continue without interruption and keep your discount.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{cta_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Add Card</a>
      </div>
    `),
  },
  trial_ending_3h: {
    subject: "Trial ending in 3 hours",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Trial Ending Soon!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{first_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Add your card now to avoid losing access and your discount.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{cta_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Add Card</a>
      </div>
    `),
  },
  payment_failed: {
    subject: "Action needed: payment failed",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Payment Failed</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{first_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">We couldn't process your payment. Please update your card to keep your salon running.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{cta_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">Retry Payment</a>
      </div>
    `),
  },
  store_credit_restored: {
    subject: "Store credit restored at {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Store Credit Added</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">{{amount}} has been added back to your store credit at {{salon_name}}.</p>
    `),
  },
  gift_received: {
    subject: "You've received a gift 🎁",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">You've Received a Gift!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{recipient_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">You've received a gift from {{sender_name}}.</p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0; font-style: italic;">
        <p style="color: #4b5563; margin: 0;">"{{custom_message}}"</p>
      </div>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Service:</strong> {{service_name}}</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{view_link}}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">View Gift</a>
      </div>
    `),
  },
  voucher_applied: {
    subject: "Voucher applied successfully at {{salon_name}}",
    body_html: salonMagikBrandWrapper(`
      <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Voucher Applied</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{customer_name}},</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your voucher has been applied to your booking at {{salon_name}}.</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Enjoy your service!</p>
    `),
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
