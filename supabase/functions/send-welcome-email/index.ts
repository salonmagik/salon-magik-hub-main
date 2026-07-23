import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildFromAddress,
  wrapEmailTemplate,
  heading,
  paragraph,
  createButton,
  smallText,
  EMAIL_STYLES,
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * type variants:
 *  - "owner"                  → new salon owner completed onboarding
 *  - "staff_setup_for_owner"  → a staff member set up the salon and invited the actual owner
 *  - "staff"                  → staff member first login after accepting their invitation
 */
interface WelcomeEmailRequest {
  tenantId: string;
  type?: "owner" | "staff_setup_for_owner" | "staff";
  ownerName?: string;       // owner variant: the owner's display name
  salonName?: string;       // owner / staff_setup_for_owner variant
  plan?: string;            // owner variant
  trialDays?: number;       // owner variant
  invitedOwnerName?: string; // staff_setup_for_owner: name of the invited owner
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "hello@salonmagik.com";
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://app.salonmagik.com";

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured — skipping welcome email");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: WelcomeEmailRequest = await req.json();
    const type = body.type ?? "owner";

    let subject: string;
    let content: string;
    let emailMode: "product" | "salon" = "product";
    let salonName = body.salonName ?? "your salon";

    // For staff type, look up role and salon name from DB
    if (type === "staff") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id)
        .eq("tenant_id", body.tenantId)
        .maybeSingle();

      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", body.tenantId)
        .maybeSingle();

      salonName = tenant?.name ?? salonName;
      const roleLabel = roleRow?.role
        ? roleRow.role.charAt(0).toUpperCase() + roleRow.role.slice(1)
        : "Team member";

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const firstName = profile?.full_name?.split(" ")[0] || user.email.split("@")[0];

      subject = `Welcome to ${salonName}!`;
      emailMode = "salon";
      content = `
        ${heading(`Welcome to ${salonName}, ${firstName}!`)}
        ${paragraph(`You've been added as a <strong>${roleLabel}</strong> at <strong>${salonName}</strong>. Your account is active and ready to go.`)}
        <div style="background: ${EMAIL_STYLES.surfaceColor}; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 12px; font-weight: 600; color: ${EMAIL_STYLES.textColor}; font-size: 15px;">Your role: ${roleLabel}</p>
          <p style="margin: 0; color: ${EMAIL_STYLES.textMuted}; font-size: 14px;">Sign in to view your schedule, manage appointments, and stay on top of your day.</p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          ${createButton(`Sign in to ${salonName}`, `${appBaseUrl}/login`)}
        </div>
        ${paragraph(`If you have any questions, reach out to your manager directly or contact your salon.`)}
        ${smallText(`This email was sent because you were added as a team member at ${salonName}, powered by Salon Magik.`)}
      `;
    } else if (type === "staff_setup_for_owner") {
      const ownerName = body.invitedOwnerName || "your owner";
      const firstName = (body.ownerName || user.email).split(" ")[0] || "there";
      subject = `${salonName} is live — owner invite sent`;
      emailMode = "product";
      content = `
        ${heading(`You're all set, ${firstName}!`)}
        ${paragraph(`<strong>${salonName}</strong> has been set up on Salon Magik and an invitation has been sent to <strong>${ownerName}</strong> to complete their owner account.`)}
        <div style="background: ${EMAIL_STYLES.surfaceColor}; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 10px; color: ${EMAIL_STYLES.textMuted}; font-size: 14px; display: flex; gap: 8px;">
            <span style="color: #16a34a;">✓</span> Salon created and configured
          </p>
          <p style="margin: 0 0 10px; color: ${EMAIL_STYLES.textMuted}; font-size: 14px; display: flex; gap: 8px;">
            <span style="color: #16a34a;">✓</span> Owner invitation sent to ${ownerName}
          </p>
          <p style="margin: 0; color: ${EMAIL_STYLES.textMuted}; font-size: 14px; display: flex; gap: 8px;">
            <span style="color: ${EMAIL_STYLES.accentColor};">→</span> Owner will receive an email to set up their account
          </p>
        </div>
        ${paragraph(`In the meantime, you can continue setting up ${salonName} — add services, configure locations, and invite the rest of the team.`)}
        <div style="text-align: center; margin: 32px 0;">
          ${createButton("Go to Dashboard", `${appBaseUrl}/salon`)}
        </div>
        ${paragraph(`If you need any help, our support team is here — just reply to this email.`)}
        ${smallText(`You received this because you set up ${salonName} on Salon Magik as a business. © 2026 Salon Magik — A product of The Gray Avenue LTD. All rights reserved.`)}
      `;
    } else {
      // Owner welcome
      const trialDays = body.trialDays ?? 14;
      const plan = body.plan ?? "solo";
      const planLabel = plan === "chain" ? "Chain" : plan === "studio" ? "Studio" : "Solo";
      const firstName = (body.ownerName || user.email).split(" ")[0] || "there";

      const featuresByPlan: Record<string, string[]> = {
        solo: ["Appointment booking", "Customer management", "Basic payments", "Staff invitations"],
        studio: ["Everything in Solo", "Multi-staff scheduling", "SMS reminders", "Analytics & reports"],
        chain: ["Everything in Studio", "Multi-location management", "Advanced analytics", "Priority support"],
      };
      const features = featuresByPlan[plan] || featuresByPlan.solo;

      subject = `Welcome to Salon Magik — your ${trialDays}-day trial starts now`;
      emailMode = "product";
      content = `
        ${heading(`Welcome to Salon Magik, ${firstName}!`)}
        ${paragraph(`Your salon <strong>${salonName}</strong> is all set up and ready to go on the <strong>${planLabel}</strong> plan.`)}
        ${paragraph(`You have <strong>${trialDays} days free</strong> to explore everything Salon Magik has to offer — no credit card required during your trial.`)}
        <div style="background: ${EMAIL_STYLES.surfaceColor}; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 12px; font-weight: 600; color: ${EMAIL_STYLES.textColor}; font-size: 15px;">Your ${planLabel} plan includes:</p>
          ${features.map((f) => `
            <p style="margin: 0 0 8px; color: ${EMAIL_STYLES.textMuted}; font-size: 14px;">
              <span style="color: #16a34a; font-weight: bold;">✓</span> ${f}
            </p>
          `).join("")}
        </div>
        ${paragraph(`A few things to do first:`)}
        <ol style="padding-left: 20px; margin: 0 0 24px;">
          <li style="margin: 8px 0; color: ${EMAIL_STYLES.textMuted}; font-size: 15px;">Add your services and pricing</li>
          <li style="margin: 8px 0; color: ${EMAIL_STYLES.textMuted}; font-size: 15px;">Invite your team members</li>
          <li style="margin: 8px 0; color: ${EMAIL_STYLES.textMuted}; font-size: 15px;">Set up your booking page</li>
          <li style="margin: 8px 0; color: ${EMAIL_STYLES.textMuted}; font-size: 15px;">Take your first booking</li>
        </ol>
        <div style="text-align: center; margin: 32px 0;">
          ${createButton("Go to My Dashboard", `${appBaseUrl}/salon`)}
        </div>
        ${paragraph(`Need help getting started? Reply to this email — we're here for you.`)}
        ${smallText(`You're receiving this email because you use Salon Magik as a business. © 2026 Salon Magik — A product of The Gray Avenue LTD. All rights reserved.`)}
      `;
    }

    const html = wrapEmailTemplate(content, { mode: emailMode, salonName: emailMode === "salon" ? salonName : undefined });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: buildFromAddress({ fromEmail, mode: emailMode, salonName: emailMode === "salon" ? salonName : undefined }),
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Resend error:", errBody);
      return new Response(JSON.stringify({ error: "Email delivery failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    console.log(`Welcome email (${type}) sent:`, result.id);

    return new Response(JSON.stringify({ ok: true, emailId: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("send-welcome-email error:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
