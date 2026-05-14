import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain, tenantId, registrant, admin, tech, billing } = await req.json();

    if (!domain || typeof domain !== "string" || !tenantId) {
      return new Response(
        JSON.stringify({ error: "Domain and tenantId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Initial Insert to verify RLS and lock intent
    const { data: order, error: insertError } = await supabase
      .from("domain_orders")
      .insert({
        tenant_id: tenantId,
        domain_name: domain,
        status: "pending_payment",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Unauthorized or failed to create order" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Call Dotlet API
    const dotletApiUrl = Deno.env.get("DOTLET_API_URL") ?? "https://api.dotlet.io/v1";
    const dotletApiKey = Deno.env.get("DOTLET_API_KEY") ?? "";

    const payload = {
      domain,
      registrant: registrant || {},
      admin: admin || {},
      tech: tech || {},
      billing: billing || {},
      years: 1 // Assuming 1 year for now
    };

    const dotletRes = await fetch(`${dotletApiUrl}/registrar/order`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dotletApiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!dotletRes.ok) {
      const errorText = await dotletRes.text();
      console.error(`Dotlet order error: ${dotletRes.status} ${errorText}`);
      
      // Mark as failed in our DB
      await supabase.from("domain_orders").update({ status: "failed" }).eq("id", order.id);

      throw new Error(`Failed to purchase domain from provider: ${errorText}`);
    }

    const dotletData = await dotletRes.json();
    // Assuming dotletData returns: { id: "order_123", price: 15.00, currency: "USD", bank_transfer_instructions: "..." }

    // 3. Update order with Dotlet details
    const { error: updateError } = await supabase
      .from("domain_orders")
      .update({
        dotlet_order_id: dotletData.id || `req_${Date.now()}`,
        price_amount: dotletData.price || 0,
        price_currency: dotletData.currency || "USD",
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("Failed to update order with Dotlet ID:", updateError);
      // We still return success but log the error, because the dotlet order went through.
      // A robust system would use a service role here to ensure the update works, 
      // but RLS should allow the user to update their own pending order.
    }

    return new Response(
      JSON.stringify({
        id: order.id, // Internal order ID
        dotlet_order_id: dotletData.id,
        price: dotletData.price,
        currency: dotletData.currency,
        bank_transfer_instructions: dotletData.bank_transfer_instructions || "Please transfer the amount to our bank account...",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Domain purchase error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
