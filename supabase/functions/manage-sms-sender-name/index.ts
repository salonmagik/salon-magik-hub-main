import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface RequestSenderNameBody {
  senderId: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (roleError || !userRole) {
      return new Response(JSON.stringify({ error: "User not associated with any tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = userRole.tenant_id;
    const url = new URL(req.url);
    const action = url.pathname.split("/").filter(Boolean).at(-1);

    if (req.method === "POST" && action === "request") {
      const body = (await req.json()) as RequestSenderNameBody;
      const senderId = body.senderId?.trim().toUpperCase();

      if (!senderId) {
        return new Response(JSON.stringify({ error: "Missing required field: senderId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (senderId.length < 3 || senderId.length > 11 || !/^[a-zA-Z0-9]+$/.test(senderId)) {
        return new Response(JSON.stringify({ error: "Invalid sender name format. Must be alphanumeric and between 3-11 characters." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("legal_name, name")
        .eq("id", tenantId)
        .single();

      if (tenantError) {
        return new Response(JSON.stringify({ error: "Failed to fetch tenant information" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("tenants")
        .update({
          sms_sender_name: senderId,
          sms_sender_name_status: "pending",
          sms_sender_name_requested_at: new Date().toISOString(),
          sms_sender_name_company: tenant.legal_name || tenant.name,
          sms_sender_name_use_case: "Salon Magik outbound SMS messaging",
          sms_provider: "txtconnect",
        })
        .eq("id", tenantId);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to save sender name" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        senderId,
        status: "pending",
        message: "Sender name saved and marked pending review.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET" && action === "status") {
      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("sms_sender_name, sms_sender_name_status, sms_sender_name_requested_at, sms_sender_name_approved_at")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant?.sms_sender_name) {
        return new Response(JSON.stringify({ error: "No sender name configured for this tenant", status: "not_set" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        senderId: tenant.sms_sender_name,
        status: tenant.sms_sender_name_status || "not_set",
        requestedAt: tenant.sms_sender_name_requested_at,
        approvedAt: tenant.sms_sender_name_approved_at,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported endpoint or method" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
