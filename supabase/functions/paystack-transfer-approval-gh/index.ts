import { verifyPaystackSignature } from "../_shared/payment-webhook-processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

/**
 * Paystack Transfer Approval Endpoint (Ghana - GHS)
 * 
 * This endpoint is called by Paystack when a transfer is initiated that requires
 * URL approval. Paystack sends an approval request and waits for a response:
 * 
 * - 200 response: Transfer is approved and will proceed (status: pending)
 * - 400 response: Transfer is rejected (status: rejected)
 * - No response/timeout: Transfer is blocked
 * 
 * Currently, this endpoint logs all transfer requests and approves them by default.
 * 
 * Configure this URL in Paystack Dashboard:
 * Settings → Transfers → URL Approval
 */

Deno.serve(async (req) => {
  const requestStartTime = new Date().toISOString();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=".repeat(80));
    console.log("PAYSTACK TRANSFER APPROVAL REQUEST (GH)");
    console.log("=".repeat(80));
    console.log("Timestamp:", requestStartTime);
    console.log("Method:", req.method);
    console.log("URL:", req.url);

    // Log all headers
    console.log("\n--- REQUEST HEADERS ---");
    const headers = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
      console.log(`${key}: ${value}`);
    });

    // Get raw body for verification and logging
    const rawBody = await req.text();

    console.log("\n--- RAW REQUEST BODY ---");
    console.log(rawBody);

    // Parse JSON payload
    let body: Record<string, unknown>;

    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("ERROR: Invalid JSON payload");
      console.error("Parse error:", parseError);
      console.log("=".repeat(80));
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("\n--- PARSED JSON PAYLOAD ---");
    console.log(JSON.stringify(body, null, 2));

    // Verify event origin by checking IP (Paystack IPs: 52.31.139.75, 52.49.173.169, 52.214.14.220)
    // Note: This relies on Supabase edge functions 'x-forwarded-for' which may vary.
    // For a highly secure production system, you would want to check database references here.
    const paystackIPs = ["52.31.139.75", "52.49.173.169", "52.214.14.220"];
    const forwardedFor = req.headers.get("x-forwarded-for");
    
    // We log it but do not strictly block if the IP isn't parsed perfectly, to prevent 
    // blocking legitimate approvals if proxy layers change.
    if (forwardedFor) {
      const isPaystackIP = paystackIPs.some(ip => forwardedFor.includes(ip));
      if (isPaystackIP) {
        console.log("IP verification: PASSED ✓ (Found Paystack IP)");
      } else {
        console.warn(`WARNING: Request did not match known Paystack IPs. forwarded-for: ${forwardedFor}`);
      }
    } else {
      console.warn("WARNING: No x-forwarded-for header found to verify IP.");
    }

    // Extract and log transfer details
    const paystackEvent = body as {
      event?: string;
      data?: {
        transfer_code?: string;
        reference?: string;
        amount?: number;
        currency?: string;
        reason?: string;
        status?: string;
        recipient?: {
          recipient_code?: string;
          account_number?: string;
          account_name?: string;
          bank_code?: string;
          bank_name?: string;
        };
        metadata?: any;
        created_at?: string;
        updated_at?: string;
      };
    };

    console.log("\n--- TRANSFER DETAILS ---");
    console.log("Event Type:", paystackEvent.event || "N/A");
    
    if (paystackEvent.data) {
      const data = paystackEvent.data;
      console.log("Transfer Code:", data.transfer_code || "N/A");
      console.log("Reference:", data.reference || "N/A");
      console.log("Amount:", data.amount ? `${data.amount / 100} ${data.currency || ""}` : "N/A");
      console.log("Currency:", data.currency || "N/A");
      console.log("Reason:", data.reason || "N/A");
      console.log("Status:", data.status || "N/A");
      
      if (data.recipient) {
        console.log("\n--- RECIPIENT DETAILS ---");
        console.log("Recipient Code:", data.recipient.recipient_code || "N/A");
        console.log("Account Number:", data.recipient.account_number || "N/A");
        console.log("Account Name:", data.recipient.account_name || "N/A");
        console.log("Bank Code:", data.recipient.bank_code || "N/A");
        console.log("Bank Name:", data.recipient.bank_name || "N/A");
      }

      if (data.metadata) {
        console.log("\n--- METADATA ---");
        console.log(JSON.stringify(data.metadata, null, 2));
      }

      console.log("\n--- TIMESTAMPS ---");
      console.log("Created At:", data.created_at || "N/A");
      console.log("Updated At:", data.updated_at || "N/A");
    }

    // Log approval decision
    console.log("\n--- APPROVAL DECISION ---");
    console.log("Action: APPROVE");
    console.log("Response Code: 200");
    console.log("Transfer will proceed with status: pending");

    const responseTime = new Date().toISOString();
    console.log("\n--- RESPONSE ---");
    console.log("Response Timestamp:", responseTime);
    console.log("Processing Time:", `${new Date(responseTime).getTime() - new Date(requestStartTime).getTime()}ms`);

    console.log("=".repeat(80));
    console.log("");

    // Return 200 to approve the transfer
    return new Response(
      JSON.stringify({ 
        status: "approved",
        message: "Transfer approved successfully",
        timestamp: responseTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("\n--- UNEXPECTED ERROR ---");
    console.error("Error Type:", error?.constructor?.name || "Unknown");
    console.error("Error Message:", error?.message || "No message");
    console.error("Error Stack:", error?.stack || "No stack trace");
    console.log("=".repeat(80));
    console.log("");

    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: "An unexpected error occurred processing the approval request",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
