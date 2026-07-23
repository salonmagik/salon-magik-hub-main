import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  wrapEmailTemplate,
  createButton,
  paragraph,
  heading,
  buildFromAddress,
} from "../_shared/email-template.ts";
import { fetchPlatformTemplate, renderPlatformTemplate } from "../_shared/platform-templates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailVerificationRequest {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string | null;
  password?: string | null;
  userId?: string | null;
  origin?: string;
  mode?: "signup" | "resend";
}

type AuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at?: string | null;
};

async function findUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<AuthUser | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (usersError) {
      console.error("Failed to list users:", usersError);
      throw new Error("Failed to resolve user for verification email");
    }

    const matchedUser = usersData.users.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase(),
    );
    if (matchedUser) {
      return matchedUser;
    }

    if (usersData.users.length < 1000) {
      break;
    }
  }

  return null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      email,
      firstName,
      lastName,
      phone,
      password,
      userId,
      origin,
      mode = "resend",
    }: EmailVerificationRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // firstName is required for signup; for resend, fall back to extracting from email
    const resolvedFirstName = firstName || (mode !== "signup" ? normalizedEmail.split("@")[0] : null);
    if (!resolvedFirstName) {
      return new Response(
        JSON.stringify({ error: "First name is required for signup" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const fullName = [resolvedFirstName, lastName].filter(Boolean).join(" ").trim();
    const userMetadata = {
      first_name: resolvedFirstName,
      last_name: lastName || null,
      full_name: fullName || resolvedFirstName,
      phone: phone || null,
      email_verified: false,
    };

    let resolvedUserId = userId || null;

    if (mode === "signup") {
      if (!password) {
        return new Response(
          JSON.stringify({ error: "Password is required for signup" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const existingUser = await findUserByEmail(supabase, normalizedEmail);

      if (existingUser?.email_confirmed_at) {
        return new Response(
          JSON.stringify({ error: "An account with this email already exists. Please sign in." }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      if (existingUser) {
        const { error: updateUserError } = await supabase.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: false,
          user_metadata: userMetadata,
        });
        if (updateUserError) {
          console.error("Failed to update existing unverified user:", updateUserError);
          throw new Error("Failed to prepare account for email verification");
        }
        resolvedUserId = existingUser.id;
      } else {
        const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: false,
          user_metadata: userMetadata,
        });

        if (createError) {
          console.error("Failed to create signup user:", createError);
          throw new Error(createError.message || "Failed to create account");
        }

        resolvedUserId = createdUser.user.id;
      }
    } else {
      if (!resolvedUserId) {
        const existingUser = await findUserByEmail(supabase, normalizedEmail);
        resolvedUserId = existingUser?.id ?? null;
      }

      // Compatibility fallback for legacy clients that pass password but no userId.
      if (!resolvedUserId && password) {
        const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: false,
          user_metadata: userMetadata,
        });

        if (createError) {
          console.error("Failed to create fallback auth user:", createError);
        } else {
          resolvedUserId = createdUser.user.id;
        }

        if (!resolvedUserId) {
          const existingUser = await findUserByEmail(supabase, normalizedEmail);
          resolvedUserId = existingUser?.id ?? null;
        }
      }
    }

    if (!resolvedUserId) {
      return new Response(
        JSON.stringify({ error: "Could not find user for this email" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Delete any existing tokens for this user
    await supabase
      .from("email_verification_tokens")
      .delete()
      .eq("user_id", resolvedUserId);

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token
    const { error: insertError } = await supabase.from("email_verification_tokens").insert({
      user_id: resolvedUserId,
      email: normalizedEmail,
      token,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Failed to store verification token:", insertError);
      throw new Error("Failed to generate verification link");
    }

    // Build verification link
    const resolvedOrigin =
      origin?.trim() ||
      Deno.env.get("SALON_APP_URL") ||
      Deno.env.get("BASE_URL") ||
      "http://localhost:8080";
    const verificationLink = `${resolvedOrigin.replace(/\/+$/, "")}/verify-email?token=${token}`;

    const platformTemplate = await fetchPlatformTemplate(supabase, "email_verification", "email");
    const defaultSubject = "Welcome to Salon Magik – verify your email";
    const defaultBody = `
      ${heading(`Welcome, ${resolvedFirstName}!`)}
      ${paragraph("Thanks for signing up to Salon Magik. Verify your email to secure your account and unlock your workspace.")}
      ${createButton("Verify email", verificationLink)}
      ${paragraph("This link expires in 24 hours. If you didn’t sign up, you can safely ignore this email.")}
    `;
    const templateValues = {
      first_name: resolvedFirstName,
      verification_link: verificationLink,
      verification_link_button: createButton("Verify email", verificationLink),
    };
    const subject = renderPlatformTemplate(
      platformTemplate?.is_active === false ? defaultSubject : platformTemplate?.subject || defaultSubject,
      templateValues,
    );
    const renderedBody = renderPlatformTemplate(
      platformTemplate?.is_active === false ? defaultBody : platformTemplate?.body || defaultBody,
      templateValues,
    );
    const htmlBody = wrapEmailTemplate(renderedBody, { mode: "product" });

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [email],
        subject,
        html: htmlBody,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend API error:", errorData);
      throw new Error("Failed to send email");
    }

    console.log("Verification email sent successfully");

    // Log the message (no tenant_id/customer_id for email verifications)
    await supabase.from("message_logs").insert({
      channel: "email",
      recipient: email,
      template_type: "email_verification",
      status: "sent",
      provider: "resend",
      initiated_by: "system",
      credits_used: 0,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-email-verification:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send verification email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
