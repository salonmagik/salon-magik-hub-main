import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Create Paystack recipient
    let paystackRecipientCode: string;

    if (destinationType === "bank") {
      // Determine recipient type based on country
      const recipientType = country === "NG" ? "nuban" : "ghipss";

      const paystackResponse = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
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

    // Use service role for database operations
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // If isDefault=true, unset is_default on all other destinations for tenant
    if (isDefault) {
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
        is_default: isDefault,
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
