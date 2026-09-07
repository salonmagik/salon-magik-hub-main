import { createClient } from "npm:@supabase/supabase-js@2";
import { getSalonRecipients, sendResendEmail } from "../_shared/salon-notifications.ts";
import { fetchPlatformTemplate, renderPlatformTemplate } from "../_shared/platform-templates.ts";
import { createButton } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-daily-digest-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DigestRequest {
  tenantId?: string;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

type DigestFrequency = "daily" | "weekly" | "monthly";

// The cron fires once a day — frequency is decided in here, not by having
// separate cron schedules. A weekly/monthly digest would be nearly all
// zeros if it only ever looked at "today", so both the send-or-skip
// decision and the aggregation window depend on which day it actually is.
function shouldSendToday(frequency: DigestFrequency, now: Date): boolean {
  if (frequency === "daily") return true;
  if (frequency === "weekly") return now.getUTCDay() === 1; // Monday
  return now.getUTCDate() === 1; // Monthly: 1st of the month
}

function periodRange(frequency: DigestFrequency, now: Date): { start: Date; end: Date; label: string } {
  const end = endOfUtcDay(now);
  if (frequency === "daily") {
    return { start: startOfUtcDay(now), end, label: "today" };
  }
  if (frequency === "weekly") {
    const start = startOfUtcDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    return { start, end, label: "this week" };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, end, label: "this month" };
}

function formatDateRange(frequency: DigestFrequency, start: Date, end: Date): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (frequency === "daily") return fmt(end);
  return `${fmt(start)} – ${fmt(end)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const dashboardBaseUrl = Deno.env.get("SALON_APP_URL") || Deno.env.get("BASE_URL") || "https://app.salonmagik.com";
    const digestSecret = Deno.env.get("DAILY_DIGEST_SECRET");

    const admin = createClient(supabaseUrl, serviceKey);
    const { tenantId }: DigestRequest = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const providedSecret = req.headers.get("x-daily-digest-secret");
    let scopedTenantId = tenantId ?? null;

    if (digestSecret && providedSecret === digestSecret) {
      // Internal invocation allowed.
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
      const {
        data: { user },
        error: authError,
      } = await admin.auth.getUser(accessToken);

      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!scopedTenantId) {
        return new Response(JSON.stringify({ error: "tenantId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roleRow, error: roleError } = await admin
        .from("user_roles")
        .select("id")
        .eq("tenant_id", scopedTenantId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("role", ["owner", "manager"])
        .maybeSingle();

      if (roleError || !roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let tenantsQuery = admin
      .from("notification_settings")
      .select("tenant_id, digest_frequency, tenants(id, name, logo_url, currency)")
      .neq("digest_frequency", "off");

    if (scopedTenantId) {
      tenantsQuery = tenantsQuery.eq("tenant_id", scopedTenantId);
    }

    const { data: settingsRows, error: settingsError } = await tenantsQuery;
    if (settingsError) throw settingsError;

    const now = new Date();

    let processed = 0;

    for (const row of settingsRows || []) {
      const tenant = Array.isArray((row as { tenants?: unknown }).tenants)
        ? (row as { tenants: Array<{ id: string; name: string | null; logo_url: string | null; currency: string | null }> }).tenants[0]
        : (row as { tenants?: { id: string; name: string | null; logo_url: string | null; currency: string | null } | null }).tenants;

      if (!tenant?.id) continue;

      const frequency = (row as { digest_frequency: DigestFrequency }).digest_frequency;
      // A manually-triggered/scoped-to-one-tenant call (tenantId in the
      // request body) always sends regardless of today's date, so an owner
      // testing their weekly/monthly digest doesn't have to wait for the
      // real day it'd normally fire.
      if (!scopedTenantId && !shouldSendToday(frequency, now)) continue;

      const { start: periodStart, end: periodEnd, label: periodLabel } = periodRange(frequency, now);

      const recipients = await getSalonRecipients(admin, tenant.id, ["owner", "manager"]);
      if (recipients.length === 0) continue;

      const [
        appointmentsResult,
        paymentsResult,
        outstandingResult,
        newCustomersResult,
        templateResult,
        platformTemplateResult,
      ] = await Promise.all([
        admin
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .gte("scheduled_start", periodStart.toISOString())
          .lte("scheduled_start", periodEnd.toISOString())
          .in("status", ["scheduled", "started", "paused"]),
        admin
          .from("transactions")
          .select("amount")
          .eq("tenant_id", tenant.id)
          .in("type", ["payment", "deposit", "purse_topup"])
          .eq("status", "completed")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        admin
          .from("appointments")
          .select("total_amount, amount_paid, payment_status, status")
          .eq("tenant_id", tenant.id)
          .neq("status", "cancelled"),
        admin
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        admin
          .from("email_templates")
          .select("subject, body_html, is_active")
          .eq("tenant_id", tenant.id)
          .eq("template_type", "daily_digest")
          .maybeSingle(),
        fetchPlatformTemplate(admin, "daily_digest", "email"),
      ]);

      if (appointmentsResult.error) throw appointmentsResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      if (outstandingResult.error) throw outstandingResult.error;
      if (newCustomersResult.error) throw newCustomersResult.error;
      if (templateResult.error) throw templateResult.error;

      const upcomingAppointmentsCount = appointmentsResult.count || 0;
      const newCustomersCount = newCustomersResult.count || 0;
      const paymentsReceived = (paymentsResult.data || []).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      const outstandingBalances = (outstandingResult.data || []).reduce((sum, appointment) => {
        if (["fully_paid", "refunded_full"].includes(appointment.payment_status)) {
          return sum;
        }
        return sum + Math.max(Number(appointment.total_amount || 0) - Number(appointment.amount_paid || 0), 0);
      }, 0);

      const frequencyLabel = frequency.charAt(0).toUpperCase() + frequency.slice(1);
      const settingsUrl = `${dashboardBaseUrl}/salon/business-settings?tab=notifications`;
      const otherFrequencies: Record<DigestFrequency, string> = {
        daily: "weekly or monthly",
        weekly: "daily or monthly",
        monthly: "daily or weekly",
      };

      const defaultSubject = "{{frequency_label}} digest for {{salon_name}}";
      const defaultBody = `
        <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:650;">{{frequency_label}} digest · {{digest_date}}</p>
        <h2 style="color:#111827;font-size:19px;font-weight:650;margin:0 0 18px;">Good morning, {{first_name}}</h2>
        <p style="color:#4b5563;font-size:13.5px;line-height:1.6;margin:0 0 20px;">Here's how {{salon_name}} did {{period_label}}.</p>
        <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:10px 10px;margin:0 0 4px -10px;">
          <tr>
            <td style="width:50%;background:#f8f6f2;border-radius:9px;padding:14px 16px;">
              <p style="margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:650;">Revenue {{period_label}}</p>
              <p style="margin:0;font-size:19px;font-weight:700;color:#158a4a;">{{payments_received}}</p>
            </td>
            <td style="width:50%;background:#f8f6f2;border-radius:9px;padding:14px 16px;">
              <p style="margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:650;">Appointments {{period_label}}</p>
              <p style="margin:0;font-size:19px;font-weight:700;color:#111827;">{{upcoming_appointments_count}}</p>
            </td>
          </tr>
          <tr>
            <td style="width:50%;background:#f8f6f2;border-radius:9px;padding:14px 16px;">
              <p style="margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:650;">New customers</p>
              <p style="margin:0;font-size:19px;font-weight:700;color:#111827;">{{new_customers_count}}</p>
            </td>
            <td style="width:50%;background:#f8f6f2;border-radius:9px;padding:14px 16px;">
              <p style="margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:650;">Outstanding balance</p>
              <p style="margin:0;font-size:19px;font-weight:700;color:#b4740e;">{{outstanding_balances}}</p>
            </td>
          </tr>
        </table>
        {{cta_link_button}}
        <p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11.5px;line-height:1.7;">
          You're getting this {{frequency_lowercase}}. <a href="{{settings_link}}" style="color:#2E1F4E;font-weight:600;text-decoration:none;">Change to {{other_frequencies}}, or turn it off</a> in Notification Settings.
        </p>
      `;

      for (const recipient of recipients) {
        const values = {
          first_name: recipient.firstName || "there",
          salon_name: tenant.name || "Salon Magik",
          digest_date: formatDateRange(frequency, periodStart, periodEnd),
          frequency_label: frequencyLabel,
          frequency_lowercase: frequency,
          period_label: periodLabel,
          other_frequencies: otherFrequencies[frequency],
          settings_link: settingsUrl,
          upcoming_appointments_count: String(upcomingAppointmentsCount),
          new_customers_count: String(newCustomersCount),
          payments_received: `${tenant.currency || "USD"} ${paymentsReceived.toFixed(2)}`,
          outstanding_balances: `${tenant.currency || "USD"} ${outstandingBalances.toFixed(2)}`,
          cta_link: `${dashboardBaseUrl}/salon`,
          cta_link_button: createButton("Open Dashboard", `${dashboardBaseUrl}/salon`),
        };

        const activePlatformSubject =
          platformTemplateResult?.is_active === false ? null : platformTemplateResult?.subject;
        const activePlatformBody =
          platformTemplateResult?.is_active === false ? null : platformTemplateResult?.body;

        const subject = renderPlatformTemplate(
          activePlatformSubject ||
            (templateResult.data?.is_active === false
              ? defaultSubject
              : templateResult.data?.subject || defaultSubject),
          values,
        );
        const htmlContent = renderPlatformTemplate(
          activePlatformBody ||
            (templateResult.data?.is_active === false
              ? defaultBody
              : templateResult.data?.body_html || defaultBody),
          values,
        );

        await sendResendEmail({
          resendApiKey,
          fromEmail,
          to: [recipient.email],
          subject,
          salonName: tenant.name || undefined,
          salonLogoUrl: tenant.logo_url || undefined,
          htmlContent,
        });
      }

      processed += 1;
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending daily digest:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
