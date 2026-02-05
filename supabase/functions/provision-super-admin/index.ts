import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a secure random password
function generateSecurePassword(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const superAdminEmail = "tech@salonmagik.com";

    // Check if already seeded
    const { data: existingSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "super_admin_seeded")
      .single();

    if (existingSetting?.value === true) {
      return new Response(
        JSON.stringify({ message: "Super admin already provisioned" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check if backoffice user already exists
    const { data: existingBackoffice } = await supabase
      .from("backoffice_users")
      .select("id")
      .eq("email_domain", "salonmagik.com")
      .eq("role", "super_admin")
      .single();

    if (existingBackoffice) {
      // Mark as seeded
      await supabase.from("platform_settings").upsert({
        key: "super_admin_seeded",
        value: true,
        description: "Flag indicating super admin has been provisioned",
      });

      return new Response(
        JSON.stringify({ message: "Super admin already exists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Generate password
    const password = generateSecurePassword();

    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: superAdminEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "Super Admin",
      },
    });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    // Create profile
    await supabase.from("profiles").insert({
      user_id: authUser.user.id,
      full_name: "Super Admin",
    });

    // Create backoffice user
    const { error: boError } = await supabase.from("backoffice_users").insert({
      user_id: authUser.user.id,
      email_domain: "salonmagik.com",
      role: "super_admin",
      totp_enabled: false,
    });

    if (boError) {
      throw new Error(`Failed to create backoffice user: ${boError.message}`);
    }

    // Mark as seeded
    await supabase.from("platform_settings").upsert({
      key: "super_admin_seeded",
      value: true,
      description: "Flag indicating super admin has been provisioned",
    });

    // Send password via email using Resend
    if (resendApiKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: superAdminEmail,
          subject: "🔐 Salon Magik BackOffice - Super Admin Credentials",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Super Admin Credentials</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f4f4f5;">
              <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="display: inline-block; background: #ef4444; color: white; padding: 12px; border-radius: 10px; margin-bottom: 16px;">
                    <span style="font-size: 24px;">🛡️</span>
                  </div>
                  <h1 style="color: #111; font-size: 24px; margin: 0;">BackOffice Super Admin</h1>
                </div>
                
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Your Salon Magik BackOffice Super Admin account has been created. Use the credentials below to log in:
                </p>
                
                <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
                  <p style="margin: 0 0 12px 0;"><strong>Email:</strong> ${superAdminEmail}</p>
                  <p style="margin: 0;"><strong>Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${password}</code></p>
                </div>
                
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 24px 0;">
                  <p style="color: #92400e; font-size: 14px; margin: 0;">
                    <strong>⚠️ Important:</strong> Please set up 2FA immediately after logging in. Change your password after first login.
                  </p>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                  This is an automated message. Do not share these credentials.
                </p>
              </div>
            </body>
            </html>
          `,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send email:", await emailResponse.text());
      }
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      action: "super_admin_provisioned",
      entity_type: "backoffice_users",
      entity_id: authUser.user.id,
      metadata: { email: superAdminEmail },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Super admin provisioned successfully. Credentials sent to " + superAdminEmail,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
