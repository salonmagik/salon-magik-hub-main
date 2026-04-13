import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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
      .select("id, role, totp_enabled")
      .eq("user_id", user.id)
      .eq("totp_enabled", true)
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
      p_origin: req.headers.get("origin"),
    });

    if (varsError) {
      console.error("Failed to build promo email vars:", varsError);
      return new Response(JSON.stringify({ error: "Failed to prepare email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vars = (varsData || {}) as Record<string, unknown>;
    const subjectTemplate = campaign.email_subject_template || "Your {{campaign_name}} Salon Magik promo code";
    const bodyTemplate = campaign.email_body_template || paragraph("Your promo code is {{promo_code}}.");
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
