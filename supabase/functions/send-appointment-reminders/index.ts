/**
 * send-appointment-reminders
 *
 * Called by pg_cron every 30 minutes. Finds appointments whose reminder
 * window has opened (scheduled_start is within reminder_hours_before hours
 * from now) and sends email + SMS (if enabled) to the customer.
 *
 * Idempotency: uses last_reminder_sent_at on the appointment row to avoid
 * duplicate sends. A reminder is sent at most once per appointment.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendArkeselSMS, resolveArkeselSenderId } from "../_shared/arkesel-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();

    // Load all active tenants with their notification settings
    const { data: settings, error: settingsError } = await supabase
      .from("notification_settings")
      .select(
        "tenant_id, email_appointment_reminders, sms_appointment_reminders, reminder_hours_before",
      );

    if (settingsError) {
      console.error("Failed to load notification settings:", settingsError);
      return new Response(JSON.stringify({ error: settingsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;
    let smsSent = 0;
    let errors = 0;

    for (const setting of settings ?? []) {
      const hoursAhead = setting.reminder_hours_before ?? 24;
      const windowEnd = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
      // Give a 30-minute buffer backwards so a reminder doesn't get skipped
      // if the cron fires slightly late.
      const windowStart = new Date(now.getTime() - 30 * 60 * 1000);

      // Find appointments needing a reminder in this tenant
      const { data: appointments, error: apptError } = await supabase
        .from("appointments")
        .select(
          "id, tenant_id, customer_id, scheduled_start, last_reminder_sent_at, customers(full_name, email, phone)",
        )
        .eq("tenant_id", setting.tenant_id)
        .eq("status", "scheduled")
        .gte("scheduled_start", windowStart.toISOString())
        .lte("scheduled_start", windowEnd.toISOString())
        .is("last_reminder_sent_at", null);

      if (apptError) {
        console.error(
          `Failed to fetch appointments for tenant ${setting.tenant_id}:`,
          apptError,
        );
        errors++;
        continue;
      }

      // Fetch tenant info for SMS sender name
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, sms_sender_name, currency")
        .eq("id", setting.tenant_id)
        .maybeSingle();

      for (const appt of appointments ?? []) {
        const customer = appt.customers as {
          full_name: string | null;
          email: string | null;
          phone: string | null;
        } | null;

        // Email reminder
        if (setting.email_appointment_reminders && customer?.email) {
          try {
            await fetch(
              `${supabaseUrl}/functions/v1/send-appointment-notification`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  appointmentId: appt.id,
                  action: "reminder",
                }),
              },
            );
            emailsSent++;
          } catch (err) {
            console.error(
              `Email reminder failed for appointment ${appt.id}:`,
              err,
            );
            errors++;
          }
        }

        // SMS reminder
        if (setting.sms_appointment_reminders && customer?.phone) {
          try {
            const senderName = resolveArkeselSenderId(customer.phone, tenant?.sms_sender_name);

            const apptDate = appt.scheduled_start
              ? new Date(appt.scheduled_start).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : "your upcoming appointment";

            const message =
              `Hi ${customer.full_name?.split(" ")[0] || "there"}, ` +
              `this is a reminder about your appointment at ${tenant?.name || "our salon"} ` +
              `on ${apptDate}. See you soon!`;

            await sendArkeselSMS({
              to: customer.phone,
              from: senderName,
              message,
            });
            smsSent++;
          } catch (err) {
            console.error(
              `SMS reminder failed for appointment ${appt.id}:`,
              err,
            );
            errors++;
          }
        }

        // Mark reminder as sent regardless of which channels succeeded,
        // so we don't retry endlessly on a bad phone/email.
        await supabase
          .from("appointments")
          .update({ last_reminder_sent_at: now.toISOString() })
          .eq("id", appt.id);
      }
    }

    console.log(
      `Reminder run complete: ${emailsSent} emails, ${smsSent} SMS, ${errors} errors`,
    );

    return new Response(
      JSON.stringify({ ok: true, emailsSent, smsSent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-appointment-reminders error:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
