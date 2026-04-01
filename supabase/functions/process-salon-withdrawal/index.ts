import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WithdrawalRequest {
  tenantId: string;
  payoutDestinationId: string;
  amount: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");

    // Verify Paystack is configured
    if (!paystackSecretKey) {
      return new Response(
        JSON.stringify({ error: "Paystack not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client with user's auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session. Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: WithdrawalRequest = await req.json();
    const { tenantId, payoutDestinationId, amount } = body;

    // Validate required fields
    if (!tenantId || !payoutDestinationId || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenantId, payoutDestinationId, amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Amount must be greater than 0" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch salon_wallet and payout_destination
    const { data: wallet, error: walletError } = await serviceSupabase
      .from("salon_wallets")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (walletError || !wallet) {
      console.error("Error fetching salon wallet:", walletError);
      return new Response(
        JSON.stringify({ error: "Salon wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: payoutDestination, error: destinationError } = await serviceSupabase
      .from("salon_payout_destinations")
      .select("*")
      .eq("id", payoutDestinationId)
      .eq("tenant_id", tenantId)
      .single();

    if (destinationError || !payoutDestination) {
      console.error("Error fetching payout destination:", destinationError);
      return new Response(
        JSON.stringify({ error: "Payout destination not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create salon_withdrawals record with status='pending'
    const { data: withdrawal, error: withdrawalInsertError } = await serviceSupabase
      .from("salon_withdrawals")
      .insert({
        tenant_id: tenantId,
        salon_wallet_id: wallet.id,
        payout_destination_id: payoutDestinationId,
        currency: wallet.currency,
        amount,
        status: "pending",
      })
      .select()
      .single();

    if (withdrawalInsertError || !withdrawal) {
      console.error("Error creating withdrawal record:", withdrawalInsertError);
      return new Response(
        JSON.stringify({ error: "Failed to create withdrawal record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call debit_salon_purse_for_withdrawal RPC
    const idempotencyKey = `withdrawal_${withdrawal.id}`;
    const { data: ledgerEntryId, error: debitError } = await serviceSupabase.rpc(
      "debit_salon_purse_for_withdrawal",
      {
        p_tenant_id: tenantId,
        p_withdrawal_id: withdrawal.id,
        p_amount: amount,
        p_currency: wallet.currency,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (debitError) {
      console.error("Error debiting salon purse:", debitError);
      
      // Delete withdrawal record if debit fails
      await serviceSupabase
        .from("salon_withdrawals")
        .delete()
        .eq("id", withdrawal.id);

      return new Response(
        JSON.stringify({ error: debitError.message || "Failed to debit salon purse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update withdrawal status to 'processing'
    const { error: statusUpdateError } = await serviceSupabase
      .from("salon_withdrawals")
      .update({ status: "processing" })
      .eq("id", withdrawal.id);

    if (statusUpdateError) {
      console.error("Error updating withdrawal status:", statusUpdateError);
      // Continue anyway - this is not critical
    }

    // Call Paystack POST /transfer
    const transferReference = `withdrawal_${withdrawal.id}_${Date.now()}`;
    const amountInKobo = Math.round(amount * 100); // Convert to kobo/pesewas

    const paystackResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: amountInKobo,
        recipient: payoutDestination.paystack_recipient_code,
        reason: `Salon withdrawal ${withdrawal.id}`,
        reference: transferReference,
        currency: wallet.currency.toUpperCase(),
      }),
    });

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack transfer error:", paystackData);

      // Create wallet reversal
      const { error: reversalError } = await serviceSupabase.rpc("create_wallet_reversal", {
        p_original_entry_id: ledgerEntryId,
        p_reason: `Transfer failed: ${paystackData.message || "Unknown error"}`,
        p_idempotency_key: `reversal_${idempotencyKey}`,
      });

      if (reversalError) {
        console.error("Error creating wallet reversal:", reversalError);
      }

      // Update withdrawal status to 'failed' with failure_reason
      await serviceSupabase
        .from("salon_withdrawals")
        .update({
          status: "failed",
          failure_reason: paystackData.message || "Transfer failed",
        })
        .eq("id", withdrawal.id);

      return new Response(
        JSON.stringify({ error: paystackData.message || "Failed to initiate transfer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transfer succeeded - update withdrawal with Paystack data
    const { error: updateError } = await serviceSupabase
      .from("salon_withdrawals")
      .update({
        paystack_transfer_code: paystackData.data.transfer_code,
        paystack_reference: transferReference,
      })
      .eq("id", withdrawal.id);

    if (updateError) {
      console.error("Error updating withdrawal with Paystack data:", updateError);
      // Continue anyway - transfer was initiated
    }

    console.log(`Withdrawal ${withdrawal.id} initiated successfully`);

    return new Response(
      JSON.stringify({
        withdrawal: {
          id: withdrawal.id,
          amount,
          currency: wallet.currency,
          status: "processing",
          transferCode: paystackData.data.transfer_code,
          reference: transferReference,
        },
        transfer: paystackData.data,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing salon withdrawal:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
