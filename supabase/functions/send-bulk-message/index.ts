import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTermiiSMS, sendTermiiBulkSMS, sendTermiiWhatsAppTemplate } from "../_shared/termii-client.ts";

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
}

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
  email: 1,
  sms: 2,
  whatsapp: 2,
};

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
    const { customerIds, channel, message, subject, templateId, templateVariables } = requestBody;

    // Validate required fields
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
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

    // Fetch customers with joins to validate they exist and belong to tenant
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select(`
        id,
        full_name,
        email,
        phone,
        tenant_id,
        tenant:tenants(id, name, termii_device_id, termii_sender_id)
      `)
      .in("id", customerIds);

    if (customersError || !customers || customers.length === 0) {
      console.error("Failed to fetch customers:", customersError);
      return new Response(
        JSON.stringify({ error: "No valid customers found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify all customers belong to same tenant
    const tenantIds = [...new Set(customers.map(c => c.tenant_id))];
    if (tenantIds.length > 1) {
      return new Response(
        JSON.stringify({ error: "All customers must belong to the same tenant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = tenantIds[0];

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

    const tenant = customers[0].tenant;

    // Calculate total credits required
    const creditsPerMessage = CREDIT_COST[channel] || 1;
    const totalCreditsRequired = customers.length * creditsPerMessage;

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
          error: `Insufficient credits. Required: ${totalCreditsRequired} (${creditsPerMessage} per message × ${customers.length} customers), Available: ${creditBalance.balance}. Please purchase more credits.`
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
    const manualMessagesData = customers.map(customer => ({
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
        customers,
        createdMessages,
        message,
        tenant,
        creditsPerMessage,
        result
      );
    } else if (channel === "email") {
      // Email: Process in batches of 10 to avoid timeouts
      await processBulkEmail(
        supabase,
        customers,
        createdMessages,
        message,
        subject,
        tenant,
        creditsPerMessage,
        result
      );
    } else if (channel === "whatsapp") {
      // WhatsApp: Process individually (Termii API requires single recipient)
      await processBulkWhatsApp(
        supabase,
        customers,
        createdMessages,
        message,
        template,
        templateVariables,
        tenant,
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
        total_recipients: customers.length,
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
 * Process bulk SMS messages using Termii bulk API
 * Splits into batches of 100 if needed
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
  const senderID = tenant.termii_sender_id || "SalonMagik";
  const BATCH_SIZE = 100;

  // Split into batches of 100
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    const batchMessages = createdMessages.slice(i, i + BATCH_SIZE);

    // Filter customers with valid phone numbers
    const validCustomers = batch.filter(c => c.phone);
    const phoneNumbers = validCustomers.map(c => c.phone);

    if (phoneNumbers.length === 0) {
      // All customers in batch have no phone number
      for (let j = 0; j < batch.length; j++) {
        const customer = batch[j];
        const messageRecord = batchMessages[j];

        result.failed++;
        result.failedMessages.push({
          customerId: customer.id,
          customerName: customer.full_name,
          error: "Customer has no phone number",
        });

        // Update manual_messages status to failed
        await supabase
          .from("manual_messages")
          .update({
            status: "failed",
            error_message: "Customer has no phone number",
          })
          .eq("id", messageRecord.id);
      }
      continue;
    }

    try {
      // Send bulk SMS
      const smsResponse = await sendTermiiBulkSMS({
        to: phoneNumbers,
        from: senderID,
        sms: message,
        type: "plain",
        channel: "generic",
      });

      // Mark all as sent and deduct credits
      const successCount = validCustomers.length;
      const creditsUsed = successCount * creditsPerMessage;

      result.sent += successCount;
      result.creditsUsed += creditsUsed;

      // Deduct credits from tenant
      await supabase
        .from("communication_credits")
        .update({
          balance: supabase.raw(`balance - ${creditsUsed}`),
        })
        .eq("tenant_id", tenant.id);

      // Update manual_messages and insert message_logs for successful sends
      for (let j = 0; j < batch.length; j++) {
        const customer = batch[j];
        const messageRecord = batchMessages[j];

        if (!customer.phone) {
          // Already handled above
          continue;
        }

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
          channel: "sms",
          recipient: customer.phone,
          subject: null,
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: "termii_sms",
          termii_message_id: smsResponse.message_id,
          termii_device_id: null,
          initiated_by: "salon",
          credits_used: creditsPerMessage,
          error_message: null,
        });
      }

      // Mark customers with no phone as failed
      for (let j = 0; j < batch.length; j++) {
        const customer = batch[j];
        if (!customer.phone) {
          result.failed++;
          result.failedMessages.push({
            customerId: customer.id,
            customerName: customer.full_name,
            error: "Customer has no phone number",
          });
        }
      }
    } catch (error: any) {
      console.error("Bulk SMS batch failed:", error);

      // Mark all in batch as failed
      for (let j = 0; j < batch.length; j++) {
        const customer = batch[j];
        const messageRecord = batchMessages[j];

        result.failed++;
        result.failedMessages.push({
          customerId: customer.id,
          customerName: customer.full_name,
          error: error.message || "Failed to send SMS",
        });

        // Update manual_messages status to failed
        await supabase
          .from("manual_messages")
          .update({
            status: "failed",
            error_message: error.message || "Failed to send SMS",
          })
          .eq("id", messageRecord.id);
      }
    }
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
  creditsPerMessage: number,
  result: BulkMessageResult
) {
  const BATCH_SIZE = 10;
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
  const fromAddress = `${tenant.name} <${fromEmail}>`;

  // Process in batches of 10
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    const batchMessages = createdMessages.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const promises = batch.map(async (customer, index) => {
      const messageRecord = batchMessages[index];

      try {
        if (!customer.email) {
          throw new Error("Customer has no email address");
        }

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
            subject: subject || "Message from " + tenant.name,
            html: message,
          }),
        });

        const emailData = await emailResponse.json();

        if (!emailResponse.ok) {
          console.error("Resend API error:", emailData);
          throw new Error(emailData.message || "Failed to send email");
        }

        // Success - deduct credits
        result.sent++;
        result.creditsUsed += creditsPerMessage;

        // Deduct credits from tenant
        await supabase
          .from("communication_credits")
          .update({
            balance: supabase.raw(`balance - ${creditsPerMessage}`),
          })
          .eq("tenant_id", tenant.id);

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
          subject: subject || null,
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: "resend",
          termii_message_id: null,
          termii_device_id: null,
          initiated_by: "salon",
          credits_used: creditsPerMessage,
          error_message: null,
        });
      } catch (error: any) {
        console.error(`Failed to send email to ${customer.full_name}:`, error);

        result.failed++;
        result.failedMessages.push({
          customerId: customer.id,
          customerName: customer.full_name,
          error: error.message || "Failed to send email",
        });

        // Update manual_messages status to failed
        await supabase
          .from("manual_messages")
          .update({
            status: "failed",
            error_message: error.message || "Failed to send email",
          })
          .eq("id", messageRecord.id);
      }
    });

    // Wait for batch to complete
    await Promise.allSettled(promises);
  }
}

/**
 * Process bulk WhatsApp messages individually (Termii requires single recipient)
 */
async function processBulkWhatsApp(
  supabase: any,
  customers: any[],
  createdMessages: any[],
  message: string | null,
  template: any | null,
  templateVariables: Record<string, string> | undefined,
  tenant: any,
  creditsPerMessage: number,
  result: BulkMessageResult
) {
  const BATCH_SIZE = 10;
  const deviceId = tenant.termii_device_id;

  if (!deviceId) {
    // All messages fail if no device ID
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const messageRecord = createdMessages[i];

      result.failed++;
      result.failedMessages.push({
        customerId: customer.id,
        customerName: customer.full_name,
        error: "Termii device ID not configured for this tenant",
      });

      // Update manual_messages status to failed
      await supabase
        .from("manual_messages")
        .update({
          status: "failed",
          error_message: "Termii device ID not configured for this tenant",
        })
        .eq("id", messageRecord.id);
    }
    return;
  }

  // Convert template variables to numeric keys (for template mode)
  const templateData: Record<string, string> = {};
  if (templateVariables && typeof templateVariables === "object") {
    Object.keys(templateVariables).forEach((key, index) => {
      templateData[String(index + 1)] = templateVariables[key];
    });
  }

  // Process in batches of 10 to avoid timeouts
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    const batchMessages = createdMessages.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const promises = batch.map(async (customer, index) => {
      const messageRecord = batchMessages[index];

      try {
        if (!customer.phone) {
          throw new Error("Customer has no phone number");
        }

        let whatsappResponse;

        // Choose sending method based on whether template or custom message
        if (template && template.template_id) {
          // TEMPLATE MODE: Use pre-approved template
          whatsappResponse = await sendTermiiWhatsAppTemplate({
            device_id: deviceId,
            phone_number: customer.phone,
            template_id: template.template_id,
            data: templateData,
          });
        } else if (message) {
          // CONVERSATIONAL MODE: Send custom message using SMS endpoint with channel="whatsapp"
          whatsappResponse = await sendTermiiSMS({
            to: customer.phone,
            from: deviceId, // Use device_id as "from" for WhatsApp
            sms: message,
            type: "plain",
            channel: "whatsapp",
          });
        } else {
          throw new Error("Either template or message is required for WhatsApp");
        }

        // Success - deduct credits
        result.sent++;
        result.creditsUsed += creditsPerMessage;

        // Deduct credits from tenant
        await supabase
          .from("communication_credits")
          .update({
            balance: supabase.raw(`balance - ${creditsPerMessage}`),
          })
          .eq("tenant_id", tenant.id);

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
          channel: "whatsapp",
          recipient: customer.phone,
          subject: null,
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: "termii_whatsapp",
          termii_message_id: whatsappResponse.message_id,
          termii_device_id: deviceId,
          initiated_by: "salon",
          credits_used: creditsPerMessage,
          error_message: null,
        });
      } catch (error: any) {
        console.error(`Failed to send WhatsApp to ${customer.full_name}:`, error);

        result.failed++;
        result.failedMessages.push({
          customerId: customer.id,
          customerName: customer.full_name,
          error: error.message || "Failed to send WhatsApp",
        });

        // Update manual_messages status to failed
        await supabase
          .from("manual_messages")
          .update({
            status: "failed",
            error_message: error.message || "Failed to send WhatsApp",
          })
          .eq("id", messageRecord.id);
      }
    });

    // Wait for batch to complete
    await Promise.allSettled(promises);
  }
}

serve(handler);
