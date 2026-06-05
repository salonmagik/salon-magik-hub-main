import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress } from "../_shared/email-template.ts";
import { sendTermiiSMS, sendTermiiWhatsAppTemplate } from "../_shared/termii-client.ts";
import { sendTxtconnectSMS } from "../_shared/txtconnect-client.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendManualMessageRequest {
  messageId: string;
}

// Credit costs per channel
const CREDIT_COST: Record<string, number> = {
  email: 0,
  sms: 2,
  whatsapp: 2,
};

function normalizeCountry(country?: string | null) {
  return String(country || "").trim().toLowerCase();
}

function isGhanaMarket(country?: string | null) {
  const normalized = normalizeCountry(country);
  return normalized === "ghana" || normalized === "gh";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Verify the user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client with user's auth
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session. Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messageId }: SendManualMessageRequest = await req.json();

    // Validate required fields
    if (!messageId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: messageId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the row first without joins. This avoids joined-read fragility and lets us retry
    // immediately after the insert in case the function reads before the row becomes visible.
    let messageRecord: Record<string, any> | null = null;
    let messageError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await supabase
        .from("manual_messages")
        .select("*")
        .eq("id", messageId)
        .maybeSingle();

      messageRecord = response.data as Record<string, any> | null;
      messageError = response.error;

      if (messageRecord) break;
      if (attempt < 2) {
        await sleep(120 * (attempt + 1));
      }
    }

    if (messageError || !messageRecord) {
      console.error("Failed to fetch message:", messageError, { messageId });
      return new Response(
        JSON.stringify({
          error: "Message not found",
          debug: {
            messageId,
            reason: messageError ? String((messageError as { message?: string }).message || messageError) : "row_missing",
          },
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", messageRecord.customer_id)
      .maybeSingle();

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", messageRecord.tenant_id)
      .maybeSingle();

    const templateId = messageRecord.template_id as string | null;
    let template: Record<string, any> | null = null;
    if (templateId) {
      const templateResponse = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", templateId)
        .maybeSingle();
      template = (templateResponse.data as Record<string, any> | null) || null;
    }

    if (customerError || !customer || tenantError || !tenant) {
      console.error("Failed to hydrate manual message relations:", {
        messageId,
        customerError,
        tenantError,
        customerId: messageRecord.customer_id,
        tenantId: messageRecord.tenant_id,
      });
      return new Response(
        JSON.stringify({
          error: "Message data could not be loaded. Please retry.",
          debug: {
            messageId,
            customerId: messageRecord.customer_id,
            tenantId: messageRecord.tenant_id,
            missingCustomer: !customer,
            missingTenant: !tenant,
            customerError: customerError ? String((customerError as { message?: string }).message || customerError) : null,
            tenantError: tenantError ? String((tenantError as { message?: string }).message || tenantError) : null,
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = {
      ...messageRecord,
      customer,
      tenant,
      template,
    };

    // Verify user has permission for tenant
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", message.tenant_id)
      .single();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to send messages for this tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if message already sent
    if (message.status === "sent") {
      return new Response(
        JSON.stringify({ error: "Message already sent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate credits required
    const creditsRequired = CREDIT_COST[message.channel] || 1;

    // Only check credit balance for paid channels (SMS, WhatsApp). Email is always free.
    let creditBalance: { balance: number } | null = null;
    if (creditsRequired > 0) {
      const { data, error: creditError } = await supabase
        .from("communication_credits")
        .select("balance")
        .eq("tenant_id", message.tenant_id)
        .single();

      if (creditError || !data) {
        console.error("Failed to fetch credit balance:", creditError);
        await supabase
          .from("manual_messages")
          .update({
            status: "failed",
            error_message: "Credit balance not found. Please contact support.",
          })
          .eq("id", messageId);

        return new Response(
          JSON.stringify({ error: "Credit balance not found. Please contact support." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      creditBalance = data;

      if (creditBalance.balance < creditsRequired) {
        await supabase
          .from("manual_messages")
          .update({
            status: "failed",
            error_message: `Insufficient credits. Required: ${creditsRequired}, Available: ${creditBalance.balance}`,
          })
          .eq("id", messageId);

        return new Response(
          JSON.stringify({
            error: `Insufficient credits. Required: ${creditsRequired}, Available: ${creditBalance.balance}. Please purchase more credits.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Send message based on channel
    let provider = "";
    let termiiMessageId = null;
    let success = false;
    let errorMessage = null;

    try {
      if (message.channel === "email") {
        // Send via Resend
        provider = "resend";

        if (!message.customer?.email) {
          throw new Error("Customer email not found");
        }

        const composeMeta = (message.template_variables as { _compose?: Record<string, unknown> } | null)?._compose || {};
        const senderDisplayName =
          typeof composeMeta.senderDisplayName === "string" && composeMeta.senderDisplayName.trim().length > 0
            ? composeMeta.senderDisplayName.trim()
            : message.tenant.name;
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
        const fromAddress = buildFromAddress({
          mode: "salon",
          salonName: senderDisplayName,
          fromEmail,
        });
        const html =
          typeof message.message === "string" && /<[^>]+>/.test(message.message)
            ? message.message
            : `<p>${String(message.message || "").replace(/\n/g, "<br />")}</p>`;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [message.customer.email],
            subject: message.subject || "Message from " + senderDisplayName,
            html,
          }),
        });

        const emailData = await emailResponse.json();

        if (!emailResponse.ok) {
          console.error("Resend API error:", emailData);
          throw new Error(emailData.message || "Failed to send email");
        }

        success = true;

      } else if (message.channel === "sms") {
        const senderID = message.tenant.sms_sender_name || message.tenant.termii_sender_id || "SalonMagik";
        const isGhanaTenant = isGhanaMarket(message.tenant.country);

        if (!message.customer?.phone) {
          throw new Error("Customer phone number not found");
        }

        if (isGhanaTenant) {
          provider = "txtconnect_sms";
          const smsResponse = await sendTxtconnectSMS({
            to: message.customer.phone,
            from: senderID,
            sms: message.message,
          });
          termiiMessageId = smsResponse.messageId;
        } else {
          provider = "termii_sms";
          const smsResponse = await sendTermiiSMS({
            to: message.customer.phone,
            from: senderID,
            sms: message.message,
            type: "plain",
            channel: "generic",
          });
          termiiMessageId = smsResponse.message_id;
        }

        success = true;

      } else if (message.channel === "whatsapp") {
        // Send via Termii WhatsApp Template
        provider = "termii_whatsapp";

        if (!message.customer?.phone) {
          throw new Error("Customer phone number not found");
        }

        if (!message.template_id) {
          throw new Error("WhatsApp template ID is required");
        }

        // Validate template is approved
        if (message.template?.status !== "approved") {
          throw new Error("WhatsApp template is not approved. Please wait for approval before sending.");
        }

        const deviceId = message.tenant.termii_device_id;
        if (!deviceId) {
          throw new Error("Termii device ID not configured for this tenant. Please configure in settings.");
        }

        // Build template data from template_variables
        const templateData: Record<string, string> = {};
        if (message.template_variables && typeof message.template_variables === "object") {
          // Convert template_variables to numeric keys for Termii
          const variables = message.template_variables as Record<string, string>;
          Object.keys(variables).forEach((key, index) => {
            templateData[String(index + 1)] = variables[key];
          });
        }

        const whatsappResponse = await sendTermiiWhatsAppTemplate({
          device_id: deviceId,
          phone_number: message.customer.phone,
          template_id: message.template.template_id,
          data: templateData,
        });

        termiiMessageId = whatsappResponse.message_id;
        success = true;

      } else {
        throw new Error(`Unsupported channel: ${message.channel}`);
      }
    } catch (error: any) {
      console.error(`Error sending ${message.channel} message:`, error);
      errorMessage = error.message || "Failed to send message";
      success = false;
    }

    // If message sent successfully, deduct credits
    if (success) {
      const { error: deductError } = await supabase
        .from("communication_credits")
        .update({
          balance: creditBalance.balance - creditsRequired,
        })
        .eq("tenant_id", message.tenant_id);

      if (deductError) {
        console.error("Failed to deduct credits:", deductError);
        // Continue - message was sent, credit deduction is secondary
      }
    }

    // Insert into message_logs
    await supabase.from("message_logs").insert({
      tenant_id: message.tenant_id,
      customer_id: message.customer_id,
      channel: message.channel,
      recipient: message.channel === "email" ? message.customer?.email : message.customer?.phone,
      subject: message.subject,
      status: success ? "sent" : "failed",
      sent_at: success ? new Date().toISOString() : null,
      provider,
      termii_message_id: termiiMessageId,
      termii_device_id: message.channel === "whatsapp" ? message.tenant.termii_device_id : null,
      initiated_by: "salon",
      credits_used: success ? creditsRequired : 0,
      error_message: errorMessage,
    });

    // Update manual_messages status
    await supabase
      .from("manual_messages")
      .update({
        status: success ? "sent" : "failed",
        sent_at: success ? new Date().toISOString() : null,
        error_message: errorMessage,
        credits_used: success ? creditsRequired : 0,
      })
      .eq("id", messageId);

    if (success) {
      return new Response(
        JSON.stringify({
          success: true,
          message_id: messageId,
          credits_used: creditsRequired,
          provider,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: errorMessage || "Failed to send message",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  } catch (error: any) {
    console.error("Error in send-manual-message function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
