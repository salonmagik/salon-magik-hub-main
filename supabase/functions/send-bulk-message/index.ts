import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFromAddress, wrapEmailTemplate } from "../_shared/email-template.ts";
import { sendArkeselSMS, extractArkeselMessageId, resolveArkeselSenderId } from "../_shared/arkesel-client.ts";
import { checkAndAlertLowSmsBalance } from "../_shared/check-low-balance.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendBulkMessageRequest {
  customerIds: string[];
  channel: "email" | "sms" | "whatsapp";
  message: string;
  subject?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  senderContext?: {
    senderDisplayName?: string;
  };
}

type BulkCustomerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  tenant_id: string | null;
};

interface BulkMessageResult {
  sent: number;
  failed: number;
  creditsUsed: number;
  failedMessages: Array<{
    customerId: string;
    customerName: string;
    error: string;
  }>;
}

// Credit costs per channel
const CREDIT_COST: Record<string, number> = {
  email: 0,
  sms: 2,
  whatsapp: 2,
};

function getSmsSegments(message: string) {
  return Math.max(1, Math.ceil(Math.max(message.trim().length, 1) / 160));
}

function replaceMessageVars(
  text: string,
  vars: { customerName: string; salonName: string; bookingLink: string },
): string {
  return text
    .replace(/\{\{customer_name\}\}/gi, vars.customerName)
    .replace(/\{\{salon_name\}\}/gi, vars.salonName)
    .replace(/\{\{booking_link\}\}/gi, vars.bookingLink);
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

    const requestBody: SendBulkMessageRequest = await req.json();
    const { customerIds, channel, message, subject, templateId, templateVariables, senderContext } = requestBody;
    const normalizedCustomerIds = [...new Set((customerIds || []).map((id) => String(id || "").trim()).filter(Boolean))];

    // Validate required fields
    if (!customerIds || !Array.isArray(customerIds) || normalizedCustomerIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "customerIds must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!channel || !["email", "sms", "whatsapp"].includes(channel)) {
      return new Response(
        JSON.stringify({ error: "channel must be one of: email, sms, whatsapp" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!message && channel !== "whatsapp") {
      return new Response(
        JSON.stringify({ error: "message is required for email and sms channels" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (channel === "whatsapp" && !templateId && !message) {
      return new Response(
        JSON.stringify({ error: "Either templateId or message is required for whatsapp channel" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch customers directly first. Avoid relationship joins here so valid customers
    // cannot be masked as "not found" because of relation or schema drift.
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id, full_name, email, phone, tenant_id")
      .in("id", normalizedCustomerIds);

    if (customersError || !customers || customers.length === 0) {
      console.error("Failed to fetch customers:", customersError);
      return new Response(
        JSON.stringify({
          error: "No valid customers found",
          debug: {
            requestedCustomerIds: normalizedCustomerIds,
            matchedCustomerIds: [],
            reason: customersError ? String((customersError as { message?: string }).message || customersError) : "no_rows",
          },
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedCustomers = customers as BulkCustomerRow[];

    // Verify all customers belong to same tenant
    const tenantIds = [...new Set(typedCustomers.map((c) => c.tenant_id).filter(Boolean))];
    if (tenantIds.length > 1) {
      return new Response(
        JSON.stringify({ error: "All customers must belong to the same tenant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = tenantIds[0];
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "Customers are missing tenant ownership." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has permission for tenant
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to send messages for this tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.error("Failed to fetch tenant for bulk send:", tenantError, { tenantId, normalizedCustomerIds });
      return new Response(
        JSON.stringify({
          error: "Salon details could not be loaded. Please retry.",
          debug: {
            tenantId,
            matchedCustomerIds: typedCustomers.map((customer) => customer.id),
            reason: tenantError ? String((tenantError as { message?: string }).message || tenantError) : "tenant_missing",
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderDisplayName = senderContext?.senderDisplayName?.trim() || tenant.name;

    // Calculate total credits required
    const creditsPerMessage = CREDIT_COST[channel] ?? 1;
    const smsSegments = channel === "sms" ? getSmsSegments(message) : 1;
    const totalCreditsRequired = typedCustomers.length * creditsPerMessage * smsSegments;

    // Check credit balance
    const { data: creditBalance, error: creditError } = await supabase
      .from("communication_credits")
      .select("balance")
      .eq("tenant_id", tenantId)
      .single();

    if (creditError || !creditBalance) {
      console.error("Failed to fetch credit balance:", creditError);
      return new Response(
        JSON.stringify({ error: "Credit balance not found. Please contact support." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (creditBalance.balance < totalCreditsRequired) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Required: ${totalCreditsRequired} (${creditsPerMessage * smsSegments} per message × ${typedCustomers.length} customers), Available: ${creditBalance.balance}. Please purchase more credits.`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch template if WhatsApp channel
    let template = null;
    if (channel === "whatsapp" && templateId) {
      const { data: templateData, error: templateError } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .single();

      if (templateError || !templateData) {
        return new Response(
          JSON.stringify({ error: "WhatsApp template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (templateData.status !== "approved") {
        return new Response(
          JSON.stringify({ error: "WhatsApp template is not approved. Please wait for approval before sending." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      template = templateData;
    }

    // Create manual_messages records for all customers
    const manualMessagesData = typedCustomers.map(customer => ({
      tenant_id: tenantId,
      customer_id: customer.id,
      channel,
      subject: subject || null,
      message: message || null,
      template_id: templateId || null,
      template_variables: templateVariables || null,
      status: "pending" as const,
      sent_by_user_id: user.id,
      credits_used: 0, // Will be updated after send
    }));

    const { data: createdMessages, error: createError } = await supabase
      .from("manual_messages")
      .insert(manualMessagesData)
      .select("id, customer_id");

    if (createError || !createdMessages) {
      console.error("Failed to create manual messages:", createError);
      return new Response(
        JSON.stringify({ error: "Failed to create message records" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build result tracking
    const result: BulkMessageResult = {
      sent: 0,
      failed: 0,
      creditsUsed: 0,
      failedMessages: [],
    };

    // Process messages by channel
    if (channel === "sms") {
      // SMS: Use bulk API for batches up to 100
      await processBulkSMS(
        supabase,
        typedCustomers,
        createdMessages,
        message,
        tenant,
        creditsPerMessage * smsSegments,
        result
      );

      const { data: creditsAfterBulk } = await supabase
        .from("communication_credits")
        .select("balance")
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      if (creditsAfterBulk) {
        await checkAndAlertLowSmsBalance(supabase, tenant.id, creditsAfterBulk.balance, {
          resendApiKey: Deno.env.get("RESEND_API_KEY"),
        });
      }
    } else if (channel === "email") {
      // Email: Process in batches of 10 to avoid timeouts
      await processBulkEmail(
        supabase,
        typedCustomers,
        createdMessages,
        message,
        subject,
        tenant,
        senderDisplayName,
        creditsPerMessage,
        result
      );
    }

    // Log bulk operation in audit_logs
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: "bulk_message_sent",
      resource_type: "manual_messages",
      resource_id: null,
      details: {
        channel,
        total_recipients: typedCustomers.length,
        sent: result.sent,
        failed: result.failed,
        credits_used: result.creditsUsed,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        sent: result.sent,
        failed: result.failed,
        creditsUsed: result.creditsUsed,
        failedMessages: result.failedMessages,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-bulk-message function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

/**
 * Process bulk SMS messages via market-aware provider routing.
 */
async function processBulkSMS(
  supabase: any,
  customers: any[],
  createdMessages: any[],
  message: string,
  tenant: any,
  creditsPerMessage: number,
  result: BulkMessageResult
) {
  const tenantSenderId = tenant.sms_sender_name || null;
  const BATCH_SIZE = 25;

  const bookingBaseUrl = Deno.env.get("PUBLIC_BOOKING_URL") || "https://booking.salonmagik.com";
  const bookingLink = tenant.slug
    ? `${bookingBaseUrl}/?slug=${tenant.slug}`
    : bookingBaseUrl;

  // Process in smaller batches to avoid timeouts and keep per-message status.
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    const batchMessages = createdMessages.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (customer, index) => {
      const messageRecord = batchMessages[index];
      let resolvedMessage: string | null = null;
      try {
        if (!customer.phone) {
          throw new Error("Customer has no phone number");
        }

        resolvedMessage = replaceMessageVars(message, {
          customerName: customer.full_name || "Valued Customer",
          salonName: tenant.name,
          bookingLink,
        });

        const smsResponse = await sendArkeselSMS({
          to: customer.phone,
          from: resolveArkeselSenderId(customer.phone, tenantSenderId, "promotional"),
          message: resolvedMessage,
          useCase: "promotional",
        });

        await supabase.rpc("deduct_communication_credits", {
          p_tenant_id: tenant.id,
          p_amount: creditsPerMessage,
        });

        await supabase
          .from("manual_messages")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            credits_used: creditsPerMessage,
          })
          .eq("id", messageRecord.id);

        await supabase.from("message_logs").insert({
          tenant_id: tenant.id,
          customer_id: customer.id,
          channel: "sms",
          recipient: customer.phone,
          subject: null,
          content: resolvedMessage,
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: "arkesel_sms",
          initiated_by: "salon",
          credits_used: creditsPerMessage,
          error_message: null,
        });

        result.sent++;
        result.creditsUsed += creditsPerMessage;
      } catch (error: any) {
        const errMsg = error.message || "Failed to send SMS";
        result.failed++;
        result.failedMessages.push({
          customerId: customer.id,
          customerName: customer.full_name,
          error: errMsg,
        });

        await supabase
          .from("manual_messages")
          .update({ status: "failed", error_message: errMsg })
          .eq("id", messageRecord.id);

        // Record failed attempts in message_logs so they appear in delivery history.
        await supabase.from("message_logs").insert({
          tenant_id: tenant.id,
          customer_id: customer.id,
          channel: "sms",
          recipient: customer.phone || null,
          subject: null,
          content: resolvedMessage,
          status: "failed",
          sent_at: new Date().toISOString(),
          provider: "arkesel_sms",
          initiated_by: "salon",
          credits_used: 0,
          error_message: errMsg,
        });
      }
    });

    await Promise.allSettled(promises);
  }
}

/**
 * Process bulk email messages in batches of 10
 */
async function processBulkEmail(
  supabase: any,
  customers: any[],
  createdMessages: any[],
  message: string,
  subject: string | undefined,
  tenant: any,
  senderDisplayName: string,
  creditsPerMessage: number,
  result: BulkMessageResult
) {
  const BATCH_SIZE = 10;
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
  const fromAddress = buildFromAddress({
    mode: "salon",
    salonName: senderDisplayName || tenant.name,
    fromEmail,
  });

  const bookingBaseUrl = Deno.env.get("PUBLIC_BOOKING_URL") || "https://booking.salonmagik.com";
  const bookingLink = tenant.slug
    ? `${bookingBaseUrl}/?slug=${tenant.slug}`
    : bookingBaseUrl;

  // Process in batches of 10
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    const batchMessages = createdMessages.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const promises = batch.map(async (customer, index) => {
      const messageRecord = batchMessages[index];

      // Resolve template variables outside try so catch can reference them.
      const vars = {
        customerName: customer.full_name || "Valued Customer",
        salonName: tenant.name,
        bookingLink,
      };
      const resolvedMessage = replaceMessageVars(message, vars);
      const resolvedSubject = subject
        ? replaceMessageVars(subject, vars)
        : `Message from ${senderDisplayName || tenant.name}`;

      try {
        if (!customer.email) {
          throw new Error("Customer has no email address");
        }

        const htmlMessage = wrapEmailTemplate(resolvedMessage, {
          mode: "salon",
          salonName: senderDisplayName || tenant.name,
        });

        // Send email via Resend
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [customer.email],
            subject: resolvedSubject,
            html: htmlMessage,
          }),
        });

        const emailData = await emailResponse.json();

        if (!emailResponse.ok) {
          console.error("Resend API error:", emailData);
          throw new Error(emailData.message || "Failed to send email");
        }

        // Deduct credits from tenant (atomic RPC)
        await supabase.rpc("deduct_communication_credits", {
          p_tenant_id: tenant.id,
          p_amount: creditsPerMessage,
        });

        // Update manual_messages
        await supabase
          .from("manual_messages")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            credits_used: creditsPerMessage,
          })
          .eq("id", messageRecord.id);

        // Insert message_logs
        await supabase.from("message_logs").insert({
          tenant_id: tenant.id,
          customer_id: customer.id,
          channel: "email",
          recipient: customer.email,
          subject: resolvedSubject || null,
          content: resolvedMessage,
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: "resend",
          initiated_by: "salon",
          credits_used: creditsPerMessage,
          error_message: null,
        });

        // Success - increment after accounting succeeds
        result.sent++;
        result.creditsUsed += creditsPerMessage;
      } catch (error: any) {
        const errMsg = error.message || "Failed to send email";
        console.error(`Failed to send email to ${customer.full_name}:`, error);

        result.failed++;
        result.failedMessages.push({
          customerId: customer.id,
          customerName: customer.full_name,
          error: errMsg,
        });

        await supabase
          .from("manual_messages")
          .update({ status: "failed", error_message: errMsg })
          .eq("id", messageRecord.id);

        // Record failed attempts in message_logs so they appear in delivery history.
        await supabase.from("message_logs").insert({
          tenant_id: tenant.id,
          customer_id: customer.id,
          channel: "email",
          recipient: customer.email || null,
          subject: resolvedSubject || null,
          content: resolvedMessage,
          status: "failed",
          sent_at: new Date().toISOString(),
          provider: "resend",
          initiated_by: "salon",
          credits_used: 0,
          error_message: errMsg,
        });
      }
    });

    // Wait for batch to complete
    await Promise.allSettled(promises);
  }
}


serve(handler);
