import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, createPaystackSubaccount } from "../_shared/paystack-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { destinationId } = await req.json();
    if (!destinationId) {
      return new Response(
        JSON.stringify({ error: "Missing destinationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch destination
    const { data: dest, error: destError } = await serviceSupabase
      .from("salon_payout_destinations")
      .select("*")
      .eq("id", destinationId)
      .single();

    if (destError || !dest) {
      return new Response(
        JSON.stringify({ error: "Destination not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (dest.paystack_subaccount_code) {
       return new Response(
        JSON.stringify({ error: "Subaccount already created" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (dest.destination_type !== "bank") {
      return new Response(
        JSON.stringify({ error: "Subaccounts are only for bank destinations" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch tenant details
    const { data: tenant, error: tenantError } = await serviceSupabase
      .from("tenants")
      .select("name, platform_percentage_charge")
      .eq("id", dest.tenant_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const subaccountData = await createPaystackSubaccount(dest.currency, {
        business_name: tenant.name || `Salon ${dest.tenant_id}`,
        settlement_bank: dest.bank_code!,
        account_number: dest.account_number!,
        percentage_charge: tenant.platform_percentage_charge || 10,
        primary_contact_email: user.email,
      });

      // Update destination
      await serviceSupabase
        .from("salon_payout_destinations")
        .update({
          paystack_subaccount_code: subaccountData.subaccount_code,
          paystack_subaccount_id: subaccountData.id,
          paystack_subaccount_active: subaccountData.active,
          paystack_subaccount_error: null,
        })
        .eq("id", destinationId);

      // Update tenant status
      await serviceSupabase
        .from("tenants")
        .update({
          payment_setup_status: "ready",
          payment_setup_error: null,
        })
        .eq("id", dest.tenant_id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      console.error("Error creating subaccount:", err);
      
      const errorMsg = err.message || "Unknown error creating subaccount";
      
      // Update destination with error
      await serviceSupabase
        .from("salon_payout_destinations")
        .update({
          paystack_subaccount_error: errorMsg,
        })
        .eq("id", destinationId);

      // Update tenant status
      await serviceSupabase
        .from("tenants")
        .update({
          payment_setup_status: "failed",
          payment_setup_error: errorMsg,
        })
        .eq("id", dest.tenant_id);

      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error retrying subaccount:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
