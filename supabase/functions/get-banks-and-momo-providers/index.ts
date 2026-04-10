const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Bank {
  id: number;
  name: string;
  slug: string;
  code: string;
  type: string;
  currency: string;
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
    const { country, type } = await req.json();

    if (!country) {
      return new Response(
        JSON.stringify({ error: "Missing country parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map country codes to Paystack country names
    const countryMap: Record<string, string> = {
      'GH': 'ghana',
      'NG': 'nigeria',
      'KE': 'kenya',
      'ZA': 'south africa',
    };

    const paystackCountry = countryMap[country] || country.toLowerCase();

    // Build Paystack API URL
    const paystackUrl = new URL("https://api.paystack.co/bank");
    paystackUrl.searchParams.set("country", paystackCountry);

    // For Ghana without type, set pay_with_bank_transfer=true
    if (country === "GH" && !type) {
      paystackUrl.searchParams.set("pay_with_bank_transfer", "true");
    }

    // If type is provided (mobile_money or ghipss for Ghana), pass it to Paystack
    if (type) {
      paystackUrl.searchParams.set("type", type);
    }

    // Call Paystack API
    console.log("Calling Paystack API:", paystackUrl.toString());
    const paystackResponse = await fetch(paystackUrl.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
    });

    const paystackData = await paystackResponse.json();
    console.log("Paystack response status:", paystackResponse.status);
    console.log("Paystack response data:", paystackData);

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack error:", paystackData);
      return new Response(
        JSON.stringify({ error: paystackData.message || "Failed to fetch banks" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract and format bank data
    const banks: Bank[] = (paystackData.data || []).map((bank: any) => ({
      id: bank.id,
      name: bank.name,
      slug: bank.slug,
      code: bank.code,
      type: bank.type,
      currency: bank.currency,
    }));

    console.log(`Returning ${banks.length} banks/providers`);

    return new Response(
      JSON.stringify({ banks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching banks:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
