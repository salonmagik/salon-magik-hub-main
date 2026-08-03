/**
 * send-trial-expiry-reminders
 *
 * Called by pg_cron hourly. Finds trialing tenants crossing the 7-day,
 * 3-day, or 24-hour mark before trial_ends_at and emails the tenant OWNER a
 * reminder to upgrade to the plan they selected during onboarding.
 *
 * Idempotency: each threshold has its own trial_reminder_*_sent_at column on
 * tenants, set right after a successful send, so a tenant gets each
 * reminder at most once even though the cron re-checks hourly.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate, heading, paragraph, createButton } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trial-reminders-secret",
};

type Threshold = {
  key: "7d" | "3d" | "24h";
  hours: number;
  sentColumn: "trial_reminder_7d_sent_at" | "trial_reminder_3d_sent_at" | "trial_reminder_24h_sent_at";
};

// Checked in order from furthest-out to soonest: a tenant only ever gets the
// FIRST unmet one on a given run (avoids double-sending 7d and 3d in the same
// hour for a tenant the cron hasn't touched in a while).
const THRESHOLDS: Threshold[] = [
  { key: "7d", hours: 24 * 7, sentColumn: "trial_reminder_7d_sent_at" },
  { key: "3d", hours: 24 * 3, sentColumn: "trial_reminder_3d_sent_at" },
  { key: "24h", hours: 24, sentColumn: "trial_reminder_24h_sent_at" },
];

async function sendEmail(
  resendApiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error ${response.status}: ${body}`);
  }
}

function buildReminderHtml(options: {
  recipientFirstName: string;
  planName: string;
  threshold: Threshold["key"];
  loginUrl: string;
}): { subject: string; html: string } {
  const { recipientFirstName, planName, threshold, loginUrl } = options;

  // Human, low-tech copy — no "your subscription status" robot-speak.
  const copy: Record<Threshold["key"], { subject: string; lede: string; body: string }> = {
    "7d": {
      subject: `Your Salon Magik trial wraps up in 7 days`,
      lede: `Just a heads up — you've got 7 days left on your free trial.`,
      body: `You picked the ${planName} plan when you got started, so whenever you're ready, upgrading takes about 2 minutes and keeps everything running exactly as it is — your bookings, your customers, your setup. Nothing to redo.`,
    },
    "3d": {
      subject: `3 days left on your Salon Magik trial`,
      lede: `Quick reminder — your trial ends in 3 days.`,
      body: `To keep running your salon without any interruption, upgrade to the ${planName} plan before then. It only takes a couple of minutes, and everything you've already set up stays exactly as is.`,
    },
    "24h": {
      subject: `Your Salon Magik trial ends tomorrow`,
      lede: `Your trial ends in about 24 hours.`,
      body: `To stay in full control of your bookings, customers, and storefront without any gap, upgrade to the ${planName} plan today. Once your trial ends, your booking page pauses until you do.`,
    },
  };

  const c = copy[threshold];
  const content = `
    ${heading(`Hi ${recipientFirstName},`)}
    ${paragraph(c.lede)}
    ${paragraph(c.body)}
    ${createButton("Upgrade my plan", loginUrl)}
    ${paragraph("Questions about billing or your plan? Just reply to this email — we're happy to help.")}
  `;

  return {
    subject: c.subject,
    html: wrapEmailTemplate(content, { mode: "product" }),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get("TRIAL_REMINDERS_SECRET");
    const providedSecret = req.headers.get("x-trial-reminders-secret");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@salonmagik.com";
    const appOrigin = Deno.env.get("SALON_APP_URL") ?? "https://app.salonmagik.com";

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tenants, error: tenantsError } = await admin
      .from("tenants")
      .select("id, name, plan, trial_ends_at, trial_reminder_7d_sent_at, trial_reminder_3d_sent_at, trial_reminder_24h_sent_at")
      .eq("subscription_status", "trialing")
      .not("trial_ends_at", "is", null);

    if (tenantsError) throw tenantsError;

    const now = Date.now();
    let sentCount = 0;

    for (const tenant of tenants ?? []) {
      const hoursRemaining = (new Date(tenant.trial_ends_at as string).getTime() - now) / (1000 * 60 * 60);
      if (hoursRemaining < 0) continue; // already expired — lockout handles this, not a reminder

      const dueThreshold = THRESHOLDS.find(
        (t) => hoursRemaining <= t.hours && !(tenant as Record<string, unknown>)[t.sentColumn],
      );
      if (!dueThreshold) continue;

      // Billing admins = owner + any manager/supervisor granted the
      // "billing" permission. Owner is always included regardless of
      // role_permissions state.
      const { data: billingAdmins } = await admin.rpc("get_tenant_billing_admin_user_ids", {
        p_tenant_id: tenant.id,
      });
      if (!billingAdmins || billingAdmins.length === 0) continue;

      // Resolve a human plan display name once per tenant.
      let planName = "your";
      if (tenant.plan) {
        const { data: planRow } = await admin
          .from("plans")
          .select("name")
          .eq("slug", tenant.plan)
          .maybeSingle();
        planName = planRow?.name || tenant.plan;
      }

      let anySent = false;
      for (const admin_ of billingAdmins as { user_id: string }[]) {
        const { data: adminAuth } = await admin.auth.admin.getUserById(admin_.user_id);
        const adminEmail = adminAuth?.user?.email;
        if (!adminEmail) continue;

        const { data: adminProfile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("user_id", admin_.user_id)
          .maybeSingle();
        const adminFirstName = (adminProfile?.full_name || "there").split(" ")[0];

        const { subject, html } = buildReminderHtml({
          recipientFirstName: adminFirstName,
          planName,
          threshold: dueThreshold.key,
          loginUrl: `${appOrigin}/salon/settings?tab=subscription`,
        });

        if (resendApiKey) {
          try {
            await sendEmail(
              resendApiKey,
              buildFromAddress({ fromEmail: resendFromEmail, mode: "product" }),
              adminEmail,
              subject,
              html,
            );
            sentCount += 1;
            anySent = true;
          } catch (emailError) {
            console.error(
              `[send-trial-expiry-reminders] send failed for tenant ${tenant.id}, admin ${admin_.user_id}:`,
              emailError,
            );
          }
        }
      }

      if (!anySent) continue; // don't mark as sent if every send failed

      await admin
        .from("tenants")
        .update({ [dueThreshold.sentColumn]: new Date().toISOString() })
        .eq("id", tenant.id);
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("send-trial-expiry-reminders error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
