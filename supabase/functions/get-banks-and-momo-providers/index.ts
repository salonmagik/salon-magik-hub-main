import { getCountryForCurrency, getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

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
    // Parse request body
    const { country, type, currency } = await req.json();

    if (!country && !currency) {
      return new Response(
        JSON.stringify({ error: "Missing country or currency parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine country from currency if not provided
    let targetCountry = country;
    if (currency && !targetCountry) {
      targetCountry = getCountryForCurrency(currency);
      if (!targetCountry) {
        return new Response(
          JSON.stringify({ error: `Unsupported currency: ${currency}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Determine currency from country if not provided
    const effectiveCurrency = currency || (targetCountry === "GH" ? "GHS" : "NGN");

    // Get currency-specific Paystack key
    const paystackKeyResult = getPaystackKeyForCurrency(effectiveCurrency);
    if (paystackKeyResult.error || !paystackKeyResult.key) {
      return new Response(
        JSON.stringify({
          error: paystackKeyResult.error || "Paystack not configured for this currency"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const paystackSecretKey = paystackKeyResult.key;

    // Map country codes to Paystack country names
    const countryMap: Record<string, string> = {
      'GH': 'ghana',
      'NG': 'nigeria',
      'KE': 'kenya',
      'ZA': 'south africa',
    };

    const paystackCountry = countryMap[targetCountry] || targetCountry.toLowerCase();

    // Build Paystack API URL
    const paystackUrl = new URL("https://api.paystack.co/bank");
    paystackUrl.searchParams.set("country", paystackCountry);

    // Handle type parameter based on country
    if (targetCountry === "NG") {
      // Nigeria: type="bank" is not valid, use pay_with_bank filter instead
      if (type === "bank") {
        // paystackUrl.searchParams.set("pay_with_bank", "true");
      } else if (type === "mobile_money") {
        // Nigeria doesn't support mobile money via Paystack
        // Return early with empty array
        console.log("Mobile money not supported for Nigeria");
        return new Response(
          JSON.stringify({ banks: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (targetCountry === "GH") {
      // Ghana: use type parameter for mobile_money and ghipss
      if (type === "mobile_money") {
        paystackUrl.searchParams.set("type", "mobile_money");
      } else if (type === "bank") {
        // For Ghana banks, use ghipss type or pay_with_bank_transfer
        paystackUrl.searchParams.set("type", "ghipss");
      } else if (!type) {
        // Default for Ghana: banks with transfer support
        paystackUrl.searchParams.set("pay_with_bank_transfer", "true");
      }
    } else {
      // Other countries (Kenya, South Africa): pass type as-is if provided
      if (type) {
        paystackUrl.searchParams.set("type", type);
      }
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
