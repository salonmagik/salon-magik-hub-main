import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AppointmentAction = "scheduled" | "completed" | "cancelled" | "rescheduled";

interface NotificationRequest {
  appointmentId: string;
  action: AppointmentAction;
  reason?: string;
  newDate?: string;
  newTime?: string;
}

// Default email templates
const defaultTemplates: Record<AppointmentAction, { subject: string; body: string }> = {
  scheduled: {
    subject: "Appointment Confirmed at {{salon_name}}",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #E11D48;">Appointment Confirmed!</h1>
        <p>Hi {{customer_name}},</p>
        <p>Your appointment at <strong>{{salon_name}}</strong> has been confirmed.</p>
        
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Date:</strong> {{appointment_date}}</p>
          <p style="margin: 8px 0 0;"><strong>Time:</strong> {{appointment_time}}</p>
          <p style="margin: 8px 0 0;"><strong>Services:</strong> {{services}}</p>
          <p style="margin: 8px 0 0;"><strong>Total:</strong> {{total_amount}}</p>
          <p style="margin: 8px 0 0;"><strong>Location:</strong> {{location}}</p>
        </div>
        
        <p style="color: #666;">We look forward to seeing you!</p>
        <p style="color: #999; font-size: 12px;">If you need to reschedule or cancel, please contact us.</p>
      </div>
    `,
  },
  completed: {
    subject: "Thank you for visiting {{salon_name}}!",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #E11D48;">Thank You for Visiting!</h1>
        <p>Hi {{customer_name}},</p>
        <p>Your appointment at <strong>{{salon_name}}</strong> has been completed.</p>
        
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Services:</strong> {{services}}</p>
          <p style="margin: 8px 0 0;"><strong>Total:</strong> {{total_amount}}</p>
        </div>
        
        <p style="color: #666;">We hope you enjoyed your visit and look forward to seeing you again soon!</p>
      </div>
    `,
  },
  cancelled: {
    subject: "Appointment Cancelled at {{salon_name}}",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #E11D48;">Appointment Cancelled</h1>
        <p>Hi {{customer_name}},</p>
        <p>Your appointment at <strong>{{salon_name}}</strong> has been cancelled.</p>
        
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Original Date:</strong> {{appointment_date}}</p>
          <p style="margin: 8px 0 0;"><strong>Services:</strong> {{services}}</p>
          {{#if reason}}
          <p style="margin: 8px 0 0;"><strong>Reason:</strong> {{reason}}</p>
          {{/if}}
        </div>
        
        <p style="color: #666;">We hope to serve you again in the future.</p>
        <p style="color: #999; font-size: 12px;">If you have any questions, please contact us.</p>
      </div>
    `,
  },
  rescheduled: {
    subject: "Appointment Rescheduled at {{salon_name}}",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #E11D48;">Appointment Rescheduled</h1>
        <p>Hi {{customer_name}},</p>
        <p>Your appointment at <strong>{{salon_name}}</strong> has been rescheduled.</p>
        
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>New Date:</strong> {{new_date}}</p>
          <p style="margin: 8px 0 0;"><strong>New Time:</strong> {{new_time}}</p>
          <p style="margin: 8px 0 0;"><strong>Services:</strong> {{services}}</p>
          <p style="margin: 8px 0 0;"><strong>Total:</strong> {{total_amount}}</p>
        </div>
        
        <p style="color: #666;">See you at the new time!</p>
      </div>
    `,
  },
};

// Map action to template type
const actionToTemplateType: Record<AppointmentAction, string> = {
  scheduled: "appointment_confirmation",
  completed: "appointment_completed",
  cancelled: "appointment_cancelled",
  rescheduled: "appointment_rescheduled",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { appointmentId, action, reason, newDate, newTime }: NotificationRequest = await req.json();

    // Validate required fields
    if (!appointmentId || !action) {
      throw new Error("Missing required fields: appointmentId and action");
    }

    if (!["scheduled", "completed", "cancelled", "rescheduled"].includes(action)) {
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

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, currency")
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

    // Send email via Resend API directly
    const fromEmailEnv = Deno.env.get("RESEND_FROM_EMAIL");
    
    // Validate and use the from email - must be a valid email address
    let fromEmail = "onboarding@resend.dev";
    if (fromEmailEnv && fromEmailEnv.includes("@") && fromEmailEnv.includes(".")) {
      fromEmail = fromEmailEnv.trim();
    }
    
    // Sanitize tenant name - remove characters that could break email format
    const sanitizedTenantName = (tenant?.name || "SalonMagik")
      .replace(/[<>"\n\r]/g, "")
      .trim();
    
    // Build the from address in proper format
    const fromAddress = sanitizedTenantName 
      ? `${sanitizedTenantName} <${fromEmail}>`
      : fromEmail;
    
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
        html: emailBody,
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
