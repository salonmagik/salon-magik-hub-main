import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ValidateInvitationRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service role to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token }: ValidateInvitationRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch invitation by token
    const { data, error } = await supabase
      .from("staff_invitations")
      .select("*, tenants(name)")
      .eq("token", token)
      .single();

    if (error || !data) {
      console.error("Invitation lookup error:", error);
      return new Response(
        JSON.stringify({ error: "Invalid invitation token" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check status
    if (data.status !== "pending") {
      return new Response(
        JSON.stringify({ 
          error: data.status === "accepted" 
            ? "This invitation has already been accepted" 
            : "This invitation is no longer valid"
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invitation has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Return invitation details (without exposing sensitive data)
    const response = {
      id: data.id,
      tenant_id: data.tenant_id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      status: data.status,
      expires_at: data.expires_at,
      tenant_name: (data.tenants as any)?.name || "Unknown Salon",
    };

    console.log("Invitation validated successfully for:", data.email);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in validate-staff-invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to validate invitation" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
