import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const localPhoneLengths: Record<string, number> = {
  GH: 10,
  NG: 11,
};

const dialCodes: Record<string, string> = {
  GH: "+233",
  NG: "+234",
};

function toE164(countryCode: string, inputPhone: string): string | null {
  const digits = inputPhone.replace(/\D/g, "");
  const uppercaseCountryCode = countryCode.toUpperCase();
  const strictLength = localPhoneLengths[uppercaseCountryCode];

  if (strictLength) {
    if (digits.length !== strictLength) return null;
    const localWithoutLeadingZero = digits.startsWith("0") ? digits.slice(1) : digits;
    if (!localWithoutLeadingZero) return null;
    return `${dialCodes[uppercaseCountryCode]}${localWithoutLeadingZero}`;
  }

  if (inputPhone.startsWith("+") && digits.length >= 8) {
    return `+${digits}`;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const {
      first_name,
      last_name,
      email,
      phone,
      country,
      city,
      salon_name,
      team_size,
      notes,
      source,
    } = body;

    if (!first_name || !last_name || !email || !phone || !country || !city || !salon_name) {
      return new Response(
        JSON.stringify({ error: "First name, last name, email, phone, country, city, and salon name are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCountry = String(country).trim().toUpperCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const liveCountries = new Set(["GH", "NG"]);

    if (!emailRegex.test(normalizedEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (liveCountries.has(normalizedCountry)) {
      return new Response(
        JSON.stringify({
          error:
            "Ghana and Nigeria are already live. Please use the main signup/waitlist flow.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phoneE164 = toE164(normalizedCountry, String(phone));
    if (!phoneE164) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number for selected country." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sourceValue = typeof source === "string" && source.trim().length > 0 ? source.trim() : "footer_cta";
    const parsedTeamSize =
      team_size === null || team_size === undefined || team_size === "" ? null : Number(team_size);

    if (parsedTeamSize !== null && Number.isNaN(parsedTeamSize)) {
      return new Response(
        JSON.stringify({ error: "Team size must be a number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error } = await supabaseAdmin.from("market_interest_leads").insert({
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      email: normalizedEmail,
      phone_e164: phoneE164,
      country: normalizedCountry,
      city: String(city).trim(),
      salon_name: String(salon_name).trim(),
      team_size: parsedTeamSize,
      notes: typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null,
      source: sourceValue,
    });

    if (error) {
      console.error("submit-market-interest insert error", error);
      return new Response(
        JSON.stringify({ error: "Failed to submit your interest." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("submit-market-interest error", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error submitting your interest." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
