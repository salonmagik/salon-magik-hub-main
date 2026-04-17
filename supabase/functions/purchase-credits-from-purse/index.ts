import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PurchaseRequest {
  tenantId: string;
  packageId?: string;
  customCredits?: number;
  customAmount?: number;
}

interface CreditPackage {
  credits: number;
  priceNGN: number;
  priceGHS: number;
}

const CREDIT_PACKAGES: Record<string, CreditPackage> = {
  pack_50: { credits: 50, priceNGN: 3500, priceGHS: 60 },
  pack_100: { credits: 100, priceNGN: 6500, priceGHS: 108 },
  pack_250: { credits: 250, priceNGN: 15000, priceGHS: 240 },
  pack_500: { credits: 500, priceNGN: 27000, priceGHS: 420 },
};

const MIN_CUSTOM_CREDITS = 10;
const MAX_CUSTOM_CREDITS = 1000;

// Tier-based pricing for custom credits (based on PRD pricing structure)
function calculateCustomCreditPrice(credits: number, currency: string): number {
  let ratePerCredit: number;
  
  // Determine rate based on tier
  if (credits <= 50) {
    // Pack 50 rate: NGN 70/credit, GHS 1.20/credit
    ratePerCredit = currency === 'NGN' ? 70 : currency === 'GHS' ? 1.20 : 0.10;
  } else if (credits <= 100) {
    // Pack 100 rate: NGN 65/credit, GHS 1.08/credit
    ratePerCredit = currency === 'NGN' ? 65 : currency === 'GHS' ? 1.08 : 0.09;
  } else if (credits <= 250) {
    // Pack 250 rate: NGN 60/credit, GHS 0.96/credit
    ratePerCredit = currency === 'NGN' ? 60 : currency === 'GHS' ? 0.96 : 0.08;
  } else {
    // Pack 500+ rate: NGN 54/credit, GHS 0.84/credit
    ratePerCredit = currency === 'NGN' ? 54 : currency === 'GHS' ? 0.84 : 0.07;
  }
  
  return Math.round(credits * ratePerCredit);
}

