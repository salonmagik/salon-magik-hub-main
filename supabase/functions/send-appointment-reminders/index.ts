/**
 * send-appointment-reminders
 *
 * Called by pg_cron every 10 minutes (AD-6). Fetches every due
 * (appointment, offset) work item across the whole platform in one RPC
 * call (AD-4), collapses same-appointment offsets into a single send
 * (AD-5), and sends email + SMS (if enabled) to the customer.
 *
 * Idempotency: per-offset state lives in appointment_reminder_sends
 * (AD-3), keyed by (appointment_id, offset_minutes). Work is claimed
 * (attempt_count incremented, last_attempt_at set) before sending, so an
 * overlapping run sees zero eligible rows once past the 9-minute cooldown
 * enforced by the RPC (AD-7).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendArkeselSMS, resolveArkeselSenderId } from "../_shared/arkesel-client.ts";
import { nextReminderState } from "./reminder-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DueReminderRow {
  appointment_id: string;
  tenant_id: string;
  customer_id: string | null;
  scheduled_start: string;
  offset_minutes: number;
  attempt_count: number;
  email_enabled: boolean;
  sms_enabled: boolean;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  tenant_name: string | null;
  tenant_sms_sender_name: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Every invocation of this function was silently 401ing at the platform
    // gateway (config.toml had no verify_jwt override, so it defaulted to
    // true, and the cron job sends no Authorization header at all) — this
    // in-code secret check is the actual auth boundary now that the gateway
    // lets requests through, matching process-recurring-addon-billing's
    // pattern so this endpoint isn't left fully open.
    const cronSecret = Deno.env.get("APPOINTMENT_REMINDERS_SECRET");
    const providedSecret = req.headers.get("x-reminders-secret");
    if (cronSecret && providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();

    const { data: dueRows, error: dueError } = await supabase.rpc(
      "get_due_appointment_reminders",
      { p_now: now.toISOString() },
    );

    if (dueError) {
      console.error("Failed to load due appointment reminders:", dueError);
      return new Response(JSON.stringify({ error: dueError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;
    let smsSent = 0;
    let errors = 0;
    let exhausted = 0;

    // Group by appointment (AD-5): more than one offset due for the same
    // appointment in one run becomes a single send, not one per offset.
    const groups = new Map<string, DueReminderRow[]>();
    for (const row of (dueRows ?? []) as DueReminderRow[]) {
      const group = groups.get(row.appointment_id);
      if (group) {
        group.push(row);
      } else {
        groups.set(row.appointment_id, [row]);
      }
    }

    for (const [appointmentId, rows] of groups) {
      try {
        const first = rows[0];
        const offsetMinutesList = rows.map((r) => r.offset_minutes);
        const maxAttemptCount = Math.max(...rows.map((r) => r.attempt_count));

        // Claim: every offset row in the group is upserted with an
        // incremented attempt and a fresh last_attempt_at *before* sending,
        // so a slow send that overlaps the next cron tick cannot be picked
        // up twice (AD-7).
        const claimRows = rows.map((r) => ({
          appointment_id: r.appointment_id,
          tenant_id: r.tenant_id,
          offset_minutes: r.offset_minutes,
          attempt_count: r.attempt_count + 1,
          last_attempt_at: now.toISOString(),
        }));

        const { error: claimError } = await supabase
          .from("appointment_reminder_sends")
          .upsert(claimRows, { onConflict: "appointment_id,offset_minutes" });

        if (claimError) {
          console.error(`Failed to claim reminder group for appointment ${appointmentId}:`, claimError);
          errors++;
          continue;
        }

        // In-memory re-check: the appointment's start may have passed
        // between the RPC read and this send on a slow run.
        if (new Date(first.scheduled_start).getTime() <= Date.now()) {
          continue;
        }

        const emailEnabled = rows.some((r) => r.email_enabled);
        const smsEnabled = rows.some((r) => r.sms_enabled);
        let emailOk = false;
        let smsOk = false;

        // Email reminder — the callee (send-appointment-notification)
        // writes both the success and failure message_logs row itself
        // (AD-10 of the email-delivery-audit design); this caller only
        // needs to check response.ok.
        if (emailEnabled) {
          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/send-appointment-notification`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  appointmentId,
                  action: "reminder",
                }),
              },
            );
            if (response.ok) {
              emailOk = true;
              emailsSent++;
            } else {
              errors++;
            }
          } catch (err) {
            console.error(`Email reminder failed for appointment ${appointmentId}:`, err);
            errors++;
          }
        }

        // SMS reminder
        if (smsEnabled) {
          try {
            const senderName = resolveArkeselSenderId(
              first.customer_phone!,
              first.tenant_sms_sender_name ?? undefined,
              "promotional",
            );

            const apptDate = new Date(first.scheduled_start).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });

            const message =
              `Hi ${first.customer_name?.split(" ")[0] || "there"}, ` +
              `this is a reminder about your appointment at ${first.tenant_name || "our salon"} ` +
              `on ${apptDate}. See you soon!`;

            await sendArkeselSMS({
              to: first.customer_phone!,
              from: senderName,
              message,
              useCase: "promotional",
            });
            smsOk = true;
            smsSent++;
            await supabase.from("message_logs").insert({
              tenant_id: first.tenant_id,
              customer_id: first.customer_id,
              channel: "sms",
              recipient: first.customer_phone,
              template_type: "appointment_reminder",
              status: "sent",
              sent_at: new Date().toISOString(),
              provider: "arkesel_sms",
              initiated_by: "system",
              credits_used: 0,
            });
          } catch (err) {
            console.error(`SMS reminder failed for appointment ${appointmentId}:`, err);
            errors++;
            await supabase.from("message_logs").insert({
              tenant_id: first.tenant_id,
              customer_id: first.customer_id,
              channel: "sms",
              recipient: first.customer_phone || null,
              template_type: "appointment_reminder",
              status: "failed",
              sent_at: new Date().toISOString(),
              provider: "arkesel_sms",
              initiated_by: "system",
              credits_used: 0,
              error_message: err instanceof Error ? err.message : "SMS reminder failed",
            });
          }
        }

        // Settle: nextReminderState decides the outcome once for the
        // group (AD-5), applied identically to every offset row in it.
        const nextState = nextReminderState(
          {
            prev: { attemptCount: maxAttemptCount },
            emailOk,
            smsOk,
            anyChannelEnabled: emailEnabled || smsEnabled,
          },
          now,
        );

        if (nextState.failedAt) {
          exhausted++;
        }

        const { error: settleError } = await supabase
          .from("appointment_reminder_sends")
          .update({
            sent_at: nextState.sentAt,
            failed_at: nextState.failedAt,
            attempt_count: nextState.attemptCount,
          })
          .eq("appointment_id", appointmentId)
          .in("offset_minutes", offsetMinutesList);

        if (settleError) {
          // The claim already counted the attempt, so the worst case is
          // one duplicate send on a later tick rather than an unbounded
          // loop — strictly better than a failed settle re-sending
          // forever.
          console.error(`Failed to settle reminder group for appointment ${appointmentId}:`, settleError);
          errors++;
        }
      } catch (err) {
        console.error(`Reminder group failed for appointment ${appointmentId}:`, err);
        errors++;
      }
    }

    console.log(
      `Reminder run complete: ${emailsSent} emails, ${smsSent} SMS, ${errors} errors, ${exhausted} exhausted`,
    );

    return new Response(
      JSON.stringify({ ok: true, emailsSent, smsSent, errors, exhausted }),
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
