import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyPaystackSignature } from "../_shared/payment-webhook-processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

/**
 * Paystack Transfer Approval Endpoint (Nigeria - NGN)
 * 
 * This endpoint is called by Paystack when a transfer is initiated that requires
 * URL approval. Paystack sends an approval request and waits for a response:
 * 
 * - 200 response: Transfer is approved and will proceed (status: pending)
 * - 400 response: Transfer is rejected (status: rejected)
 * - No response/timeout: Transfer is blocked
 * 
 * This endpoint validates the transfer approval request against `salon_withdrawals`.
 */
Deno.serve(async (req) => {
  const requestStartTime = new Date().toISOString();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY_NG");
    const paystackSignature = req.headers.get("x-paystack-signature");
    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const paystackIps = new Set(["52.31.139.75", "52.49.173.169", "52.214.14.220"]);
    const sourceIpAllowed = forwardedFor.split(",").map((value) => value.trim()).some((value) => paystackIps.has(value));
    const signatureValid = Boolean(
      paystackSecretKey &&
      paystackSignature &&
      (await verifyPaystackSignature(rawBody, paystackSignature, paystackSecretKey)),
    );
    if ((paystackSignature && !signatureValid) || (!signatureValid && !sourceIpAllowed)) {
      console.error("ERROR: Untrusted Paystack transfer approval request.");
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Untrusted approval request" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: any;

    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("ERROR: Invalid JSON payload");
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify event type
    if (body.event !== "transferrequest.approval-required") {
      console.warn(`WARNING: Ignored unhandled event type: ${body.event}`);
      // Return 200 so Paystack doesn't keep retrying unknown events, but don't process it
      return new Response(
        JSON.stringify({ status: "ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract details
    const approvalData = body.data?.details?.body;
    const transferData = body.data?.transfers?.[0];

    if (!approvalData || !transferData) {
      console.error("ERROR: Missing expected approval payload structure.");
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Invalid payload structure" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { reference, amount, currency, recipient } = approvalData;
    const transferCode = transferData.transfer_code;

    if (!reference || !amount || !currency || !recipient) {
      console.error("ERROR: Missing required fields in approval payload.", { reference, amount, currency, recipient });
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: withdrawal, error } = await supabase
      .from("salon_withdrawals")
      .select(`
        id,
        amount,
        currency,
        status,
        paystack_reference,
        salon_payout_destinations (
          paystack_recipient_code
        )
      `)
      .eq("paystack_reference", reference)
      .single();

    if (error || !withdrawal) {
      console.error(`ERROR: Withdrawal not found for reference ${reference}.`, error);
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Transfer reference not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify status
    if (withdrawal.status !== "pending") {
      console.error(`ERROR: Withdrawal ${withdrawal.id} is not pending (status: ${withdrawal.status}). Rejecting approval.`);
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Transfer is not in pending state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify currency
    if (withdrawal.currency.toUpperCase() !== currency.toUpperCase() || currency.toUpperCase() !== "NGN") {
      console.error(`ERROR: Currency mismatch. DB: ${withdrawal.currency}, Payload: ${currency}, Expected: NGN`);
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Currency mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify amount (Payload is in subunits, e.g. kobo)
    const expectedAmountKobo = Math.round(Number(withdrawal.amount) * 100);
    if (expectedAmountKobo !== amount) {
      console.error(`ERROR: Amount mismatch. DB (in subunits): ${expectedAmountKobo}, Payload: ${amount}`);
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Amount mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify recipient
    const destinations = withdrawal.salon_payout_destinations as unknown as
      | { paystack_recipient_code?: string }[]
      | { paystack_recipient_code?: string }
      | null;
    const expectedRecipient = Array.isArray(destinations)
      ? destinations[0]?.paystack_recipient_code
      : destinations?.paystack_recipient_code;
      
    if (expectedRecipient !== recipient) {
      console.error(`ERROR: Recipient mismatch. DB: ${expectedRecipient}, Payload: ${recipient}`);
      return new Response(
        JSON.stringify({ status: "rejected", reason: "Recipient mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional: Save the transfer code if we haven't already
    if (transferCode) {
      const { error: updateError } = await supabase
        .from("salon_withdrawals")
        .update({ paystack_transfer_code: transferCode })
        .eq("id", withdrawal.id)
        // Ensure we don't accidentally overwrite if it's already there
        .is("paystack_transfer_code", null);
        
      if (updateError) {
         console.warn(`WARNING: Failed to update transfer code: ${updateError.message}`);
      }
    }

    // Return 200 to approve the transfer
    return new Response(
      JSON.stringify({ 
        status: "approved",
        message: "Transfer approved successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const caughtError = error instanceof Error ? error : new Error("Unknown error");
    console.error("\n--- UNEXPECTED ERROR ---");
    console.error("Error Type:", caughtError.constructor.name);
    console.error("Error Message:", caughtError.message);
    console.error("Error Stack:", caughtError.stack || "No stack trace");
    console.log("=".repeat(80));

    return new Response(
      JSON.stringify({ 
        status: "rejected",
        reason: "Internal server error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
