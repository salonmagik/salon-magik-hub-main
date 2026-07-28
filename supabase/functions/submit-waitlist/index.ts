import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { 
  wrapEmailTemplate, 
  heading, 
  paragraph, 
  createInfoBox,
  EMAIL_STYLES,
  sanitizeEmailDisplayName,
  buildFromAddress,
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sanitizeName(name: string): string {
  return sanitizeEmailDisplayName(name);
}

function buildWaitlistConfirmationEmail(firstName: string): string {
  const content = `
    ${heading("You're in!")}
    
    ${paragraph(`Hi ${sanitizeName(firstName)},`)}
    
    ${paragraph("Thanks for requesting early access to Salon Magik! You're officially in.")}
    
    ${paragraph("We're building a platform that helps salon, spa, and barbershop owners like you manage everything in one place — schedules, customers, staff, payments, and more. No more juggling multiple tools or dealing with the daily chaos.")}
    
    ${paragraph("We'll reach out soon with next steps to get you set up.")}
    
    ${paragraph(`Have questions or want to share what you're looking for in a salon management platform? Reach out to us at <a href="mailto:support@salonmagik.com" style="color: ${EMAIL_STYLES.primaryColor}; text-decoration: none;">support@salonmagik.com</a> — we'd love to hear from you.`)}
    
    <p style="color: ${EMAIL_STYLES.textMuted}; font-size: 16px; line-height: 1.6; margin: 24px 0 0 0; font-family: ${EMAIL_STYLES.fontFamily};">
      Best,<br/>
      <strong>The Salon Magik Team</strong>
    </p>
  `;
  
  return wrapEmailTemplate(content);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { first_name, last_name, email, phone, country, plan_interest, team_size, notes } = body;
    const normalizedCountry = String(country || "").trim().toUpperCase();
    const liveCountries = new Set(["GH", "NG"]);

    // Validate required fields
    if (!first_name || !last_name || !email || !country) {
      return new Response(
        JSON.stringify({ error: "First name, last name, email, and country are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!liveCountries.has(normalizedCountry)) {
      return new Response(
        JSON.stringify({ error: "We are currently live only in Ghana and Nigeria." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reject reuse of an email/phone that already belongs to an active salon
    // account, or that already has a pending/invited access request.
    const { data: conflict, error: conflictError } = await supabaseClient.rpc(
      "check_identity_availability",
      { p_email: email, p_phone: phone ?? null },
    );
    if (conflictError) {
      console.error("Identity availability check failed:", conflictError);
    } else if (conflict === "tenant_email") {
      return new Response(
        JSON.stringify({ error: "A salon already exists with this email. Try signing in instead." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (conflict === "tenant_phone") {
      return new Response(
        JSON.stringify({ error: "A salon already exists with this phone number. Try signing in instead." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (conflict === "waitlist_pending" || conflict === "waitlist_invited") {
      return new Response(
        JSON.stringify({ error: "You've already requested exclusive access. Hang tight — we'll reach out with your invitation soon." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert new waitlist lead
    const { data: newLead, error: insertError } = await supabaseClient
      .from("waitlist_leads")
      .insert({
        name: `${first_name.trim()} ${last_name.trim()}`,
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        country: normalizedCountry,
        plan_interest: plan_interest || null,
        team_size: team_size || null,
        notes: notes?.trim() || null,
        status: "pending",
      })
      .select("position")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      
      // Handle unique constraint violation
      if (insertError.code === "23505") {
        return new Response(
          JSON.stringify({ error: "This email is already on the waitlist" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw insertError;
    }

    console.log(`Waitlist lead added: ${email}, position: ${newLead.position}`);

    // Send confirmation email
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    
    if (resendApiKey && fromEmail) {
      try {
        const resend = new Resend(resendApiKey);
        const emailHtml = buildWaitlistConfirmationEmail(first_name.trim());
        
        await resend.emails.send({
          from: buildFromAddress({ mode: "product", fromEmail }),
          to: [email.toLowerCase().trim()],
          subject: "You're in! Welcome to Salon Magik early access",
          html: emailHtml,
        });
        
        console.log(`Waitlist confirmation email sent to: ${email}`);
      } catch (emailError) {
        // Log email error but don't fail the request
        console.error("Failed to send confirmation email:", emailError);
      }
    } else {
      console.warn("Email not sent: RESEND_API_KEY or RESEND_FROM_EMAIL not configured");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        position: newLead.position,
        message: "You've been added to the waitlist!"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Waitlist submission error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