function calculateDiscountedAmount(
  amount: number,
  discountType?: string | null,
  discountValue?: number | null,
) {
  const numericValue = Number(discountValue || 0);
  if (!numericValue || amount <= 0) return amount;

  if (discountType === "fixed") {
    return Math.max(0, Number((amount - numericValue).toFixed(2)));
  }

  return Math.max(0, Number((amount - (amount * numericValue) / 100).toFixed(2)));
}

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

    const body: PurchaseRequest = await req.json();
    const { tenantId, packageId, customCredits, customAmount } = body;

    // Validate required fields
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: tenantId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Must provide either packageId OR customCredits+customAmount
    if (!packageId && (!customCredits || !customAmount)) {
      return new Response(
        JSON.stringify({ error: "Must provide either packageId or customCredits with customAmount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let credits: number;
    let amount: number;
    let wallet;
    let promoSummary: any = null;

    // Use service role for database operations
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch salon_wallet first
    const { data: walletData, error: walletError } = await serviceSupabase
      .from("salon_wallets")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (walletError || !walletData) {
      console.error("Error fetching salon wallet:", walletError);
      return new Response(
        JSON.stringify({ error: "Salon wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    wallet = walletData;

    if (packageId) {
      // Validate packageId
      const creditPackage = CREDIT_PACKAGES[packageId];
      if (!creditPackage) {
        return new Response(
          JSON.stringify({ error: `Invalid packageId. Valid options: ${Object.keys(CREDIT_PACKAGES).join(", ")}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      credits = creditPackage.credits;
      amount = wallet.currency === "GHS" ? creditPackage.priceGHS : creditPackage.priceNGN;
    } else {
      // Custom credits
      if (customCredits < MIN_CUSTOM_CREDITS || customCredits > MAX_CUSTOM_CREDITS) {
        return new Response(
          JSON.stringify({ error: `Custom credits must be between ${MIN_CUSTOM_CREDITS} and ${MAX_CUSTOM_CREDITS}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      credits = customCredits;
      amount = customAmount;
    }

    const { data: promoData, error: promoError } = await (serviceSupabase.rpc as any)("get_tenant_sales_promo_summary", {
      p_tenant_id: tenantId,
      p_surface: "credits",
    });

    if (promoError) {
      console.error("Error loading tenant promo summary:", promoError);
    } else if (promoData) {
      promoSummary = promoData;
      amount = calculateDiscountedAmount(amount, promoData.discount_type, Number(promoData.discount_value || 0));
    }

    // Check if wallet has sufficient balance
    if (wallet.balance < amount) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient wallet balance. Available: ${wallet.currency} ${wallet.balance}, Required: ${wallet.currency} ${amount}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create messaging_credit_purchases record with paid_via='salon_purse'
    const { data: purchase, error: purchaseInsertError } = await serviceSupabase
      .from("messaging_credit_purchases")
      .insert({
        tenant_id: tenantId,
        credits: credits,
        currency: wallet.currency,
        amount,
        paid_via: "salon_purse",
        payment_intent_id: null, // Not a Paystack payment
        gateway_reference: null,
      })
      .select()
      .single();

    if (purchaseInsertError || !purchase) {
      console.error("Error creating purchase record:", purchaseInsertError);
      return new Response(
        JSON.stringify({ error: "Failed to create purchase record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call RPC to debit salon purse with correct entry_type
    const idempotencyKey = `credit_purchase_${purchase.id}`;
    const { data: ledgerEntryId, error: debitError } = await serviceSupabase.rpc(
      "debit_salon_purse",
      {
        p_tenant_id: tenantId,
        p_entry_type: "salon_purse_debit_credit_purchase",
        p_reference_type: "credit_purchase",
        p_reference_id: purchase.id,
        p_amount: amount,
        p_currency: wallet.currency,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (debitError) {
      console.error("Error debiting salon purse:", debitError);
      
      // Delete purchase record if debit fails
      await serviceSupabase
        .from("messaging_credit_purchases")
        .delete()
        .eq("id", purchase.id);

      return new Response(
        JSON.stringify({ error: debitError.message || "Failed to debit salon purse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment communication_credits balance (or create if not exists)
    const { data: existingCredits, error: creditsCheckError } = await serviceSupabase
      .from("communication_credits")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (creditsCheckError && creditsCheckError.code !== "PGRST116") {
      // PGRST116 is "no rows returned" - that's fine, we'll create
      console.error("Error checking communication credits:", creditsCheckError);
    }

    if (existingCredits) {
      // Update existing record
      const { error: updateError } = await serviceSupabase
        .from("communication_credits")
        .update({
          balance: existingCredits.balance + credits,
        })
        .eq("tenant_id", tenantId);

      if (updateError) {
        console.error("Error updating communication credits:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update credits balance" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new record
      const { error: insertError } = await serviceSupabase
        .from("communication_credits")
        .insert({
          tenant_id: tenantId,
          balance: credits,
        });

      if (insertError) {
        console.error("Error creating communication credits:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create credits balance" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch updated credits balance
    const { data: updatedCredits, error: fetchError } = await serviceSupabase
      .from("communication_credits")
      .select("balance")
      .eq("tenant_id", tenantId)
      .single();

    const newBalance = updatedCredits?.balance || credits;

    if (promoSummary) {
      const { error: consumeError } = await (serviceSupabase.rpc as any)("consume_tenant_sales_promo_use", {
        p_tenant_id: tenantId,
        p_surface: "credits",
        p_usage_reference: purchase.id,
        p_amount: amount,
      });

      if (consumeError) {
        console.error("Failed to consume sales promo usage for wallet credit purchase:", consumeError);
      }
    }

    console.log(`Credit purchase ${purchase.id} completed: ${credits} credits added`);

    return new Response(
      JSON.stringify({
        success: true,
        credits,
        newBalance,
        amountDebited: amount,
        currency: wallet.currency,
        promoApplied: promoSummary
          ? {
              code: promoSummary.code,
              remainingUsesBeforeCharge: promoSummary.remaining_uses,
              discountType: promoSummary.discount_type,
              discountValue: promoSummary.discount_value,
            }
          : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error purchasing credits from purse:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
