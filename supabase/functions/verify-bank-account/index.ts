const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyBankAccountRequest {
  accountNumber: string;
  bankCode: string;
}

interface VerifyBankAccountResponse {
  verified: boolean;
  accountName?: string;
  accountNumber?: string;
  bankId?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!paystackSecretKey) {
      return new Response(
        JSON.stringify({ error: "Paystack not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: VerifyBankAccountRequest = await req.json();
    const { accountNumber, bankCode } = body;

    // Validate required parameters
    if (!accountNumber || !bankCode) {
      return new Response(
        JSON.stringify({ error: "Missing accountNumber or bankCode parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Paystack API URL
    const paystackUrl = new URL("https://api.paystack.co/bank/resolve");
    paystackUrl.searchParams.set("account_number", accountNumber);
    paystackUrl.searchParams.set("bank_code", bankCode);

    // Call Paystack API
    const paystackResponse = await fetch(paystackUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
    });

    const paystackData = await paystackResponse.json();

    // Handle success
    if (paystackResponse.ok && paystackData.status) {
      const response: VerifyBankAccountResponse = {
        verified: true,
        accountName: paystackData.data.account_name,
        accountNumber: paystackData.data.account_number,
        bankId: paystackData.data.bank_id,
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle failure
    console.error("Paystack verification failed:", paystackData);
    const response: VerifyBankAccountResponse = {
      verified: false,
      error: paystackData.message || "Account verification failed",
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying bank account:", error);
    const response: VerifyBankAccountResponse = {
      verified: false,
      error: "Internal server error",
    };

    return new Response(
      JSON.stringify(response),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
