import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  createTenantNotification,
  getSalonRecipients,
  getTenantNotificationSettings,
  sendResendEmail,
} from "../_shared/salon-notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { appointmentId, reason } = await req.json();
    if (!appointmentId || !reason?.trim()) {
      return new Response(JSON.stringify({ error: "Appointment and reason are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select(`
        id,
        tenant_id,
        customer_id,
        scheduled_start,
        location:locations(name, address, city),
        customer:customers(id, user_id, full_name, email),
        services:appointment_services(service_name)
      `)
      .eq("id", appointmentId)
      .single();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (appointment.customer?.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "You cannot cancel this appointment" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: cancelError } = await admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancellation_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    if (cancelError) {
      return new Response(JSON.stringify({ error: cancelError.message || "Failed to cancel appointment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await admin
      .from("tenants")
      .select("name, logo_url")
      .eq("id", appointment.tenant_id)
      .single();

    const servicesList = appointment.services?.map((service: { service_name: string }) => service.service_name).join(", ") || "appointment";
    const scheduledText = appointment.scheduled_start
      ? new Date(appointment.scheduled_start).toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "unscheduled booking";
    const locationName = appointment.location?.name || "selected branch";

    await createTenantNotification(admin, {
      tenantId: appointment.tenant_id,
      title: "Appointment Cancelled",
      description: `${appointment.customer?.full_name || "A customer"} cancelled ${servicesList} at ${locationName}.`,
      entityId: appointment.id,
      urgent: true,
    });

    const notificationSettings = await getTenantNotificationSettings(admin, appointment.tenant_id);
    if (notificationSettings.email_cancellations) {
      const recipients = await getSalonRecipients(admin, appointment.tenant_id, ["owner", "manager"]);
      if (recipients.length > 0) {
        await sendResendEmail({
          resendApiKey,
          fromEmail: resendFromEmail,
          to: recipients.map((recipient) => recipient.email),
          subject: `Client cancellation at ${tenant?.name || "your salon"}`,
          salonName: tenant?.name || "Salon Magik",
          salonLogoUrl: tenant?.logo_url,
          htmlContent: `
            <h2 style="color: #2563EB; margin-bottom: 16px;">Appointment cancelled by client</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Customer:</strong> ${appointment.customer?.full_name || "Unknown customer"}</p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>When:</strong> ${scheduledText}</p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Branch:</strong> ${locationName}</p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Items:</strong> ${servicesList}</p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Reason:</strong> ${reason.trim()}</p>
          `,
        });
      }
    }

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-appointment-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appointmentId,
          action: "cancelled",
          reason: reason.trim(),
        }),
      });
    } catch (error) {
      console.error("Failed to send customer cancellation email:", error);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in client-cancel-booking:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
