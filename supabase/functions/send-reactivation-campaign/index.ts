import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate } from "../_shared/email-template.ts";
import { sendArkeselSMS, resolveArkeselSenderId } from "../_shared/arkesel-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Channel = "email" | "sms" | "whatsapp";

const CREDIT_COST: Record<Channel, number> = {
  email: 0,
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

async function sendSms(senderId: string, to: string, text: string) {
  await sendArkeselSMS({ to, from: senderId, message: text, useCase: "promotional" });
  return "arkesel_sms";
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

    // Fetch tenant messaging configuration
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("country, sms_sender_name")
      .eq("id", campaign.tenant_id)
      .single();

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

    type CustomerRow = { id: string; email: string | null; phone: string | null; full_name: string | null };
    const customerMap = new Map((customers || []).map((c: CustomerRow) => [c.id, c]));

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
    const tenantSenderId = tenant?.sms_sender_name || null;

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
          await sendEmail(
            resendApiKey,
            buildFromAddress({ mode: "salon", salonName: tenant?.name, fromEmail: resendFromEmail }),
            customer.email,
            subject,
            wrapEmailTemplate(`<p>${message}</p>`, { mode: "salon", salonName: tenant?.name }),
          );
        } else if (channel === "sms") {
          if (!customer.phone) throw new Error("Customer has no phone number");
          await sendSms(resolveArkeselSenderId(customer.phone, tenantSenderId), customer.phone, message);
        } else if (channel === "whatsapp") {
          throw new Error("WhatsApp channel is not yet available");
        }

        sentCount += 1;
        await adminClient
          .from("customer_reactivation_recipients")
          .update({ send_status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", recipient.id);

        // Determine provider value for message_logs
        let provider: string;
        if (channel === "email") {
          provider = "resend";
        } else if (channel === "sms") {
          provider = "arkesel_sms";
        } else {
          provider = "resend"; // Fallback
        }

        await adminClient.from("message_logs").insert({
          tenant_id: campaign.tenant_id,
          customer_id: customer.id,
          channel,
          recipient: channel === "email" ? customer.email : customer.phone,
          status: "sent",
          template_type: "customer_reactivation",
          subject: channel === "email" ? subject : null,
          provider,
          initiated_by: "salon",
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
