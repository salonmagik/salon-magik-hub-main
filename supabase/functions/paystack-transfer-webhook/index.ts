import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

// Verify Paystack webhook signature using HMAC SHA512
async function verifyPaystackSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === signature;
  } catch (error) {
    console.error("Paystack signature verification error:", error);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecretKey) {
      console.error("PAYSTACK_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature
    const signature = req.headers.get("x-paystack-signature");
    const payload = await req.text();

    if (!signature) {
      console.error("Missing x-paystack-signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isValid = await verifyPaystackSignature(payload, signature, paystackSecretKey);
    if (!isValid) {
      console.error("Invalid Paystack signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse webhook event
    const event = JSON.parse(payload);
    console.log("Paystack transfer webhook event:", event.event);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const eventType = event.event;
    const data = event.data;

    // Handle different transfer events
    switch (eventType) {
      case "transfer.success": {
        console.log("Processing transfer.success for reference:", data.reference);
        
        // Extract withdrawal ID from reference (format: "withdrawal_{id}_{timestamp}")
        const withdrawalIdMatch = data.reference?.match(/^withdrawal_([a-f0-9-]+)_/);
        if (!withdrawalIdMatch) {
          console.error("Invalid reference format:", data.reference);
          break;
        }

        const withdrawalId = withdrawalIdMatch[1];

        // Update withdrawal status to completed
        const { error: updateError } = await supabase
          .from("salon_withdrawals")
          .update({ status: "completed" })
          .eq("id", withdrawalId);

        if (updateError) {
          console.error("Failed to update withdrawal status:", updateError);
        } else {
          console.log("Withdrawal marked as completed:", withdrawalId);
        }
        break;
      }

      case "transfer.failed":
      case "transfer.reversed": {
        console.log(`Processing ${eventType} for reference:`, data.reference);
        
        // Extract withdrawal ID from reference (format: "withdrawal_{id}_{timestamp}")
        const withdrawalIdMatch = data.reference?.match(/^withdrawal_([a-f0-9-]+)_/);
        if (!withdrawalIdMatch) {
          console.error("Invalid reference format:", data.reference);
          break;
        }

        const withdrawalId = withdrawalIdMatch[1];
        const failureReason = data.status || `Transfer ${eventType === "transfer.failed" ? "failed" : "reversed"}`;

        // Fetch the withdrawal record to get tenant_id and find ledger entry
        const { data: withdrawal, error: fetchError } = await supabase
          .from("salon_withdrawals")
          .select("tenant_id")
          .eq("id", withdrawalId)
          .single();

        if (fetchError || !withdrawal) {
          console.error("Failed to fetch withdrawal record:", fetchError);
          break;
        }

        // Fetch the ledger entry for this withdrawal to get entry ID for reversal
        const { data: ledgerEntry, error: ledgerError } = await supabase
          .from("wallet_ledger_entries")
          .select("id")
          .eq("tenant_id", withdrawal.tenant_id)
          .eq("wallet_type", "salon")
          .eq("reference_type", "withdrawal")
          .eq("reference_id", withdrawalId)
          .eq("entry_type", "salon_purse_withdrawal")
          .single();

        if (ledgerError || !ledgerEntry) {
          console.error("Failed to fetch ledger entry for withdrawal:", ledgerError);
          break;
        }

        // Create wallet reversal to refund the debited amount
        const { error: reversalError } = await supabase.rpc("create_wallet_reversal", {
          p_original_entry_id: ledgerEntry.id,
          p_reason: failureReason,
          p_idempotency_key: `reversal_${eventType}_${withdrawalId}`,
        });

        if (reversalError) {
          console.error("Failed to create wallet reversal:", reversalError);
        } else {
          console.log("Wallet reversal created for withdrawal:", withdrawalId);
        }

        // Update withdrawal status to failed with reason
        const { error: updateError } = await supabase
          .from("salon_withdrawals")
          .update({
            status: "failed",
            failure_reason: failureReason,
          })
          .eq("id", withdrawalId);

        if (updateError) {
          console.error("Failed to update withdrawal status:", updateError);
        } else {
          console.log("Withdrawal marked as failed:", withdrawalId);
        }
        break;
      }

      default:
        console.log("Unhandled transfer event type:", eventType);
        break;
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transfer webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
