import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PasswordChangeRequest {
  newPassword: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
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
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Client with user's auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user needs password change
    if (user.user_metadata?.requires_password_change !== true) {
      return new Response(
        JSON.stringify({ error: "Password change not required for this user" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { newPassword }: PasswordChangeRequest = await req.json();

    if (!newPassword) {
      return new Response(
        JSON.stringify({ error: "New password is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return new Response(
        JSON.stringify({ 
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use service role to update user password and metadata
    const serviceRoleClient = createClient(supabaseUrl, supabaseServiceKey);

    // Update password
    const { error: updateError } = await serviceRoleClient.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
        user_metadata: {
          ...user.user_metadata,
          requires_password_change: false, // Clear the flag
        },
      }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update password" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update staff invitation record if exists
    const { error: invitationError } = await serviceRoleClient
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        password_changed_at: new Date().toISOString(),
        temp_password_used: true,
      })
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (invitationError) {
      console.error("Error updating invitation:", invitationError);
      // Non-critical, continue
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password changed successfully" 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in complete-password-change:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
