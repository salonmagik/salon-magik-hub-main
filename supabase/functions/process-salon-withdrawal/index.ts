import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, getPaystackBalance, fetchPaystackTransferStatus } from "../_shared/paystack-helpers.ts";
import { reconcileWithdrawalOutcome } from "../_shared/payment-webhook-processor.ts";
import { notifyWithdrawalRequested, notifyWithdrawalOutcome } from "../_shared/withdrawal-notifications.ts";

import { quoteWithdrawal } from "../_shared/withdrawal-fees.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WithdrawalRequest {
  tenantId: string;
  /** null explicitly selects the central/unassigned wallet; a UUID selects one branch wallet. */
  locationId?: string | null;
  payoutDestinationId: string;
  amount: number;
  acceptedTotalDebit: number;
  feeVersion: string;
}

// Duplicate detection time window (5 minutes in milliseconds)
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

// Every terminal-failure status Paystack's transfer API can report, besides
// "success". Used both at withdrawal creation (from the synchronous
// POST /transfer response) and during active reconciliation (from a later
// GET status check) — kept as one list so the two can't drift, which is
// exactly how a "rejected" transfer previously stayed stuck at "pending"
// forever: creation-time code already knew about it, reconciliation didn't.
const TRANSFER_FAILURE_STATUSES = new Set(["failed", "reversed", "abandoned", "blocked", "rejected"]);

