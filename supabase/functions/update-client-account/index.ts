import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { fullName, phone, preferences } = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof fullName === "string" && fullName.trim()) {
      updates.full_name = fullName.trim();
    }
    if (typeof phone === "string") {
      const trimmed = phone.trim();
      if (trimmed && !/^\+[1-9][0-9]{6,14}$/.test(trimmed)) {
        return new Response(
          JSON.stringify({ error: "Phone number must be in international format, e.g. +2348012345678" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      updates.phone = trimmed || null;
    }

    if (Object.keys(updates).length > 0) {
      const { error: profileError } = await admin
        .from("profiles")
        .update(updates)
        .eq("user_id", authData.user.id);
      if (profileError) throw profileError;

      const customerUpdates: Record<string, unknown> = {};
      if ("full_name" in updates) customerUpdates.full_name = updates.full_name;
      if ("phone" in updates) customerUpdates.phone = updates.phone;
      if (Object.keys(customerUpdates).length > 0) {
        const { error: customerError } = await admin
          .from("customers")
          .update(customerUpdates)
          .eq("user_id", authData.user.id);
        if (customerError) throw customerError;
      }

      const nextMetadata = {
        ...(authData.user.user_metadata ?? {}),
        ...(updates.full_name ? { full_name: updates.full_name } : {}),
        ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
      };
      const { error: metadataError } = await admin.auth.admin.updateUserById(authData.user.id, {
        user_metadata: nextMetadata,
      });
      if (metadataError) throw metadataError;
    }

    if (preferences && typeof preferences === "object") {
      const { error: preferenceError } = await admin
        .from("client_account_preferences")
        .upsert(
          {
            user_id: authData.user.id,
            email_booking_updates: Boolean((preferences as Record<string, unknown>).email_booking_updates),
            sms_booking_updates: Boolean((preferences as Record<string, unknown>).sms_booking_updates),
            marketing_opt_in: Boolean((preferences as Record<string, unknown>).marketing_opt_in),
          },
          { onConflict: "user_id" } as any,
        );
      if (preferenceError) throw preferenceError;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("update-client-account error", error);
    return new Response(JSON.stringify({ error: "Failed to update account" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
