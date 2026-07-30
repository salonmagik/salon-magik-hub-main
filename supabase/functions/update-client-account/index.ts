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

    const { fullName, phone, preferences, gender, dobMonth, dobDay, detailsConfirmed } = await req.json();
    const updates: Record<string, unknown> = {};
    const customerOnlyUpdates: Record<string, unknown> = {};

    if (typeof fullName === "string" && fullName.trim()) {
      updates.full_name = fullName.trim();
    }

    const DOB_YEAR = 2000;
    if (typeof gender === "string" && ["female", "male", "prefer-not"].includes(gender)) {
      customerOnlyUpdates.gender = gender;
    }
    if (typeof dobMonth === "string" && typeof dobDay === "string" && dobMonth && dobDay) {
      const month = Number(dobMonth);
      const day = Number(dobDay);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        customerOnlyUpdates.birthday = `${DOB_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    if (typeof phone === "string") {
      const trimmed = phone.trim();
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("phone")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (trimmed && trimmed !== existingProfile?.phone) {
        // Setting a NEW number must go through request-phone-change-otp /
        // confirm-phone-change so it's proven and checked for uniqueness
        // first — this endpoint only allows clearing a phone (nothing to
        // prove ownership of there) or leaving it unchanged.
        return new Response(
          JSON.stringify({ error: "Changing your phone number requires verification. Use 'Change number' under Security." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      if (!trimmed && existingProfile?.phone) {
        updates.phone = null;
        updates.phone_verified_at = null;
      }
    }

    if (detailsConfirmed === true) {
      updates.details_confirmed_at = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      const { error: profileError } = await admin
        .from("profiles")
        .update(updates)
        .eq("user_id", authData.user.id);
      if (profileError) throw profileError;

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

    const customerUpdates: Record<string, unknown> = { ...customerOnlyUpdates };
    if ("full_name" in updates) customerUpdates.full_name = updates.full_name;
    if ("phone" in updates) customerUpdates.phone = updates.phone;
    if (Object.keys(customerUpdates).length > 0) {
      // Client-owned fields propagate across every salon this customer is
      // linked to — same as phone/email — since they describe the person,
      // not the salon relationship.
      const { error: customerError } = await admin
        .from("customers")
        .update(customerUpdates)
        .eq("user_id", authData.user.id);
      if (customerError) throw customerError;
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
