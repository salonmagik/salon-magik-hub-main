import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  wrapEmailTemplate,
  buildFromAddress,
  paragraph,
} from "../_shared/email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function applyTemplate(template: string, vars: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Promo email provider is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    // Always point sign-up/login URLs to the salon app, not the backoffice origin.
    const salonAppUrl = Deno.env.get("SALON_APP_URL") || "https://app.salonmagik.com";

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const caller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { promoCodeId } = await req.json();
    if (!promoCodeId) {
      return new Response(JSON.stringify({ error: "promoCodeId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: backofficeUser, error: backofficeError } = await admin
      .from("backoffice_users")
      .select("id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (backofficeError || !backofficeUser) {
      return new Response(JSON.stringify({ error: "Backoffice access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: promoCode, error: promoError } = await admin
      .from("sales_promo_codes")
      .select(`
        id,
        code,
        target_email,
        expires_at,
        status,
        invalidated_at,
        send_count,
        claimed_tenant_id,
        campaign:sales_promo_campaigns (
          id,
          name,
          ends_at,
          is_active,
          email_subject_template,
          email_body_template
        ),
        redemption:sales_promo_redemptions (
          id,
          remaining_uses,
          status
        )
      `)
      .eq("id", promoCodeId)
      .single();

    if (promoError || !promoCode) {
      return new Response(JSON.stringify({ error: "Promo code not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaign = Array.isArray(promoCode.campaign) ? promoCode.campaign[0] : promoCode.campaign;
    const redemption = Array.isArray(promoCode.redemption) ? promoCode.redemption[0] : promoCode.redemption;

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaignEnded = new Date(campaign.ends_at).getTime() <= Date.now();
    const codeExpired = promoCode.expires_at ? new Date(promoCode.expires_at).getTime() <= Date.now() : false;
    const fullyConsumed = (redemption?.remaining_uses || 0) <= 0 && redemption?.id;
    const invalidated = Boolean(promoCode.invalidated_at) || promoCode.status === "invalidated";

    if (campaignEnded || invalidated || fullyConsumed || (codeExpired && promoCode.status !== "claimed")) {
      return new Response(JSON.stringify({ error: "Promo code is no longer resendable" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: varsData, error: varsError } = await (admin.rpc as any)("get_sales_promo_email_vars", {
      p_promo_code_id: promoCodeId,
      p_origin: salonAppUrl,
    });

    if (varsError) {
      console.error("Failed to build promo email vars:", varsError);
      return new Response(JSON.stringify({ error: "Failed to prepare email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vars = (varsData || {}) as Record<string, unknown>;
    const subjectTemplate = campaign.email_subject_template || "Welcome to Salon Magik, here's your invite";
    const bodyTemplate = campaign.email_body_template ||
      `<h2 style="color:#111827;margin:0 0 20px 0;font-size:24px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;">Hi {{recipient_firstname}},</h2>` +
      `<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">Welcome to Salon Magik. You&#39;ve been invited to join, and we&#39;ve set aside a promo code just for your account.</p>` +
      `<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;"><tr><td style="background:#f8f6f2;border-radius:12px;padding:24px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Your promo code</p><p style="margin:0;font-size:30px;font-weight:700;letter-spacing:6px;color:#2E1F4E;font-family:monospace,'Courier New';">{{promo_code}}</p></td></tr></table>` +
      `{{discount_line}}<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">It&#39;s reserved for this account and valid through <strong>{{expires_date}}</strong>.</p>` +
      `<table role="presentation" style="margin:32px auto;border-collapse:collapse;"><tr><td style="border-radius:100px;background-color:#F4C84E;"><a href="{{signup_url}}" style="background-color:#F4C84E;color:#2E1F4E;padding:15px 36px;text-decoration:none;border-radius:100px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Start free trial &#x2192;</a></td></tr></table>` +
      `<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0 0 18px 0;">Questions getting set up? Just reply to this email &#x2014; a real person will get back to you.</p>` +
      `<p style="color:#4b5563;font-size:16px;line-height:1.7;margin:0;">Welcome aboard,<br/><strong>The Salon Magik team</strong></p>`;
    const subject = applyTemplate(subjectTemplate, vars);
    const body = applyTemplate(bodyTemplate, vars);
    const html = wrapEmailTemplate(body, { mode: "product" });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [promoCode.target_email],
        subject,
        html,
      }),
    });

    const resendResult = await resendResponse.json();
    if (!resendResponse.ok) {
      console.error("Promo email send failed:", resendResult);
      return new Response(JSON.stringify({ error: resendResult.message || "Failed to send email" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin
      .from("sales_promo_codes")
      .update({
        last_sent_at: new Date().toISOString(),
        send_count: (promoCode.send_count || 0) + 1,
      })
      .eq("id", promoCodeId);

    await admin.from("audit_logs").insert({
      action: "sales_promo.email_sent",
      entity_type: "sales_promo_codes",
      entity_id: promoCodeId,
      actor_user_id: user.id,
      metadata: {
        target_email: promoCode.target_email,
        campaign_id: campaign.id,
        provider_id: resendResult?.id || null,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Promo email sent to ${promoCode.target_email}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error sending sales promo email:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
