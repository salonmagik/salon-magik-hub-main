import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyEmailRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token }: VerifyEmailRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (tokenError || !tokenData) {
      console.error("Token validation error:", tokenError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Confirm email in auth FIRST — if this fails, don't mark the token used
    if (tokenData.user_id) {
      const { error: userUpdateError } = await supabase.auth.admin.updateUserById(
        tokenData.user_id,
        { email_confirm: true }
      );

      if (userUpdateError) {
        console.error("Failed to confirm user email in auth:", userUpdateError);
        return new Response(
          JSON.stringify({ error: "Failed to confirm your email. Please try clicking the link again or request a new one." }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Verify the update actually took effect
      const { data: confirmedUser } = await supabase.auth.admin.getUserById(tokenData.user_id);
      if (!confirmedUser?.user?.email_confirmed_at) {
        console.error("email_confirmed_at not set after updateUserById for user:", tokenData.user_id);
        return new Response(
          JSON.stringify({ error: "Email confirmation did not save. Please try again or request a new verification link." }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Mark token as verified only after auth is confirmed
    const { error: updateError } = await supabase
      .from("email_verification_tokens")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    if (updateError) {
      console.error("Failed to update token verified_at:", updateError);
      // Auth is already confirmed — log but don't fail the user experience
    }

    console.log("Email verified successfully for:", tokenData.email);

    return new Response(
      JSON.stringify({ success: true, email: tokenData.email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in verify-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to verify email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