// Last-resort backstop only: used when a stuck pending/awaiting_otp
// withdrawal exists AND we couldn't get a definitive answer from Paystack's
// own transfer-status API (network error, API down). In the normal case
// that live check resolves things immediately — success/failed/reversed
// reconciles and unblocks right away, genuinely-in-flight correctly keeps
// blocking. This only matters when Paystack itself can't be reached.
const STALE_PENDING_WINDOW_MS = 4 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

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
    const { tenantId, payoutDestinationId, amount, locationId = null } = body;

    // Validate required fields
    if (!tenantId || !payoutDestinationId || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenantId, payoutDestinationId, amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Amount must be greater than 0" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database operations
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    if (locationId) {
      const { data: location } = await serviceSupabase
        .from("locations")
        .select("id")
        .eq("id", locationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!location) {
        return new Response(JSON.stringify({ error: "Selected branch does not belong to this salon" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: membership, error: membershipError } = await serviceSupabase
      .from("user_roles").select("role").eq("tenant_id", tenantId)
      .eq("user_id", user.id).eq("is_active", true)
      .in("role", ["owner", "manager", "supervisor"]).limit(1);
    if (membershipError || !membership?.length) {
      return new Response(JSON.stringify({ error: "Not authorized to withdraw from this salon" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =====================================================
    // STEP 1: FETCH WALLET (needed early — reconciling a stuck withdrawal
    // below requires knowing the currency to pick the right Paystack key)
    // =====================================================

    const { data: wallet, error: walletError } = await serviceSupabase
      .from("salon_wallets")
      .select("*")
      .eq("tenant_id", tenantId)
      .filter(locationId ? "location_id" : "location_id", locationId ? "eq" : "is", locationId ?? "null")
      .single();

    if (walletError || !wallet) {
      console.error("Error fetching salon wallet:", walletError);
      return new Response(
        JSON.stringify({ error: "Salon wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // STEP 2: CHECK FOR DUPLICATE WITHDRAWALS
    // =====================================================

    console.log(`[Withdrawal] Checking for duplicates - tenant: ${tenantId}, destination: ${payoutDestinationId}, amount: ${amount}`);

    // A pending/awaiting_otp withdrawal to the same destination blocks a new
    // one — but rather than trust our own record forever (a transfer.success/
    // failed/reversed webhook can be delayed, or never arrive at all, e.g. one
    // initiated under the retired subaccount flow that never reached
    // Paystack's Transfer API in the first place), actively ask Paystack what
    // its real status is and reconcile before deciding to block. This can
    // clear a genuinely dead withdrawal in seconds instead of leaving it
    // stuck indefinitely, while a transfer Paystack still reports as in
    // flight correctly keeps blocking — that's the fraud protection working,
    // not a bug.
    const { data: existingProcessing, error: processingCheckError } = await serviceSupabase
      .from("salon_withdrawals")
      .select("id, status, amount, requested_at, paystack_transfer_code")
      .eq("tenant_id", tenantId)
      .filter(locationId ? "location_id" : "location_id", locationId ? "eq" : "is", locationId ?? "null")
      .eq("payout_destination_id", payoutDestinationId)
      .in("status", ["pending", "awaiting_otp"])
      .order("requested_at", { ascending: false })
      .limit(1);

    if (processingCheckError) {
      console.error("Error checking for existing withdrawals:", processingCheckError);
      // Continue - this is not a critical error
    }

    if (existingProcessing && existingProcessing.length > 0) {
      const existing = existingProcessing[0];
      let stillBlocking = true;

      if (!existing.paystack_transfer_code) {
        // Never actually reached Paystack — nothing to double-spend against.
        const result = await reconcileWithdrawalOutcome(serviceSupabase, existing.id, "failed", {
          failureReason: "No transfer was ever initiated with Paystack for this request.",
        });
        if (result.ok) {
          stillBlocking = false;
          await notifyWithdrawalOutcome(serviceSupabase, existing.id, "failed", { resendApiKey, resendFromEmail })
            .catch((err) => console.error(`Failed to send withdrawal-outcome notification for ${existing.id}:`, err));
        } else console.error(`Failed to auto-fail withdrawal ${existing.id} with no transfer code:`, result.error);
      } else {
        const paystackKeyResult = getPaystackKeyForCurrency(wallet.currency);
        const transferStatus = paystackKeyResult.key
          ? await fetchPaystackTransferStatus(paystackKeyResult.key, existing.paystack_transfer_code)
          : { status: null, error: paystackKeyResult.error };

        const reconcileOutcome = transferStatus.status === "success"
          ? "success"
          : transferStatus.status === "reversed"
          ? "reversed"
          : transferStatus.status && TRANSFER_FAILURE_STATUSES.has(transferStatus.status)
          ? "failed"
          : null;
        if (reconcileOutcome) {
          const result = await reconcileWithdrawalOutcome(serviceSupabase, existing.id, reconcileOutcome, {
            failureReason: `Paystack reports this transfer ${transferStatus.status}.`,
          });
          if (result.ok) {
            stillBlocking = false;
            await notifyWithdrawalOutcome(serviceSupabase, existing.id, reconcileOutcome, { resendApiKey, resendFromEmail })
              .catch((err) => console.error(`Failed to send withdrawal-outcome notification for ${existing.id}:`, err));
          } else console.error(`Failed to reconcile withdrawal ${existing.id} to ${reconcileOutcome}:`, result.error);
        } else if (transferStatus.status === "pending" || transferStatus.status === "otp") {
          // Genuinely still in flight at Paystack — correctly keep blocking.
          stillBlocking = true;
        } else {
          // Couldn't get a definitive answer from Paystack (network error,
          // API down). Fall back to a short staleness backstop rather than
          // either blocking forever or unblocking blind.
          console.error(`Could not verify transfer status for withdrawal ${existing.id}:`, transferStatus.error);
          const stalePendingCutoff = new Date(Date.now() - STALE_PENDING_WINDOW_MS);
          stillBlocking = new Date(existing.requested_at ?? 0) > stalePendingCutoff;
        }
      }

      if (stillBlocking) {
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
    }

    // Check for duplicate withdrawal (same amount + destination) within time window
    const timeWindowStart = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recentDuplicates, error: duplicateCheckError } = await serviceSupabase
      .from("salon_withdrawals")
      .select("id, status, requested_at")
      .eq("tenant_id", tenantId)
      .filter(locationId ? "location_id" : "location_id", locationId ? "eq" : "is", locationId ?? "null")
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
    // STEP 3: FETCH PAYOUT DESTINATION (wallet already fetched in step 1)
    // =====================================================

    // Enforce the app minimum before creating a record or sending money.
    const minWithdrawal = wallet.currency === "NGN" ? 500 : wallet.currency === "GHS" ? 50 : null;
    if (minWithdrawal === null || amount < minWithdrawal) {
      return new Response(
        JSON.stringify({ error: minWithdrawal === null
          ? "Unsupported withdrawal currency"
          : `Minimum withdrawal is ${minWithdrawal} ${wallet.currency}` }),
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

    if (payoutDestination.currency !== wallet.currency) {
      return new Response(JSON.stringify({ error: "Payout destination currency does not match wallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Paystack synchronously rejecting a transfer (e.g. "Recipient is
    // blacklisted") blocks this destination server-side — see STEP 4 below,
    // where a rejection sets this flag. Without this hard stop, nothing
    // prevented resubmitting the same bad recipient, which is exactly what
    // escalated one rejection into Paystack's own automatic blacklist.
    if (payoutDestination.is_blocked) {
      return new Response(
        JSON.stringify({
          error: payoutDestination.blocked_reason
            ? `This payout account is blocked: ${payoutDestination.blocked_reason}`
            : "This payout account is blocked after a failed transfer.",
          details: "Review or remove this account in Payout Accounts, or unblock it there once you've confirmed the details are correct.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // A General-wallet withdrawal (locationId null) needs the tenant's
    // default destination; a branch withdrawal needs one explicitly pinned
    // to that branch — no more implicit fallback either way. The DB trigger
    // (reserve_fee_bearing_withdrawal) enforces this too; this is the
    // friendlier pre-check.
    const destinationUsable = locationId
      ? (payoutDestination.location_ids ?? []).includes(locationId)
      : !!payoutDestination.is_default;
    if (!destinationUsable) {
      return new Response(JSON.stringify({ error: "This payout account isn't assigned to this branch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let quote;
    try { quote = quoteWithdrawal(amount, wallet.currency, payoutDestination.destination_type); }
    catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid withdrawal" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.feeVersion !== quote.feeVersion || body.acceptedTotalDebit !== quote.totalDebit) {
      return new Response(JSON.stringify({ error: "Please review the current withdrawal fees and try again", quote }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const totalDebit = quote.totalDebit;

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
    if (wallet.balance < totalDebit) {
      return new Response(
        JSON.stringify({
          error: `Insufficient wallet balance. Available: ${wallet.balance} ${wallet.currency}, Required including fees: ${totalDebit} ${wallet.currency}`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // wallet.balance is credited immediately on charge.success, but Paystack
    // itself only settles funds to our platform balance on the next business
    // day. A withdrawal that passes the raw-balance check above can still be
    // rejected by Paystack for funds that haven't settled yet, which used to
    // surface as Paystack's opaque "balance not enough" error. Check our own
    // settlement estimate first so we can give a clear explanation instead.
    const { data: availabilityRows, error: availabilityError } = await serviceSupabase
      .rpc("get_salon_wallet_availability", { p_tenant_id: tenantId, p_location_id: locationId });

    if (availabilityError) {
      console.error("Error computing wallet availability:", availabilityError);
      return new Response(JSON.stringify({ error: "Could not confirm available wallet funds" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      const availability = availabilityRows?.[0];
      const availableBalance = Number(availability?.available ?? 0);

      if (availableBalance < totalDebit) {
        const settlementNote = availability?.next_settlement_at
          ? ` The remaining balance is expected to clear by ${new Date(availability.next_settlement_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.`
          : "";
        return new Response(
          JSON.stringify({
            error: `Only ${availableBalance.toFixed(2)} ${wallet.currency} of your ${wallet.balance} ${wallet.currency} balance has cleared with our payment processor and is available to withdraw right now.${settlementNote}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Our own wallet ledger can be wrong — a bug, a chargeback not yet
    // reflected, or (historically) a subaccount split silently siphoning a
    // salon's share out of the main balance the ledger assumed it was in.
    // Before authorizing a real transfer, confirm against Paystack's own
    // live settlement balance that the platform actually holds at least
    // this much. This is a platform-wide balance, not itemized per tenant,
    // so it can't verify this specific salon's money individually settled —
    // but it's an unambiguous floor: if Paystack doesn't show enough to
    // cover this payout, something is wrong with our own accounting and the
    // withdrawal must not proceed.
    const { balance: paystackRealBalance, error: paystackBalanceError } = await getPaystackBalance(paystackSecretKey);
    if (paystackBalanceError || paystackRealBalance === null) {
      console.error("[Withdrawal] Could not confirm Paystack balance:", paystackBalanceError);
      return new Response(
        JSON.stringify({ error: "Could not confirm available funds with our payment processor. Please try again shortly." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (paystackRealBalance < totalDebit) {
      console.error(
        `[Withdrawal] Refusing withdrawal for tenant ${tenantId}: requested ${amount} ${wallet.currency}, Paystack balance only ${paystackRealBalance}.`,
      );
      return new Response(
        JSON.stringify({ error: "Your payout processor hasn't confirmed enough available funds for this withdrawal yet. Please try again shortly, or contact support if this persists." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // STEP 3: CREATE WITHDRAWAL RECORD (status='pending')
    // =====================================================
    
    console.log(`[Withdrawal] Creating withdrawal record for tenant ${tenantId}`);
    
    // We must generate the reference here so we can save it to the DB BEFORE we call Paystack.
    // Paystack's approval URL webhook will fire during the transfer call, so it needs to find this reference.
    const withdrawalId = crypto.randomUUID();
    const transferReference = `withdrawal_${withdrawalId}_${Date.now()}`;

    const { data: withdrawal, error: withdrawalInsertError } = await serviceSupabase
      .from("salon_withdrawals")
      .insert({
        id: withdrawalId,
        tenant_id: tenantId,
        salon_wallet_id: wallet.id,
        location_id: locationId,
        payout_destination_id: payoutDestinationId,
        currency: wallet.currency,
        amount,
        transfer_fee: quote.transferFee,
        stamp_duty: quote.stampDuty,
        fee_version: quote.feeVersion,
        status: "pending",
        paystack_reference: transferReference, // Save it early for the approval webhook
      })
      .select()
      .single();

    if (withdrawalInsertError || !withdrawal) {
      console.error("Error creating withdrawal record:", withdrawalInsertError);
      return new Response(
        JSON.stringify({ error: "Unable to reserve the withdrawal amount and fees. Refresh your balance and try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Withdrawal] Created withdrawal record: ${withdrawal.id} with reference: ${transferReference}`);

    // Awaited (not fire-and-forget) — this edge function's isolate can be
    // torn down as soon as the response is sent, same reason every other
    // notification send in this codebase is awaited rather than detached.
    // A failure here must never block the actual transfer below, so it's
    // caught and logged, not thrown.
    try {
      await notifyWithdrawalRequested(serviceSupabase, withdrawal.id, { resendApiKey, resendFromEmail });
    } catch (err) {
      console.error(`Failed to send withdrawal-requested notification for ${withdrawal.id}:`, err);
    }

    // =====================================================
    // STEP 4: CALL PAYSTACK API FIRST (BEFORE DEBITING WALLET)
    // =====================================================
    
    console.log(`[Withdrawal] Initiating Paystack transfer for withdrawal ${withdrawal.id}`);
    
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
      
      // Preserve the reservation until the provider confirms the outcome.
      await serviceSupabase
        .from("salon_withdrawals")
        .update({
          failure_reason: "Transfer outcome unknown; awaiting provider confirmation",
        })
        .eq("id", withdrawal.id).eq("status", "pending");

      return new Response(
        JSON.stringify({ error: `Transfer outcome is not yet confirmed. Check withdrawal history before trying again.` }),
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
          ...(paystackResponse.status < 500 ? { status: "failed" } : {}),
          failure_reason: paystackData.message || "Transfer initiation failed",
        })
        .eq("id", withdrawal.id).eq("status", "pending");

      // Paystack refused to even create the transfer — a strong signal the
      // recipient itself is the problem (blacklisted, invalid account, etc),
      // not a transient issue. Block the destination so nobody can retry it
      // blind; repeated retries to a bad recipient is what gets a recipient
      // blacklisted by Paystack in the first place.
      if (paystackResponse.status < 500) {
        await serviceSupabase
          .from("salon_payout_destinations")
          .update({
            is_blocked: true,
            blocked_reason: paystackData.message || "Transfer initiation failed",
            blocked_at: new Date().toISOString(),
          })
          .eq("id", payoutDestination.id);
      }

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
    // STEP 5: RECORD THE REAL TRANSFER STATE
    // =====================================================
    // paystackData.status is just "did the API call itself succeed" — the
    // transfer's actual state is paystackData.data.status. A transfer that
    // requires OTP finalization on OUR Paystack account (not the salon's)
    // comes back here with data.status === "otp" and paystackData.status
    // still true, which the old code treated identically to a normal
    // in-flight transfer. We have no code path that ever finalizes that
    // OTP, so left as plain "pending" it would sit stuck forever with no
    // way for anyone to tell it apart from one that's genuinely just
    // clearing. Recording it as its own status lets backoffice see and act
    // on it — salons still only ever see "pending" (see PayoutsPage).
    // Final outcomes atomically account for principal, fees and applied duty.
    const { error: transferCodeError } = await serviceSupabase.from("salon_withdrawals")
      .update({ paystack_transfer_code: paystackData.data.transfer_code }).eq("id", withdrawal.id);
    if (transferCodeError) throw transferCodeError;
    const transferStatus = paystackData.data.status;
    const isFinalFailure = TRANSFER_FAILURE_STATUSES.has(transferStatus);
    const internalStatus = transferStatus === "otp" ? "awaiting_otp" : isFinalFailure ? "failed" : "pending";
    if (transferStatus === "success" || isFinalFailure) {
      const syncOutcome: "success" | "reversed" | "failed" =
        transferStatus === "success" ? "success" : transferStatus === "reversed" ? "reversed" : "failed";
      const { error } = await serviceSupabase.rpc("finalize_fee_bearing_withdrawal", {
        p_withdrawal_id: withdrawal.id,
        p_outcome: syncOutcome,
      });
      if (error) throw error; // Keep funds reserved for reconciliation on failure.
      await notifyWithdrawalOutcome(serviceSupabase, withdrawal.id, syncOutcome, { resendApiKey, resendFromEmail })
        .catch((err) => console.error(`Failed to send withdrawal-outcome notification for ${withdrawal.id}:`, err));
    } else {
      const { error } = await serviceSupabase.from("salon_withdrawals")
        .update({ status: internalStatus, paystack_transfer_code: paystackData.data.transfer_code })
        .eq("id", withdrawal.id).eq("status", "pending");
      if (error) throw error;
    }

    // =====================================================
    // RETURN RESPONSE
    // =====================================================
    // The salon never sees "awaiting_otp" — that's purely an internal ops
    // state (see comment above) — so it's presented identically to a normal
    // pending transfer here. A synchronous failed/reversed response is rare
    // (most failures only surface later via webhook) but real, so that one
    // case is reported honestly rather than claimed as success.

    if (internalStatus === "failed") {
      return new Response(
        JSON.stringify({
          error: "The payment provider could not complete this transfer.",
          details: `Paystack transfer status: ${transferStatus}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal: {
          id: withdrawal.id,
          amount,
          transferFee: quote.transferFee,
          stampDuty: quote.stampDuty,
          totalDebit,
          currency: wallet.currency,
          status: transferStatus === "success" ? "completed" : "pending",
          transferCode: paystackData.data.transfer_code,
          reference: transferReference,
          requestedAt: withdrawal.requested_at,
        },
        transfer: paystackData.data,
        message: "Withdrawal initiated successfully. Your wallet will be debited once the transfer is confirmed. Funds will be transferred to your account within 1-3 business days.",
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
