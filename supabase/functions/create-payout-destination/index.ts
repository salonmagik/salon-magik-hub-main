import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PayoutDestinationRequest {
  tenantId: string;
  destinationType: "bank" | "mobile_money";
  country: "NG" | "GH";
  currency: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  momoProvider?: string;
  momoNumber?: string;
  isDefault?: boolean;
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

    const body: PayoutDestinationRequest = await req.json();
    const {
      tenantId,
      destinationType,
      country,
      currency,
      bankCode,
      bankName,
      accountNumber,
      accountName,
      momoProvider,
      momoNumber,
      isDefault = false,
    } = body;

    // Validate required fields
    if (!tenantId || !destinationType || !country || !currency) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenantId, destinationType, country, currency" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate bank-specific fields
    if (destinationType === "bank") {
      if (!bankCode || !bankName || !accountNumber || !accountName) {
        return new Response(
          JSON.stringify({ error: "Missing required bank fields: bankCode, bankName, accountNumber, accountName" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate mobile_money-specific fields
    if (destinationType === "mobile_money") {
      if (!momoProvider || !momoNumber) {
        return new Response(
          JSON.stringify({ error: "Missing required mobile_money fields: momoProvider, momoNumber" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Use service role for database operations
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: membership, error: membershipError } = await serviceSupabase.from("user_roles")
      .select("role").eq("tenant_id", tenantId).eq("user_id", user.id).eq("is_active", true);
    if (membershipError || !membership?.some((role) => ["owner", "manager"].includes(role.role))) {
      return new Response(JSON.stringify({ error: "Only salon owners and managers can manage payout accounts" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!((country === "NG" && currency === "NGN" && destinationType === "bank") ||
      (country === "GH" && currency === "GHS" && ["bank", "mobile_money"].includes(destinationType)))) {
      return new Response(JSON.stringify({ error: "Unsupported payout country, currency or destination" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Confirm the tenant exists before creating its transfer recipient.
    const { data: tenant, error: tenantError } = await serviceSupabase
      .from("tenants")
      .select("name, currency")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch tenant details" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tenant.currency !== currency) {
      return new Response(JSON.stringify({ error: "Payout currency must match the salon currency" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get currency-specific Paystack key
    const paystackKeyResult = getPaystackKeyForCurrency(currency);
    if (paystackKeyResult.error || !paystackKeyResult.key) {
      return new Response(
        JSON.stringify({
          error: paystackKeyResult.error || `Paystack not configured for currency ${currency}`
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const paystackSecretKey = paystackKeyResult.key;

    // Create Paystack recipient
    let paystackRecipientCode: string;
    const tenantPaymentStatus = "ready";
    const tenantPaymentError = null;

    if (destinationType === "bank") {
      // Determine recipient type based on country
      const recipientType = country === "NG" ? "nuban" : "ghipss";

      const paystackResponse = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Authorization": `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: recipientType,
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: currency.toUpperCase(),
        }),
      });

      const paystackData = await paystackResponse.json();

      if (!paystackResponse.ok || !paystackData.status) {
        console.error("Paystack error:", paystackData);
        return new Response(
          JSON.stringify({ error: paystackData.message || "Failed to create Paystack recipient" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      paystackRecipientCode = paystackData.data.recipient_code;

    } else {
      // Mobile money recipient
      const paystackResponse = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Authorization": `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "mobile_money",
          name: momoNumber, // Use phone number as name for momo
          email: user.email || `${tenantId}@temp.salon-magik.com`, // Email required by Paystack
          bank_code: momoProvider!.toUpperCase(),
          account_number: momoNumber,
          currency: currency.toUpperCase(),
        }),
      });

      const paystackData = await paystackResponse.json();

      if (!paystackResponse.ok || !paystackData.status) {
        console.error("Paystack error:", paystackData);
        return new Response(
          JSON.stringify({ error: paystackData.message || "Failed to create Paystack recipient" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      paystackRecipientCode = paystackData.data.recipient_code;

    }

    // A tenant's first-ever destination always becomes default, regardless
    // of what the client sent — otherwise a salon that adds one payout
    // account without ticking "default" ends up with zero default rows,
    // and every booking silently falls through to the platform's own
    // Paystack account with nothing to signal why.
    const { count: existingDestinationCount, error: countError } = await serviceSupabase
      .from("salon_payout_destinations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (countError) {
      console.error("Error counting existing payout destinations:", countError);
      // Not fatal — fall back to whatever the client sent for isDefault.
    }

    const effectiveIsDefault = isDefault || existingDestinationCount === 0;

    // If effectiveIsDefault, unset is_default on all other destinations for tenant
    if (effectiveIsDefault) {
      const { error: unsetError } = await serviceSupabase
        .from("salon_payout_destinations")
        .update({ is_default: false })
        .eq("tenant_id", tenantId);

      if (unsetError) {
        console.error("Error unsetting default destinations:", unsetError);
        // Continue anyway - not a critical failure
      }
    }

    // Insert salon_payout_destinations record
    const { data: destination, error: insertError } = await serviceSupabase
      .from("salon_payout_destinations")
      .insert({
        tenant_id: tenantId,
        destination_type: destinationType,
        country,
        currency: currency.toUpperCase(),
        bank_code: bankCode || null,
        bank_name: bankName || null,
        account_number: accountNumber || null,
        account_name: accountName || null,
        momo_provider: momoProvider || null,
        momo_number: momoNumber || null,
        paystack_recipient_code: paystackRecipientCode,
        is_default: effectiveIsDefault,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting payout destination:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create payout destination" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A verified transfer recipient makes the payout destination ready.
    const { error: tenantUpdateError } = await serviceSupabase
      .from("tenants")
      .update({
        payment_setup_status: tenantPaymentStatus,
        payment_setup_error: tenantPaymentError,
      })
      .eq("id", tenantId);

    if (tenantUpdateError) {
      console.error("Error updating tenant payment status:", tenantUpdateError);
    }

    return new Response(
      JSON.stringify({ destination }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating payout destination:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
