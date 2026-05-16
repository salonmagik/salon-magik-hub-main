import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenantId, newSlug } = await req.json();

    if (!tenantId || !newSlug) {
      return new Response(JSON.stringify({ error: "tenantId and newSlug are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth client for RLS checks - ensure user has access to this tenant
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, custom_booking_domain, dotlet_origin_rule_id")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error("Fetch tenant error:", tenantError);
      return new Response(JSON.stringify({ error: "Tenant not found or unauthorized" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tenant.custom_booking_domain || !tenant.dotlet_origin_rule_id) {
      // Nothing to sync, this is not an error but a no-op
      return new Response(JSON.stringify({ success: true, message: "No custom domain configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dotletApiUrl = Deno.env.get("DOTLET_API_URL") ?? "https://api.dotlet.io/v1";
    const dotletApiKey = Deno.env.get("DOTLET_API_KEY") ?? "";

    // Update the origin rule in Dotlet
    // We try PUT /origin-rules/{id} first
    const updateRes = await fetch(`${dotletApiUrl}/origin-rules/${tenant.dotlet_origin_rule_id}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${dotletApiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        domain: tenant.custom_booking_domain,
        target: `${newSlug}.salonmagik.com`,
      }),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error(`Dotlet Origin Rule update error: ${updateRes.status} ${errorText}`);
      
      // If PUT fails, fallback to POST (re-create/overwrite)
      console.log("Falling back to POST /origin-rules");
      const originRes = await fetch(`${dotletApiUrl}/origin-rules`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${dotletApiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          domain: tenant.custom_booking_domain,
          target: `${newSlug}.salonmagik.com`,
        }),
      });

      if (!originRes.ok) {
         const fallbackError = await originRes.text();
         console.error(`Dotlet Origin Rule fallback error: ${originRes.status} ${fallbackError}`);
         throw new Error("Failed to configure origin rule");
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Sync slug error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});