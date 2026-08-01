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
      .select("tenant_id, tenants(id, name, logo_url, currency)")
      .eq("email_daily_digest", true);

    if (scopedTenantId) {
      tenantsQuery = tenantsQuery.eq("tenant_id", scopedTenantId);
    }

    const { data: settingsRows, error: settingsError } = await tenantsQuery;
    if (settingsError) throw settingsError;

    const todayStart = startOfUtcDay(new Date());
    const todayEnd = endOfUtcDay(new Date());

    let processed = 0;

    for (const row of settingsRows || []) {
      const tenant = Array.isArray((row as { tenants?: unknown }).tenants)
        ? (row as { tenants: Array<{ id: string; name: string | null; logo_url: string | null; currency: string | null }> }).tenants[0]
        : (row as { tenants?: { id: string; name: string | null; logo_url: string | null; currency: string | null } | null }).tenants;

      if (!tenant?.id) continue;

      const recipients = await getSalonRecipients(admin, tenant.id, ["owner", "manager"]);
      if (recipients.length === 0) continue;

      const [
        appointmentsResult,
        paymentsResult,
        outstandingResult,
        templateResult,
        platformTemplateResult,
      ] = await Promise.all([
        admin
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .gte("scheduled_start", todayStart.toISOString())
          .lte("scheduled_start", todayEnd.toISOString())
          .in("status", ["scheduled", "started", "paused"]),
        admin
          .from("transactions")
          .select("amount")
          .eq("tenant_id", tenant.id)
          .in("type", ["payment", "deposit", "purse_topup"])
          .eq("status", "completed")
          .gte("created_at", todayStart.toISOString())
          .lte("created_at", todayEnd.toISOString()),
        admin
          .from("appointments")
          .select("total_amount, amount_paid, payment_status, status")
          .eq("tenant_id", tenant.id)
          .neq("status", "cancelled"),
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
      if (templateResult.error) throw templateResult.error;

      const upcomingAppointmentsCount = appointmentsResult.count || 0;
      const paymentsReceived = (paymentsResult.data || []).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      const outstandingBalances = (outstandingResult.data || []).reduce((sum, appointment) => {
        if (["fully_paid", "refunded_full"].includes(appointment.payment_status)) {
          return sum;
        }
        return sum + Math.max(Number(appointment.total_amount || 0) - Number(appointment.amount_paid || 0), 0);
      }, 0);

      const defaultSubject = "Daily digest for {{salon_name}}";
      const defaultBody = `
        <h2 style="color: #2E1F4E; margin-bottom: 16px;">Daily Digest</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi {{first_name}},</p>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Here is your daily summary for {{salon_name}}.</p>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Date:</strong> {{digest_date}}</p>
          <p style="margin: 0 0 8px 0;"><strong>Upcoming appointments:</strong> {{upcoming_appointments_count}}</p>
          <p style="margin: 0 0 8px 0;"><strong>Payments received:</strong> {{payments_received}}</p>
          <p style="margin: 0;"><strong>Outstanding balances:</strong> {{outstanding_balances}}</p>
        </div>
        {{cta_link_button}}
      `;

      for (const recipient of recipients) {
        const values = {
          first_name: recipient.firstName || "there",
          salon_name: tenant.name || "Salon Magik",
          digest_date: todayStart.toISOString().slice(0, 10),
          upcoming_appointments_count: String(upcomingAppointmentsCount),
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
