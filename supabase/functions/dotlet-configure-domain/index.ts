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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client for RLS checks
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service role client to update tenants table (which might have strict RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch order from DB using authenticated user
    const { data: order, error: orderError } = await supabase
      .from("domain_orders")
      .select("*, tenants ( slug, custom_booking_domain )")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("Fetch order error:", orderError);
      return new Response(
        JSON.stringify({ error: "Order not found or unauthorized" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.status !== "completed") {
      return new Response(
        JSON.stringify({ error: "Order is not completed yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = order.domain_name;
    // Handle typing since we did a join
    const tenant = (order.tenants as unknown) as { slug: string, custom_booking_domain: string | null };
    const tenantSlug = tenant?.slug;

    if (!tenantSlug) {
      return new Response(
        JSON.stringify({ error: "Tenant slug not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dotletApiUrl = Deno.env.get("DOTLET_API_URL") ?? "https://api.dotlet.net/api/v1";
    const dotletApiKey = Deno.env.get("DOTLET_API_KEY") ?? "";

    // 2. Set proxied CNAME records via Dotlet DNS API
    const dnsRes = await fetch(`${dotletApiUrl}/dns/records`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dotletApiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        domain,
        records: [
          { type: "CNAME", name: "@", content: "cname.vercel-dns.com", proxied: true },
          { type: "CNAME", name: "www", content: "cname.vercel-dns.com", proxied: true }
        ]
      })
    });

    if (!dnsRes.ok) {
      const errorText = await dnsRes.text();
      console.error(`Dotlet DNS error: ${dnsRes.status} ${errorText}`);
      throw new Error("Failed to configure DNS records");
    }

    // 3. Create Origin Rule
    const originRes = await fetch(`${dotletApiUrl}/origin-rules`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dotletApiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        domain,
        target: `${tenantSlug}.salonmagik.com`
      })
    });

    if (!originRes.ok) {
      const errorText = await originRes.text();
      console.error(`Dotlet Origin Rule error: ${originRes.status} ${errorText}`);
      throw new Error("Failed to configure origin rule");
    }

    const originData = await originRes.json();
    const originRuleId = originData.id || `rule_${Date.now()}`;

    // 4. Update tenants with domain info
    const { error: tenantUpdateError } = await supabaseAdmin
      .from("tenants")
      .update({
        custom_booking_domain: domain,
        custom_domain_verified: true,
        custom_domain_verified_at: new Date().toISOString(),
        custom_domain_source: "dotlet",
        dotlet_domain_id: domain, // In dotlet, domain name is often used as ID, or we can leave it
        dotlet_origin_rule_id: originRuleId
      })
      .eq("id", order.tenant_id);

    if (tenantUpdateError) {
      console.error("Failed to update tenant with domain info:", tenantUpdateError);
      throw new Error("Failed to link domain to tenant in database");
    }

    return new Response(
      JSON.stringify({
        success: true,
        domain,
        originRuleId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Configure domain error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
