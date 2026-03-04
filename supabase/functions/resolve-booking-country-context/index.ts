import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResolveRequest {
  tenantSlug?: string;
  clientPreferenceCountry?: string | null;
}

interface ResolveResponse {
  detected_country_code: string | null;
  selected_country_code: string | null;
  supported_country_codes: string[];
  requires_country_selection: boolean;
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length < 2) return null;
  return normalized;
}

function detectCountryFromHeaders(headers: Headers): string | null {
  const headerCandidates = [
    "x-vercel-ip-country",
    "cf-ipcountry",
    "cloudfront-viewer-country",
    "x-country-code",
    "x-appengine-country",
  ];

  for (const key of headerCandidates) {
    const rawValue = headers.get(key);
    const normalized = normalizeCountryCode(rawValue);
    if (normalized) return normalized;
  }

  return null;
}

async function detectCountryFromIp(headers: Headers): Promise<string | null> {
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return null;

  const firstIp = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);

  if (!firstIp) return null;

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(firstIp)}/country/`, {
      signal: AbortSignal.timeout(1200),
    });

    if (!response.ok) return null;

    const text = await response.text();
    return normalizeCountryCode(text);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json()) as ResolveRequest;

    const tenantSlug = body.tenantSlug?.trim();
    if (!tenantSlug) {
      return new Response(JSON.stringify({ error: "tenantSlug is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("online_booking_enabled", true)
      .maybeSingle();

    if (tenantError) {
      console.error("resolve-booking-country-context tenant fetch error", tenantError);
      return new Response(JSON.stringify({ error: "Failed to resolve tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tenant?.id) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: locationRows, error: locationsError } = await supabase
      .from("locations")
      .select("country")
      .eq("tenant_id", tenant.id)
      .eq("availability", "open");

    if (locationsError) {
      console.error("resolve-booking-country-context locations fetch error", locationsError);
      return new Response(JSON.stringify({ error: "Failed to resolve country support" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supportedCountryCodes = Array.from(
      new Set(
        (locationRows ?? [])
          .map((row) => normalizeCountryCode(row.country))
          .filter((code): code is string => Boolean(code)),
      ),
    ).sort();

    const preferredCountryCode = normalizeCountryCode(body.clientPreferenceCountry);

    let detectedCountryCode = detectCountryFromHeaders(req.headers);
    if (!detectedCountryCode) {
      detectedCountryCode = await detectCountryFromIp(req.headers);
    }

    const isCountrySupported = (countryCode: string | null) =>
      Boolean(countryCode && supportedCountryCodes.includes(countryCode));

    let selectedCountryCode: string | null = null;
    if (isCountrySupported(preferredCountryCode)) {
      selectedCountryCode = preferredCountryCode;
    } else if (isCountrySupported(detectedCountryCode)) {
      selectedCountryCode = detectedCountryCode;
    }

    const response: ResolveResponse = {
      detected_country_code: detectedCountryCode,
      selected_country_code: selectedCountryCode,
      supported_country_codes: supportedCountryCodes,
      requires_country_selection:
        supportedCountryCodes.length > 0 && selectedCountryCode === null,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("resolve-booking-country-context error", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
