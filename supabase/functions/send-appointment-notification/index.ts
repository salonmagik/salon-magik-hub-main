import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFromAddress } from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AppointmentAction = "scheduled" | "completed" | "cancelled" | "rescheduled" | "reminder";

interface NotificationRequest {
  appointmentId: string;
  action: AppointmentAction;
  reason?: string;
  newDate?: string;
  newTime?: string;
}

// Salon Magik Design System
const STYLES = {
  primaryColor: "#2563EB",
  textColor: "#1f2937",
  textMuted: "#4b5563",
  textLight: "#6b7280",
  textLighter: "#9ca3af",
  surfaceColor: "#f5f7fa",
  borderColor: "#e5e7eb",
  fontFamily: "'Questrial', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

// Build email wrapper with salon branding
function buildEmailWrapper(
  content: string,
  salonName: string,
  salonLogoUrl?: string
): string {
  // Header with salon branding
  let headerSection = `
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: ${STYLES.primaryColor}; margin: 0 0 8px 0; font-size: 28px; font-family: ${STYLES.fontFamily};">${salonName}</h1>
      <p style="color: ${STYLES.textMuted}; font-size: 12px; margin: 0; font-family: ${STYLES.fontFamily};">Powered by Salon Magik</p>
    </div>
  `;

  if (salonLogoUrl) {
    headerSection = `
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${salonLogoUrl}" alt="${salonName} Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;" />
        <p style="color: ${STYLES.textMuted}; font-size: 12px; margin: 0; font-family: ${STYLES.fontFamily};">Powered by Salon Magik</p>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Questrial&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${STYLES.surfaceColor}; font-family: ${STYLES.fontFamily};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${headerSection}
          
          <div style="font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};">
            ${content}
          </div>
          
          <hr style="border: none; border-top: 1px solid ${STYLES.borderColor}; margin: 32px 0;" />
          
          <p style="color: ${STYLES.textLighter}; font-size: 12px; text-align: center; font-family: ${STYLES.fontFamily};">
            © 2026 Salon Magik. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Default email templates
const defaultTemplates: Record<AppointmentAction, { subject: string; body: string }> = {
  scheduled: {
    subject: "Appointment Confirmed at {{salon_name}}",
    body: `
      <h2 style="color: ${STYLES.primaryColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Appointment Confirmed!</h2>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Hi {{customer_name}},</p>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Your appointment at <strong>{{salon_name}}</strong> has been confirmed.</p>
      
      <div style="background: ${STYLES.surfaceColor}; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid ${STYLES.primaryColor};">
        <p style="margin: 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Date:</strong> {{appointment_date}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Time:</strong> {{appointment_time}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Services:</strong> {{services}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Total:</strong> {{total_amount}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Location:</strong> {{location}}</p>
      </div>
      
      <p style="color: ${STYLES.textLight}; font-size: 14px; font-family: ${STYLES.fontFamily};">We look forward to seeing you!</p>
      <p style="color: ${STYLES.textLighter}; font-size: 12px; font-family: ${STYLES.fontFamily};">If you need to reschedule or cancel, please contact us.</p>
    `,
  },
  completed: {
    subject: "Thank you for visiting {{salon_name}}!",
    body: `
      <h2 style="color: ${STYLES.primaryColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Thank You for Visiting!</h2>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Hi {{customer_name}},</p>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Your appointment at <strong>{{salon_name}}</strong> has been completed.</p>
      
      <div style="background: ${STYLES.surfaceColor}; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid ${STYLES.primaryColor};">
        <p style="margin: 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Services:</strong> {{services}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Total:</strong> {{total_amount}}</p>
      </div>
      
      <p style="color: ${STYLES.textLight}; font-size: 14px; font-family: ${STYLES.fontFamily};">We hope you enjoyed your visit and look forward to seeing you again soon!</p>
    `,
  },
  cancelled: {
    subject: "Appointment Cancelled at {{salon_name}}",
    body: `
      <h2 style="color: ${STYLES.primaryColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Appointment Cancelled</h2>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Hi {{customer_name}},</p>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Your appointment at <strong>{{salon_name}}</strong> has been cancelled.</p>
      
      <div style="background: ${STYLES.surfaceColor}; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid ${STYLES.primaryColor};">
        <p style="margin: 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Original Date:</strong> {{appointment_date}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Services:</strong> {{services}}</p>
        {{#if reason}}
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Reason:</strong> {{reason}}</p>
        {{/if}}
      </div>
      
      <p style="color: ${STYLES.textLight}; font-size: 14px; font-family: ${STYLES.fontFamily};">We hope to serve you again in the future.</p>
      <p style="color: ${STYLES.textLighter}; font-size: 12px; font-family: ${STYLES.fontFamily};">If you have any questions, please contact us.</p>
    `,
  },
  rescheduled: {
    subject: "Appointment Rescheduled at {{salon_name}}",
    body: `
      <h2 style="color: ${STYLES.primaryColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Appointment Rescheduled</h2>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Hi {{customer_name}},</p>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Your appointment at <strong>{{salon_name}}</strong> has been rescheduled.</p>
      
      <div style="background: ${STYLES.surfaceColor}; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid ${STYLES.primaryColor};">
        <p style="margin: 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>New Date:</strong> {{new_date}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>New Time:</strong> {{new_time}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Services:</strong> {{services}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Total:</strong> {{total_amount}}</p>
      </div>
      
      <p style="color: ${STYLES.textLight}; font-size: 14px; font-family: ${STYLES.fontFamily};">See you at the new time!</p>
    `,
  },
  reminder: {
    subject: "Reminder: Upcoming Appointment at {{salon_name}}",
    body: `
      <h2 style="color: ${STYLES.primaryColor}; margin-bottom: 16px; font-size: 24px; font-family: ${STYLES.fontFamily};">Appointment Reminder</h2>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">Hi {{customer_name}},</p>
      <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">This is a friendly reminder about your upcoming appointment at <strong>{{salon_name}}</strong>.</p>
      
      <div style="background: ${STYLES.surfaceColor}; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid ${STYLES.primaryColor};">
        <p style="margin: 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Date:</strong> {{appointment_date}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Time:</strong> {{appointment_time}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Services:</strong> {{services}}</p>
        <p style="margin: 8px 0 0; font-family: ${STYLES.fontFamily}; color: ${STYLES.textColor};"><strong>Location:</strong> {{location}}</p>
      </div>
      
      <p style="color: ${STYLES.textLight}; font-size: 14px; font-family: ${STYLES.fontFamily};">We look forward to seeing you!</p>
      <p style="color: ${STYLES.textLighter}; font-size: 12px; font-family: ${STYLES.fontFamily};">If you need to reschedule or cancel, please contact us as soon as possible.</p>
    `,
  },
};

// Map action to template type
const actionToTemplateType: Record<AppointmentAction, string> = {
  scheduled: "appointment_confirmation",
  completed: "appointment_completed",
  cancelled: "appointment_cancelled",
  rescheduled: "appointment_rescheduled",
  reminder: "appointment_reminder",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { appointmentId, action, reason, newDate, newTime }: NotificationRequest = await req.json();

    // Validate required fields
    if (!appointmentId || !action) {
      throw new Error("Missing required fields: appointmentId and action");
    }

    if (!["scheduled", "completed", "cancelled", "rescheduled", "reminder"].includes(action)) {
      throw new Error("Invalid action type");
    }

    // Fetch appointment with customer, services, and tenant details
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select(`
        *,
        customer:customers(id, full_name, email),
        services:appointment_services(service_name, price),
        location:locations(name, address, city)
      `)
      .eq("id", appointmentId)
      .single();

    if (aptError || !appointment) {
      console.error("Failed to fetch appointment:", aptError);
      throw new Error("Appointment not found");
    }

    // Get customer email
    const customerEmail = appointment.customer?.email;
    if (!customerEmail) {
      console.log("No customer email found, skipping notification");
      return new Response(
        JSON.stringify({ success: false, message: "No customer email" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch tenant info including logo
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, currency, logo_url")
      .eq("id", appointment.tenant_id)
      .single();

    // Try to fetch custom template
    const templateType = actionToTemplateType[action];
    const { data: customTemplate } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("tenant_id", appointment.tenant_id)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .single();

    // Use custom template or default
    const template = customTemplate 
      ? { subject: customTemplate.subject, body: customTemplate.body_html }
      : defaultTemplates[action];

    // Format appointment data for template
    const servicesList = appointment.services?.map((s: any) => s.service_name).join(", ") || "N/A";
    const totalAmount = `${tenant?.currency || "USD"} ${Number(appointment.total_amount).toFixed(2)}`;
    const locationText = appointment.location 
      ? `${appointment.location.name}${appointment.location.address ? `, ${appointment.location.address}` : ""}${appointment.location.city ? `, ${appointment.location.city}` : ""}`
      : "N/A";

    // Format dates
    let appointmentDate = "TBD";
    let appointmentTime = "TBD";
    if (appointment.scheduled_start) {
      const date = new Date(appointment.scheduled_start);
      appointmentDate = date.toLocaleDateString("en-US", { 
        weekday: "long", 
        year: "numeric", 
        month: "long", 
        day: "numeric" 
      });
      appointmentTime = date.toLocaleTimeString("en-US", { 
        hour: "numeric", 
        minute: "2-digit", 
        hour12: true 
      });
    }

    // Replace template variables
    let emailSubject = template.subject;
    let emailBody = template.body;

    const replacements: Record<string, string> = {
      "{{customer_name}}": appointment.customer?.full_name || "Valued Customer",
      "{{salon_name}}": tenant?.name || "Our Salon",
      "{{appointment_date}}": appointmentDate,
      "{{appointment_time}}": appointmentTime,
      "{{services}}": servicesList,
      "{{total_amount}}": totalAmount,
      "{{location}}": locationText,
      "{{reason}}": reason || "Not specified",
      "{{new_date}}": newDate || appointmentDate,
      "{{new_time}}": newTime || appointmentTime,
    };

    for (const [key, value] of Object.entries(replacements)) {
      emailSubject = emailSubject.replace(new RegExp(key, "g"), value);
      emailBody = emailBody.replace(new RegExp(key, "g"), value);
    }

    // Handle conditional blocks (simple implementation)
    emailBody = emailBody.replace(/\{\{#if reason\}\}([\s\S]*?)\{\{\/if\}\}/g, 
      reason ? "$1" : "");

    // Wrap content with salon branding
    const fullEmailHtml = buildEmailWrapper(
      emailBody,
      tenant?.name || "Salon Magik",
      tenant?.logo_url || undefined
    );

    const fromAddress = buildFromAddress({
      mode: "salon",
      salonName: tenant?.name || "Salon Magik",
      fromEmail,
    });
    
    console.log("Sending email with from address:", fromAddress);
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [customerEmail],
        subject: emailSubject,
        html: fullEmailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailData);
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailData);

    // Log to message_logs table
    await supabase.from("message_logs").insert({
      tenant_id: appointment.tenant_id,
      customer_id: appointment.customer?.id,
      channel: "email",
      template_type: templateType,
      recipient: customerEmail,
      subject: emailSubject,
      status: "sent",
      sent_at: new Date().toISOString(),
      credits_used: 1,
    });

    // Update last_reminder_sent_at if this is a reminder
    if (action === "reminder") {
      await supabase
        .from("appointments")
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq("id", appointmentId);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-appointment-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
