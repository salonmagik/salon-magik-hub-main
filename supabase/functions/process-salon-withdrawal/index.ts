import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WithdrawalRequest {
  tenantId: string;
  payoutDestinationId: string;
  amount: number;
}

// Duplicate detection time window (5 minutes in milliseconds)
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // =====================================================
    // STEP 1: CHECK FOR DUPLICATE WITHDRAWALS
    // =====================================================
    
    console.log(`[Withdrawal] Checking for duplicates - tenant: ${tenantId}, destination: ${payoutDestinationId}, amount: ${amount}`);
    
    // Check for existing pending/processing withdrawals with same destination
    const { data: existingProcessing, error: processingCheckError } = await serviceSupabase
      .from("salon_withdrawals")
      .select("id, status, amount, requested_at")
      .eq("tenant_id", tenantId)
      .eq("payout_destination_id", payoutDestinationId)
      .in("status", ["pending", "processing"])
      .order("requested_at", { ascending: false })
      .limit(1);

    if (processingCheckError) {
      console.error("Error checking for existing withdrawals:", processingCheckError);
      // Continue - this is not a critical error
    }

    if (existingProcessing && existingProcessing.length > 0) {
      const existing = existingProcessing[0];
      return new Response(
        JSON.stringify({ 
          error: `A withdrawal is already being processed for this destination. Status: ${existing.status}, Amount: ${existing.amount}`,
          existingWithdrawal: {
            id: existing.id,
            status: existing.status,
            amount: existing.amount,
            requestedAt: existing.requested_at,
          }
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate withdrawal (same amount + destination) within time window
    const timeWindowStart = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recentDuplicates, error: duplicateCheckError } = await serviceSupabase
      .from("salon_withdrawals")
      .select("id, status, requested_at")
      .eq("tenant_id", tenantId)
      .eq("payout_destination_id", payoutDestinationId)
      .eq("amount", amount)
      .gte("requested_at", timeWindowStart)
      .in("status", ["pending", "processing", "completed"])
      .limit(1);

    if (duplicateCheckError) {
      console.error("Error checking for duplicate withdrawals:", duplicateCheckError);
      // Continue - this is not a critical error
    }

    if (recentDuplicates && recentDuplicates.length > 0) {
      const duplicate = recentDuplicates[0];
      const timeSince = Math.floor((Date.now() - new Date(duplicate.requested_at).getTime()) / 1000);
      return new Response(
        JSON.stringify({ 
          error: `A withdrawal with the same amount was ${duplicate.status === 'completed' ? 'completed' : 'attempted'} ${timeSince} seconds ago. Please wait a few minutes before trying again.`,
          duplicateWithdrawal: {
            id: duplicate.id,
            status: duplicate.status,
            requestedAt: duplicate.requested_at,
          }
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // STEP 2: FETCH WALLET AND PAYOUT DESTINATION
    // =====================================================
    
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

    // Get currency-specific Paystack key based on wallet currency
    const paystackKeyResult = getPaystackKeyForCurrency(wallet.currency);
    if (paystackKeyResult.error || !paystackKeyResult.key) {
      return new Response(
        JSON.stringify({ 
          error: paystackKeyResult.error || `Paystack not configured for currency ${wallet.currency}` 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const paystackSecretKey = paystackKeyResult.key;

    // Check sufficient balance early (before creating withdrawal record)
    if (wallet.balance < amount) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient wallet balance. Available: ${wallet.balance} ${wallet.currency}, Required: ${amount} ${wallet.currency}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // =====================================================
    // STEP 3: CREATE WITHDRAWAL RECORD (status='pending')
    // =====================================================
    
    console.log(`[Withdrawal] Creating withdrawal record for tenant ${tenantId}`);
    
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

    console.log(`[Withdrawal] Created withdrawal record: ${withdrawal.id}`);

    // =====================================================
    // STEP 4: CALL PAYSTACK API FIRST (BEFORE DEBITING WALLET)
    // =====================================================
    
    console.log(`[Withdrawal] Initiating Paystack transfer for withdrawal ${withdrawal.id}`);
    
    const transferReference = `withdrawal_${withdrawal.id}_${Date.now()}`;
    const amountInKobo = Math.round(amount * 100); // Convert to kobo/pesewas

    let paystackResponse;
    let paystackData;
    
    try {
      paystackResponse = await fetch("https://api.paystack.co/transfer", {
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

      paystackData = await paystackResponse.json();
    } catch (fetchError) {
      console.error("Paystack API request failed:", fetchError);
      
      // Mark withdrawal as failed
      await serviceSupabase
        .from("salon_withdrawals")
        .update({
          status: "failed",
          failure_reason: `Network error: ${fetchError.message}`,
        })
        .eq("id", withdrawal.id);

      return new Response(
        JSON.stringify({ error: `Failed to connect to payment provider: ${fetchError.message}` }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if Paystack transfer failed
    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack transfer failed:", paystackData);

      // Mark withdrawal as failed with Paystack error message
      await serviceSupabase
        .from("salon_withdrawals")
        .update({
          status: "failed",
          failure_reason: paystackData.message || "Transfer initiation failed",
          paystack_reference: transferReference,
        })
        .eq("id", withdrawal.id);

      // Return user-friendly error message
      const errorMessage = paystackData.message || "Failed to initiate transfer";
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: "The payment provider rejected the transfer request. Please check your payout account settings.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Withdrawal] Paystack transfer initiated successfully: ${paystackData.data.transfer_code}`);

    // =====================================================
    // STEP 5: DEBIT WALLET (ONLY AFTER PAYSTACK SUCCESS)
    // =====================================================
    
    console.log(`[Withdrawal] Debiting salon purse for withdrawal ${withdrawal.id}`);
    
    const idempotencyKey = `withdrawal_${withdrawal.id}_${Date.now()}`;
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
      console.error("ERROR: Wallet debit failed after Paystack success!", debitError);
      console.error("CRITICAL: Paystack transfer initiated but wallet not debited!");
      console.error(`Withdrawal ID: ${withdrawal.id}, Transfer Code: ${paystackData.data.transfer_code}`);
      
      // This is a critical error - Paystack has initiated the transfer but we can't debit the wallet
      // Mark withdrawal as 'failed' but include transfer code for manual reconciliation
      await serviceSupabase
        .from("salon_withdrawals")
        .update({
          status: "failed",
          failure_reason: `CRITICAL: Wallet debit failed after Paystack success. Transfer may need manual reversal. Error: ${debitError.message}`,
          paystack_transfer_code: paystackData.data.transfer_code,
          paystack_reference: transferReference,
        })
        .eq("id", withdrawal.id);

      return new Response(
        JSON.stringify({ 
          error: "A critical error occurred during withdrawal processing. Our team has been notified and will resolve this manually.",
          withdrawalId: withdrawal.id,
          supportMessage: "Please contact support with this withdrawal ID for assistance.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Withdrawal] Wallet debited successfully. Ledger entry: ${ledgerEntryId}`);

    // =====================================================
    // STEP 6: UPDATE WITHDRAWAL WITH SUCCESS STATUS
    // =====================================================
    
    const { error: updateError } = await serviceSupabase
      .from("salon_withdrawals")
      .update({
        status: "processing",
        paystack_transfer_code: paystackData.data.transfer_code,
        paystack_reference: transferReference,
      })
      .eq("id", withdrawal.id);

    if (updateError) {
      console.error("Error updating withdrawal status (non-critical):", updateError);
      // Continue anyway - withdrawal is successful, this is just a status update
    }

    console.log(`[Withdrawal] Withdrawal ${withdrawal.id} completed successfully`);

    // =====================================================
    // RETURN SUCCESS RESPONSE
    // =====================================================
    
    return new Response(
      JSON.stringify({
        success: true,
        withdrawal: {
          id: withdrawal.id,
          amount,
          currency: wallet.currency,
          status: "processing",
          transferCode: paystackData.data.transfer_code,
          reference: transferReference,
          requestedAt: withdrawal.requested_at,
        },
        transfer: paystackData.data,
        message: "Withdrawal initiated successfully. Funds will be transferred to your account within 1-3 business days.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unhandled error processing salon withdrawal:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: "An unexpected error occurred. Please try again later.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
