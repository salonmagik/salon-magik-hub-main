import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { encode as base32Encode, decode as base32Decode } from "https://deno.land/std@0.190.0/encoding/base32.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ResetRequest {
  token: string;
  newPassword: string;
  totpCode: string;
}

// TOTP verification (RFC 6238)
function generateTOTP(secret: string, timeStep = 30, digits = 6): string {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setBigUint64(0, BigInt(time), false);

  const keyBytes = base32Decode(secret.toUpperCase().replace(/\s/g, ""));
  const key = new Uint8Array(keyBytes);

  const hmacKey = crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  return hmacKey.then(async (cryptoKey) => {
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new Uint8Array(timeBuffer));
    const signatureArray = new Uint8Array(signature);
    const offset = signatureArray[signatureArray.length - 1] & 0x0f;
    const binary =
      ((signatureArray[offset] & 0x7f) << 24) |
      ((signatureArray[offset + 1] & 0xff) << 16) |
      ((signatureArray[offset + 2] & 0xff) << 8) |
      (signatureArray[offset + 3] & 0xff);
    const otp = binary % Math.pow(10, digits);
    return otp.toString().padStart(digits, "0");
  });
}

async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  // Check current time step and one step before/after for clock drift
  for (const offset of [0, -1, 1]) {
    const time = Math.floor(Date.now() / 1000 / 30) + offset;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, BigInt(time), false);

    const keyBytes = base32Decode(secret.toUpperCase().replace(/\s/g, ""));
    const key = new Uint8Array(keyBytes);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new Uint8Array(timeBuffer));
    const signatureArray = new Uint8Array(signature);
    const offsetByte = signatureArray[signatureArray.length - 1] & 0x0f;
    const binary =
      ((signatureArray[offsetByte] & 0x7f) << 24) |
      ((signatureArray[offsetByte + 1] & 0xff) << 16) |
      ((signatureArray[offsetByte + 2] & 0xff) << 8) |
      (signatureArray[offsetByte + 3] & 0xff);
    const otp = (binary % 1000000).toString().padStart(6, "0");

    if (otp === code) {
      return true;
    }
  }
  return false;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, newPassword, totpCode }: ResetRequest = await req.json();

    if (!token || !newPassword || !totpCode) {
      return new Response(
        JSON.stringify({ success: false, error: "Token, password, and authenticator code are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find and validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired reset token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Reset token has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ success: false, error: "Reset token has already been used" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the auth user
    const { data: users } = await supabase.auth.admin.listUsers();
    const authUser = users?.users?.find((u) => u.email?.toLowerCase() === tokenData.email.toLowerCase());

    if (!authUser) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify user is a backoffice user and get their TOTP secret
    const { data: backofficeUser, error: backofficeError } = await supabase
      .from("backoffice_users")
      .select("totp_secret, totp_enabled")
      .eq("user_id", authUser.id)
      .single();

    if (backofficeError || !backofficeUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Not a BackOffice user" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!backofficeUser.totp_enabled || !backofficeUser.totp_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "2FA not configured for this account" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify TOTP code
    const totpValid = await verifyTOTP(backofficeUser.totp_secret, totpCode);
    if (!totpValid) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authenticator code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error("Failed to update password:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update password" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark token as used
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    // Invalidate all existing backoffice sessions for this user
    await supabase
      .from("backoffice_sessions")
      .update({ 
        ended_at: new Date().toISOString(),
        end_reason: "password_reset"
      })
      .eq("user_id", authUser.id)
      .is("ended_at", null);

    console.log("BackOffice password reset completed successfully for:", tokenData.email);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in complete-backoffice-password-reset:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Failed to reset password" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
