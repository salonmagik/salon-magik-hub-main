import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { tenantId, email } = await req.json();
    const normalizedEmail = normalizeEmail(email);

    if (!tenantId || !normalizedEmail) {
      return new Response(JSON.stringify({ error: "Tenant and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: customer } = await admin
      .from("customers")
      .select("id, user_id")
      .eq("tenant_id", tenantId)
      .eq("email", normalizedEmail)
      .neq("status", "deleted")
      .maybeSingle();

    return new Response(
      JSON.stringify({
        hasAccount: Boolean(customer?.user_id),
        customerExists: Boolean(customer?.id),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("public-booking-email-lookup error", error);
    return new Response(JSON.stringify({ error: "Failed to look up customer email" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
