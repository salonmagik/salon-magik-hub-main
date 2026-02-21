import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Channel = "email" | "sms" | "whatsapp";

const CREDIT_COST: Record<Channel, number> = {
  email: 1,
  sms: 2,
  whatsapp: 2,
};

async function sendEmail(resendApiKey: string, from: string, to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend failed with status ${response.status}`);
  }
}

async function sendSms(termiiApiKey: string, senderId: string, to: string, text: string) {
  const response = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: termiiApiKey,
      to,
      from: senderId,
      sms: text,
      type: "plain",
      channel: "generic",
    }),
  });
  if (!response.ok) {
    throw new Error(`Termii failed with status ${response.status}`);
  }
}

async function sendWhatsApp(metaToken: string, phoneNumberId: string, to: string, text: string) {
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${metaToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!response.ok) {
    throw new Error(`WhatsApp API failed with status ${response.status}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const campaignId = String(body.campaign_id || "").trim();

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: campaignError } = await adminClient
      .from("customer_reactivation_campaigns")
      .select("id, tenant_id, channel, name, template_json")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const channel = campaign.channel as Channel;

    const { data: role } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("tenant_id", campaign.tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recipients, error: recipientsError } = await adminClient
      .from("customer_reactivation_recipients")
      .select("id, customer_id, preview_payload_json")
      .eq("campaign_id", campaign.id)
      .in("send_status", ["pending", "failed"]);

    if (recipientsError) throw recipientsError;

    if (!recipients?.length) {
      return new Response(JSON.stringify({ error: "No recipients queued" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientCustomerIds = recipients.map((recipient) => recipient.customer_id);
    const { data: customers } = await adminClient
      .from("customers")
      .select("id, email, phone, full_name")
      .in("id", recipientCustomerIds)
      .eq("tenant_id", campaign.tenant_id);

    const customerMap = new Map((customers || []).map((customer) => [customer.id, customer]));

    const { data: creditWallet, error: creditsError } = await adminClient
      .from("communication_credits")
      .select("balance")
      .eq("tenant_id", campaign.tenant_id)
      .single();

    if (creditsError || !creditWallet) throw creditsError || new Error("Communication credits missing");

    const requiredCredits = recipients.length * CREDIT_COST[channel];
    if (creditWallet.balance < requiredCredits) {
      return new Response(JSON.stringify({
        error: `Insufficient communication credits. Required ${requiredCredits}, available ${creditWallet.balance}.`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
    const termiiApiKey = Deno.env.get("TERMII_API_KEY") || "";
    const termiiSenderId = Deno.env.get("TERMII_SENDER_ID") || "SalonMagik";
    const whatsappToken = Deno.env.get("META_WHATSAPP_TOKEN") || "";
    const whatsappPhoneId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") || "";

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const customer = customerMap.get(recipient.customer_id);
      const payload = (recipient.preview_payload_json || {}) as Record<string, unknown>;
      const message = String(payload.message || "We miss you at the salon. Reply to this message to book your next visit.");
      const subject = String(payload.subject || campaign.name || "We miss you at the salon");

      if (!customer) {
        failedCount += 1;
        await adminClient
          .from("customer_reactivation_recipients")
          .update({ send_status: "failed", error_message: "Customer not found" })
          .eq("id", recipient.id);
        continue;
      }

      try {
        if (channel === "email") {
          if (!customer.email) throw new Error("Customer has no email");
          if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");
          await sendEmail(resendApiKey, resendFromEmail, customer.email, subject, `<p>${message}</p>`);
        } else if (channel === "sms") {
          if (!customer.phone) throw new Error("Customer has no phone number");
          if (!termiiApiKey) throw new Error("TERMII_API_KEY not configured");
          await sendSms(termiiApiKey, termiiSenderId, customer.phone, message);
        } else {
          if (!customer.phone) throw new Error("Customer has no phone number");
          if (!whatsappToken || !whatsappPhoneId) throw new Error("WhatsApp credentials are not configured");
          await sendWhatsApp(whatsappToken, whatsappPhoneId, customer.phone, message);
        }

        sentCount += 1;
        await adminClient
          .from("customer_reactivation_recipients")
          .update({ send_status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", recipient.id);

        await adminClient.from("message_logs").insert({
          tenant_id: campaign.tenant_id,
          customer_id: customer.id,
          channel,
          recipient: channel === "email" ? customer.email : customer.phone,
          status: "sent",
          template_type: "customer_reactivation",
          subject: channel === "email" ? subject : null,
          credits_used: CREDIT_COST[channel],
          sent_at: new Date().toISOString(),
        });
      } catch (error) {
        failedCount += 1;
        await adminClient
          .from("customer_reactivation_recipients")
          .update({
            send_status: "failed",
            error_message: error instanceof Error ? error.message : "Send failed",
          })
          .eq("id", recipient.id);
      }
    }

    const usedCredits = sentCount * CREDIT_COST[channel];
    await adminClient
      .from("communication_credits")
      .update({ balance: Math.max(0, creditWallet.balance - usedCredits) })
      .eq("tenant_id", campaign.tenant_id);

    await adminClient
      .from("customer_reactivation_campaigns")
      .update({
        status: failedCount === 0 ? "sent" : sentCount > 0 ? "sent" : "failed",
      })
      .eq("id", campaign.id);

    await adminClient.from("audit_logs").insert({
      action: "customer_reactivation_sent",
      entity_type: "customer_reactivation_campaigns",
      entity_id: campaign.id,
      actor_user_id: user.id,
      metadata: {
        channel,
        sent_count: sentCount,
        failed_count: failedCount,
        credits_used: usedCredits,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      sent_count: sentCount,
      failed_count: failedCount,
      credits_used: usedCredits,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-reactivation-campaign error", error);
    return new Response(JSON.stringify({ error: "Unexpected campaign send error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
