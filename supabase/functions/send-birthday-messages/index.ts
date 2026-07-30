/**
 * send-birthday-messages
 *
 * Called by pg_cron daily at 8:00 AM UTC. Finds customers whose birthday
 * (month + day) matches today and sends a birthday email via Resend.
 *
 * Idempotency: updates last_birthday_email_sent_at after each send so that
 * if the cron fires twice in one day the email is only sent once per year.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-birthday-secret",
};

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

function buildBirthdayHtml(customerName: string, salonName: string): string {
  const firstName = customerName.split(" ")[0] || customerName;
  return `
    <h2 style="color: #2E1F4E; margin: 0 0 16px; font-size: 22px; font-weight: 700;">
      Happy Birthday, ${firstName}! 🎂
    </h2>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 18px;">
      Wishing you a wonderful birthday from everyone here at ${salonName}.
      You deserve to feel amazing today — treat yourself!
    </p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 18px;">
      We're grateful to have you as a valued client and look forward to seeing you soon.
    </p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0;">
      With love,<br />
      <strong>${salonName}</strong>
    </p>
  `.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get("BIRTHDAY_SECRET");
    const providedSecret = req.headers.get("x-birthday-secret");
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const todayMonth = now.getUTCMonth() + 1; // 1-12
    const todayDay = now.getUTCDate();
    const thisYear = now.getUTCFullYear();

    // Load tenants that have birthday messages enabled
    const { data: settings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("tenant_id, email_birthday_messages")
      .eq("email_birthday_messages", true);

    if (settingsError) {
      console.error("Failed to load notification settings:", settingsError);
      return new Response(JSON.stringify({ error: settingsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;
    let errors = 0;

    for (const setting of settings ?? []) {
      // Fetch today's birthdays for this tenant (month + day match, not sent this year yet)
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("id, full_name, email, birthday, last_birthday_email_sent_at")
        .eq("tenant_id", setting.tenant_id)
        .eq("status", "active")
        .not("birthday", "is", null)
        .not("email", "is", null);

      if (customersError) {
        console.error(
          `Failed to fetch customers for tenant ${setting.tenant_id}:`,
          customersError,
        );
        errors++;
        continue;
      }

      // Filter in JS: month+day match today, and not already sent this calendar year
      const todayBirthdays = (customers ?? []).filter((c) => {
        if (!c.birthday || !c.email) return false;
        const bday = new Date(c.birthday);
        if (bday.getUTCMonth() + 1 !== todayMonth || bday.getUTCDate() !== todayDay) return false;
        if (c.last_birthday_email_sent_at) {
          const lastSentYear = new Date(c.last_birthday_email_sent_at).getUTCFullYear();
          if (lastSentYear >= thisYear) return false;
        }
        return true;
      });

      if (todayBirthdays.length === 0) continue;

      // Fetch tenant info + optional custom template
      const [tenantResult, templateResult] = await Promise.all([
        supabase
          .from("tenants")
          .select("name, logo_url, banner_url")
          .eq("id", setting.tenant_id)
          .maybeSingle(),
        supabase
          .from("email_templates")
          .select("subject, body_html, is_active")
          .eq("tenant_id", setting.tenant_id)
          .eq("template_type", "birthday_message")
          .maybeSingle(),
      ]);

      const tenant = tenantResult.data;
      const salonName = tenant?.name ?? "Your Salon";
      const customTemplate = templateResult.data?.is_active ? templateResult.data : null;

      for (const customer of todayBirthdays) {
        try {
          if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

          const firstName = customer.full_name?.split(" ")[0] || "there";

          const subject = customTemplate?.subject
            ? customTemplate.subject
                .replace(/\{\{customer_name\}\}/g, customer.full_name ?? firstName)
                .replace(/\{\{first_name\}\}/g, firstName)
                .replace(/\{\{salon_name\}\}/g, salonName)
            : `Happy Birthday from ${salonName}! 🎂`;

          const bodyContent = customTemplate?.body_html
            ? customTemplate.body_html
                .replace(/\{\{customer_name\}\}/g, customer.full_name ?? firstName)
                .replace(/\{\{first_name\}\}/g, firstName)
                .replace(/\{\{salon_name\}\}/g, salonName)
            : buildBirthdayHtml(customer.full_name ?? firstName, salonName);

          const html = wrapEmailTemplate(bodyContent, {
            mode: "salon",
            salonName,
            salonLogoUrl: tenant?.logo_url ?? undefined,
            salonBannerUrl: tenant?.banner_url ?? undefined,
          });

          await sendEmail(
            resendApiKey,
            buildFromAddress({ fromEmail: resendFromEmail, mode: "salon", salonName }),
            customer.email!,
            subject,
            html,
          );

          // Mark sent so we don't re-send today if the cron fires again
          await supabase
            .from("customers")
            .update({ last_birthday_email_sent_at: now.toISOString() })
            .eq("id", customer.id);

          emailsSent++;
        } catch (err) {
          console.error(`Birthday email failed for customer ${customer.id}:`, err);
          errors++;
        }
      }
    }

    console.log(`Birthday run complete: ${emailsSent} emails sent, ${errors} errors`);

    return new Response(
      JSON.stringify({ ok: true, emailsSent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-birthday-messages error:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
