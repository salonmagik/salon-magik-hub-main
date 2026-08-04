/**
 * send-trial-extension-notice
 *
 * Called directly (not by cron) right after a tenant's trial gets
 * extended — either a self-serve promo code bonus (apply_promo_trial_bonus)
 * or a Backoffice-granted gifted trial override (tenant_trial_overrides).
 * Emails every billing admin for the tenant (owner + manager/supervisor
 * with the "billing" permission) so the extension doesn't go unnoticed.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate, heading, paragraph, createButton } from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NoticeRequest =
  | { tenantId: string; reason: "promo_bonus"; bonusDays: number }
  | { tenantId: string; reason: "gifted_override"; overrideStartsAt: string; overrideEndsAt: string; overrideReason?: string };

async function sendEmail(resendApiKey: string, from: string, to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error ${response.status}: ${body}`);
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function buildNoticeHtml(
  req: NoticeRequest,
  options: { recipientFirstName: string; tenantName: string; newTrialEndsAt: string | null; loginUrl: string },
): { subject: string; html: string } {
  const { recipientFirstName, tenantName, newTrialEndsAt, loginUrl } = options;

  if (req.reason === "promo_bonus") {
    const content = `
      ${heading(`Hi ${recipientFirstName},`)}
      ${paragraph(`Good news — a promo code was just applied to ${tenantName}'s trial, adding ${req.bonusDays} extra day${req.bonusDays === 1 ? "" : "s"}.`)}
      ${newTrialEndsAt ? paragraph(`Your trial now runs through <strong>${formatDate(newTrialEndsAt)}</strong>.`) : ""}
      ${createButton("View subscription", loginUrl)}
    `;
    return {
      subject: `${tenantName}'s trial was extended by ${req.bonusDays} day${req.bonusDays === 1 ? "" : "s"}`,
      html: wrapEmailTemplate(content, { mode: "product" }),
    };
  }

  const content = `
    ${heading(`Hi ${recipientFirstName},`)}
    ${paragraph(`Salon Magik support has granted ${tenantName} extended access from ${formatDate(req.overrideStartsAt)} to ${formatDate(req.overrideEndsAt)}.`)}
    ${req.overrideReason ? paragraph(`Reason: ${req.overrideReason}`) : ""}
    ${createButton("View subscription", loginUrl)}
    ${paragraph("Questions about this? Just reply to this email — we're happy to help.")}
  `;
  return {
    subject: `${tenantName} was granted extended access`,
    html: wrapEmailTemplate(content, { mode: "product" }),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as NoticeRequest;
    if (!body?.tenantId || !body?.reason) {
      return new Response(JSON.stringify({ error: "Missing tenantId or reason" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: promo_bonus can only be triggered by an active member of
    // the tenant; gifted_override only by an active backoffice user.
    if (body.reason === "promo_bonus") {
      const { data: role } = await admin
        .from("user_roles")
        .select("id")
        .eq("tenant_id", body.tenantId)
        .eq("user_id", caller.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (!role) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (body.reason === "gifted_override") {
      const { data: boUser } = await admin
        .from("backoffice_users")
        .select("id, is_active")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (!boUser || boUser.is_active === false) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid reason" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("name, trial_ends_at")
      .eq("id", body.tenantId)
      .maybeSingle();
    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: billingAdmins } = await admin.rpc("get_tenant_billing_admin_user_ids", {
      p_tenant_id: body.tenantId,
    });
    if (!billingAdmins || billingAdmins.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@salonmagik.com";
    const appOrigin = Deno.env.get("SALON_APP_URL") ?? "https://app.salonmagik.com";

    let sentCount = 0;
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

      const { subject, html } = buildNoticeHtml(body, {
        recipientFirstName: adminFirstName,
        tenantName: tenant.name || "Your salon",
        newTrialEndsAt: tenant.trial_ends_at,
        loginUrl: `${appOrigin}/salon/subscription`,
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
        } catch (emailError) {
          console.error(`[send-trial-extension-notice] send failed for tenant ${body.tenantId}, admin ${admin_.user_id}:`, emailError);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("send-trial-extension-notice error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
