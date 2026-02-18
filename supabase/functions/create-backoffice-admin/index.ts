import { createClient } from "npm:@supabase/supabase-js@2";
import {
  wrapEmailTemplate,
  heading,
  paragraph,
  smallText,
  createButton,
  getSenderName,
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AllowedRole = "admin" | "support_agent";

interface CreateBackofficeAdminBody {
  email: string;
  role: AllowedRole;
  origin?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAllowedRole(role: string): role is AllowedRole {
  return role === "admin" || role === "support_agent";
}

function generateSecurePassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "Backoffice Admin";
  return local
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function findUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const found = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const rawAuthHeader =
			req.headers.get("authorization") ||
			req.headers.get("Authorization") ||
			"";
		const accessToken = rawAuthHeader.replace(/^Bearer\s+/i, "").trim();

		if (!accessToken) {
			return new Response(
				JSON.stringify({
					error: "Missing or invalid Authorization bearer token",
				}),
				{
					status: 401,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				},
			);
		}

    const userClient = createClient(supabaseUrl, anonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
			data: { user: actor },
			error: actorErr,
		} = await userClient.auth.getUser(accessToken);

    if (actorErr || !actor) {
      return new Response(
				JSON.stringify({ error: actorErr?.message || "Unauthorized" }),
				{
					status: 401,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				},
			);
    }

    const { data: actorBackofficeUser } = await adminClient
      .from("backoffice_users")
      .select("user_id, role, is_active")
      .eq("user_id", actor.id)
      .maybeSingle();

    if (!actorBackofficeUser || actorBackofficeUser.role !== "super_admin" || actorBackofficeUser.is_active === false) {
      return new Response(
        JSON.stringify({ error: "Only active super admins can add backoffice admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: CreateBackofficeAdminBody = await req.json();
    const email = normalizeEmail(body.email || "");
    const role = body.role;

    if (!email || !isAllowedRole(role)) {
      return new Response(JSON.stringify({ error: "Valid email and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = email.split("@")[1];
    if (!domain) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allowedDomain } = await adminClient
      .from("backoffice_allowed_domains")
      .select("domain")
      .eq("domain", domain)
      .maybeSingle();

    if (!allowedDomain) {
      return new Response(
        JSON.stringify({ error: `Domain ${domain} is not allowed for backoffice access` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tempPassword = generateSecurePassword();
    const fullName = displayNameFromEmail(email);

    const existingUser = await findUserByEmail(adminClient, email);
    let targetUserId: string;

    if (existingUser) {
      const { error: updateUserError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          ...(existingUser.user_metadata || {}),
          full_name: fullName,
          backoffice_invited_at: new Date().toISOString(),
        },
      });

      if (updateUserError) {
        throw new Error(`Failed to update existing user: ${updateUserError.message}`);
      }

      targetUserId = existingUser.id;
    } else {
      const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          backoffice_invited_at: new Date().toISOString(),
        },
      });

      if (createUserError || !createdUser.user) {
        throw new Error(`Failed to create auth user: ${createUserError?.message || "Unknown error"}`);
      }

      targetUserId = createdUser.user.id;
    }

    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        user_id: targetUserId,
        full_name: fullName,
      },
      { onConflict: "user_id" },
    );
    if (profileError) {
      throw new Error(`Failed to upsert profile: ${profileError.message}`);
    }

    const { error: backofficeUpsertError } = await adminClient.from("backoffice_users").upsert(
      {
        user_id: targetUserId,
        email_domain: domain,
        role,
        is_active: true,
        totp_enabled: false,
        totp_secret: null,
      },
      { onConflict: "user_id" },
    );
    if (backofficeUpsertError) {
      throw new Error(`Failed to upsert backoffice user: ${backofficeUpsertError.message}`);
    }

    // Best effort for newer flag columns (safe on older schemas).
    await adminClient
      .from("backoffice_users")
      .update({
        temp_password_required: true,
        password_changed_at: null,
        totp_required: false,
        totp_verified_at: null,
      })
      .eq("user_id", targetUserId);

    const loginOrigin =
      body.origin?.trim() ||
      Deno.env.get("BACKOFFICE_APP_URL") ||
      Deno.env.get("BASE_URL") ||
      "https://backoffice.salonmagik.com";
    const loginUrl = `${loginOrigin.replace(/\/$/, "")}/login`;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    let emailSent = false;

    if (resendApiKey && fromEmail) {
      const emailHtml = wrapEmailTemplate(
        `
          ${heading("You’ve been added to Salon Magik BackOffice")}
          ${paragraph(`Your BackOffice access has been created with role <strong>${role.replace("_", " ")}</strong>.`)}
          ${paragraph(`<strong>Sign-in email:</strong> ${email}`)}
          ${paragraph(`<strong>Temporary password:</strong> <code style="background:#e5e7eb;padding:4px 8px;border-radius:4px;">${tempPassword}</code>`)}
          ${createButton("Go to BackOffice login", loginUrl)}
          ${smallText("You must change this password at first login before you can access the dashboard.")}
          ${smallText("After login, you can set up 2FA with an authenticator app.")}
        `,
        { mode: "product" },
      );

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${getSenderName({ mode: "product" })} <${fromEmail}>`,
          to: [email],
          subject: "Your Salon Magik BackOffice access",
          html: emailHtml,
        }),
      });

      emailSent = emailResponse.ok;
      if (!emailResponse.ok) {
        console.error("Failed to send invite email:", await emailResponse.text());
      }
    }

    await adminClient.from("audit_logs").insert({
      action: "backoffice_admin_invited",
      entity_type: "backoffice_users",
      entity_id: targetUserId,
      actor_user_id: actor.id,
      metadata: { email, role, emailSent },
    });

    return new Response(
      JSON.stringify({
        success: true,
        email,
        role,
        emailSent,
        tempPassword: emailSent ? null : tempPassword,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in create-backoffice-admin:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create backoffice admin" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
