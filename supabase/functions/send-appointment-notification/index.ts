import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate, EMAIL_STYLES } from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AppointmentAction =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "reminder"
  | "branch_unavailable";

interface NotificationRequest {
  appointmentId: string;
  action: AppointmentAction;
  reason?: string;
  newDate?: string;
  newTime?: string;
}

const P = EMAIL_STYLES.primaryColor;   // #2E1F4E brand purple
const A = EMAIL_STYLES.accentColor;    // #F4C84E gold
const T = EMAIL_STYLES.textMuted;
const S = EMAIL_STYLES.surfaceColor;
const F = EMAIL_STYLES.fontFamily;

function infoBox(rows: string): string {
  return `<div style="background:${S};border-radius:10px;padding:20px 24px;margin:24px 0;border-left:4px solid ${P};font-family:${F};font-size:15px;line-height:1.6;color:${EMAIL_STYLES.textColor};">${rows}</div>`;
}
function row(label: string, value: string): string {
  return `<p style="margin:0 0 8px;font-family:${F};"><strong>${label}:</strong> ${value}</p>`;
}
function heading(text: string): string {
  return `<h2 style="color:${P};margin:0 0 20px;font-size:24px;font-weight:700;font-family:${F};">${text}</h2>`;
}
function para(text: string): string {
  return `<p style="color:${T};font-size:16px;line-height:1.7;margin:0 0 16px;font-family:${F};">${text}</p>`;
}

