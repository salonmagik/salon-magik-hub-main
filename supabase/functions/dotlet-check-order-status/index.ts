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
    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "orderId is required" }),
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

    // We use the auth header to validate RLS (owner/manager)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Fetch order from DB
    const { data: order, error: orderError } = await supabase
      .from("domain_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("Fetch order error:", orderError);
      return new Response(
        JSON.stringify({ error: "Order not found or unauthorized" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!order.dotlet_order_id) {
      return new Response(
        JSON.stringify({ status: order.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Call Dotlet API to get current status
    const dotletApiUrl = Deno.env.get("DOTLET_API_URL") ?? "https://api.dotlet.net/api/v1";
    const dotletApiKey = Deno.env.get("DOTLET_API_KEY") ?? "";

    const dotletRes = await fetch(`${dotletApiUrl}/registrar/orders/${order.dotlet_order_id}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${dotletApiKey}`,
        "Accept": "application/json",
      }
    });

    if (!dotletRes.ok) {
      const errorText = await dotletRes.text();
      console.error(`Dotlet order fetch error: ${dotletRes.status} ${errorText}`);
      throw new Error("Failed to fetch order status from provider");
    }

    const dotletData = await dotletRes.json();
    // Expected to return { status: "pending_payment" | "processing" | "completed" | "failed" }
    const newStatus = dotletData.status || order.status;

    // 3. Update DB if status changed
    if (newStatus !== order.status) {
      // Use service role to update if RLS is restrictive on update, but here we assume owner can update their own order
      const { error: updateError } = await supabase
        .from("domain_orders")
        .update({ status: newStatus })
        .eq("id", order.id);

      if (updateError) {
        console.error("Failed to update order status in DB:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        id: order.id,
        status: newStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Check order status error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
