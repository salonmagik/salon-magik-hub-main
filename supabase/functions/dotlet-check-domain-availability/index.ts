import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();
  // Strip http:// or https://
  normalized = normalized.replace(/^https?:\/\//, "");
  // Strip www.
  normalized = normalized.replace(/^www\./, "");
  // Strip trailing slash and anything after it
  normalized = normalized.split("/")[0];
  return normalized;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain } = await req.json();

    if (!domain || typeof domain !== "string") {
      return new Response(
        JSON.stringify({ error: "Domain is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedDomain = normalizeDomain(domain);
    
    // Basic format validation (e.g., mysalon.com)
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]{2,})+$/;
    if (!domainRegex.test(normalizedDomain)) {
       return new Response(
        JSON.stringify({ error: "Invalid domain format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dotletApiUrl = Deno.env.get("DOTLET_API_URL") ?? "https://api.dotlet.io/v1";
    const dotletApiKey = Deno.env.get("DOTLET_API_KEY") ?? "";

    const headers = {
      "Authorization": `Bearer ${dotletApiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    // 1. Check Availability
    const availabilityRes = await fetch(`${dotletApiUrl}/registrar/availability/${normalizedDomain}`, {
      method: "GET",
      headers,
    });

    if (!availabilityRes.ok) {
      const errorText = await availabilityRes.text();
      console.error(`Dotlet availability error: ${availabilityRes.status} ${errorText}`);
      throw new Error("Failed to check domain availability");
    }

    const availabilityData = await availabilityRes.json();
    // Assuming availabilityData looks like: { available: true }

    // 2. Check Price
    const priceRes = await fetch(`${dotletApiUrl}/registrar/price/${normalizedDomain}`, {
      method: "GET",
      headers,
    });

    if (!priceRes.ok) {
      const errorText = await priceRes.text();
      console.error(`Dotlet price error: ${priceRes.status} ${errorText}`);
      throw new Error("Failed to check domain price");
    }

    const priceData = await priceRes.json();
    // Assuming priceData looks like: { price: 15.00, currency: "USD" }

    const responsePayload = {
      domain: normalizedDomain,
      available: availabilityData.available ?? false,
      price: priceData.price ?? 0,
      currency: priceData.currency ?? "USD"
    };

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Domain availability check error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});