const defaultTemplates: Record<AppointmentAction, { subject: string; body: string }> = {
  scheduled: {
    subject: "Appointment Confirmed at {{salon_name}}",
    body: `
      ${heading("Appointment Confirmed!")}
      ${para("Hi {{customer_name}},")}
      ${para("Your appointment at <strong>{{salon_name}}</strong> has been confirmed.")}
      ${infoBox(`
        ${row("Date", "{{appointment_date}}")}
        ${row("Time", "{{appointment_time}}")}
        ${row("Services", "{{services}}")}
        ${row("Total", "{{total_amount}}")}
        ${row("Location", "{{location}}")}
      `)}
      ${para("We look forward to seeing you!")}
    `,
  },
  completed: {
    subject: "Thank you for visiting {{salon_name}}!",
    body: `
      ${heading("Thank You for Visiting!")}
      ${para("Hi {{customer_name}},")}
      ${para("Your appointment at <strong>{{salon_name}}</strong> has been completed.")}
      ${infoBox(`
        ${row("Services", "{{services}}")}
        ${row("Total", "{{total_amount}}")}
      `)}
      ${para("We hope you enjoyed your visit and look forward to seeing you again soon!")}
    `,
  },
  cancelled: {
    subject: "Appointment Cancelled at {{salon_name}}",
    body: `
      ${heading("Appointment Cancelled")}
      ${para("Hi {{customer_name}},")}
      ${para("Your appointment at <strong>{{salon_name}}</strong> has been cancelled.")}
      ${infoBox(`
        ${row("Original Date", "{{appointment_date}}")}
        ${row("Services", "{{services}}")}
        {{#if reason}}${row("Reason", "{{reason}}")}{{/if}}
      `)}
      ${para("We hope to serve you again soon. Please don't hesitate to get in touch if you have any questions.")}
    `,
  },
  rescheduled: {
    subject: "Appointment Rescheduled at {{salon_name}}",
    body: `
      ${heading("Appointment Rescheduled")}
      ${para("Hi {{customer_name}},")}
      ${para("Your appointment at <strong>{{salon_name}}</strong> has been rescheduled.")}
      ${infoBox(`
        ${row("New Date", "{{new_date}}")}
        ${row("New Time", "{{new_time}}")}
        ${row("Services", "{{services}}")}
        ${row("Total", "{{total_amount}}")}
      `)}
      ${para("See you at the new time!")}
    `,
  },
  reminder: {
    subject: "Reminder: Your Appointment at {{salon_name}}",
    body: `
      ${heading("Appointment Reminder")}
      ${para("Hi {{customer_name}},")}
      ${para("This is a friendly reminder about your upcoming appointment at <strong>{{salon_name}}</strong>.")}
      ${infoBox(`
        ${row("Date", "{{appointment_date}}")}
        ${row("Time", "{{appointment_time}}")}
        ${row("Services", "{{services}}")}
        ${row("Location", "{{location}}")}
      `)}
      ${para("We look forward to seeing you! If you need to reschedule or cancel, please contact us as soon as possible.")}
    `,
  },
  branch_unavailable: {
    subject: "Action Needed: Your {{salon_name}} Appointment",
    body: `
      ${heading("Please Reschedule Your Appointment")}
      ${para("Hi {{customer_name}},")}
      ${para("One of our branches is temporarily unavailable, so your appointment needs to be rescheduled. We're sorry for the inconvenience.")}
      ${infoBox(`
        ${row("Original Date", "{{appointment_date}}")}
        ${row("Original Time", "{{appointment_time}}")}
        ${row("Services", "{{services}}")}
        {{#if reason}}${row("How to reschedule", "{{reason}}")}{{/if}}
      `)}
      ${para("We appreciate your understanding and look forward to seeing you soon.")}
    `,
  },
};

const actionToTemplateType: Record<AppointmentAction, string> = {
  scheduled: "appointment_confirmation",
  completed: "appointment_completed",
  cancelled: "appointment_cancelled",
  rescheduled: "appointment_rescheduled",
  reminder: "appointment_reminder",
  branch_unavailable: "appointment_rescheduled",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { appointmentId, action, reason, newDate, newTime }: NotificationRequest = await req.json();

    if (!appointmentId || !action) {
      throw new Error("Missing required fields: appointmentId and action");
    }

    if (!["scheduled", "completed", "cancelled", "rescheduled", "reminder", "branch_unavailable"].includes(action)) {
      throw new Error("Invalid action type");
    }

    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select(`
        *,
        customer:customers!appointments_customer_id_fkey(id, full_name, email),
        services:appointment_services(service_name, price),
        location:locations(name, address, city),
        tenant:tenants!tenant_id(name, currency, logo_url, banner_urls, plan)
      `)
      .eq("id", appointmentId)
      .single();

    if (aptError || !appointment) {
      console.error("Failed to fetch appointment:", JSON.stringify(aptError));
      throw new Error(`Appointment not found: ${aptError?.message || "unknown"}`);
    }

    const customerEmail = appointment.customer?.email;
    if (!customerEmail) {
      console.log("No customer email found, skipping notification");
      return new Response(
        JSON.stringify({ success: false, message: "No customer email" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant = (appointment as any).tenant as { name: string; currency: string; logo_url: string | null; banner_urls: string[] | null; plan: string } | null;
    if (!tenant) {
      console.error("Tenant not found for appointment:", appointment.id, "tenant_id:", appointment.tenant_id);
    }

    const templateType = actionToTemplateType[action];
    const { data: customTemplate } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("tenant_id", appointment.tenant_id)
      .eq("template_type", templateType)
      .eq("is_active", true)
      .single();

    const template = customTemplate
      ? { subject: customTemplate.subject, body: customTemplate.body_html }
      : defaultTemplates[action];

    const servicesList = appointment.services?.map((s: { service_name: string }) => s.service_name).join(", ") || "N/A";
    const totalAmount = `${tenant?.currency || "GHS"} ${Number(appointment.total_amount).toFixed(2)}`;
    const locationText = appointment.location
      ? `${appointment.location.name}${appointment.location.address ? `, ${appointment.location.address}` : ""}${appointment.location.city ? `, ${appointment.location.city}` : ""}`
      : "N/A";

    let appointmentDate = "TBD";
    let appointmentTime = "TBD";
    if (appointment.scheduled_start) {
      const date = new Date(appointment.scheduled_start);
      appointmentDate = date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      appointmentTime = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

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

    emailBody = emailBody.replace(/\{\{#if reason\}\}([\s\S]*?)\{\{\/if\}\}/g, reason ? "$1" : "");

    // For chain plan tenants, prepend a branch chip to the email body
    const salonName = tenant?.name || "Our Salon";
    const isChain = tenant?.plan === "chain";
    const locationName = appointment.location?.name;
    const branchChip = isChain && locationName
      ? `<p style="margin:0 0 20px;"><span style="display:inline-block;padding:6px 14px;border-radius:9999px;background:${EMAIL_STYLES.primaryLight};color:${P};font-size:12px;font-weight:600;font-family:${F};">Branch: ${locationName}</span></p>`
      : "";

    const fullEmailHtml = wrapEmailTemplate(branchChip + emailBody, {
      mode: "salon",
      salonName,
      salonLogoUrl: tenant?.logo_url ?? undefined,
      salonBannerUrl: tenant?.banner_urls?.[0] ?? undefined,
    });

    const fromAddress = buildFromAddress({
      mode: "salon",
      salonName,
      fromEmail,
    });

    console.log("Sending email with from address:", fromAddress);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
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

    await supabase.from("message_logs").insert({
      tenant_id: appointment.tenant_id,
      customer_id: appointment.customer?.id,
      channel: "email",
      template_type: templateType,
      recipient: customerEmail,
      subject: emailSubject,
      status: "sent",
      sent_at: new Date().toISOString(),
      provider: "resend",
      initiated_by: "system",
      credits_used: 0,
    });

    if (action === "reminder") {
      await supabase
        .from("appointments")
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq("id", appointmentId);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in send-appointment-notification function:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
