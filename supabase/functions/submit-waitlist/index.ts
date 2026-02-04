import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { 
  wrapEmailTemplate, 
  heading, 
  paragraph, 
  createInfoBox,
  EMAIL_STYLES 
} from "../_shared/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeName(name: string): string {
  return name.replace(/[<>"'\n\r]/g, "").trim();
}

function buildWaitlistConfirmationEmail(firstName: string, position: number): string {
  const content = `
    ${heading("You're on the list!")}
    
    ${paragraph(`Hi ${sanitizeName(firstName)},`)}
    
    ${paragraph("Thank you for your interest in Salon Magik! You've been added to our exclusive early access waitlist.")}
    
    ${createInfoBox(`
      <p style="color: ${EMAIL_STYLES.textColor}; font-size: 18px; margin: 0 0 8px 0; font-family: ${EMAIL_STYLES.fontFamily};">
        <strong>Your position:</strong> #${position}
      </p>
      <p style="color: ${EMAIL_STYLES.textMuted}; font-size: 14px; margin: 0; font-family: ${EMAIL_STYLES.fontFamily};">
        We'll notify you when it's your turn to join.
      </p>
    `)}
    
    ${paragraph("We're building the booking software that beauty professionals deserve — simple, powerful, and designed with your business in mind.")}
    
    ${paragraph("In the meantime, feel free to reply to this email if you have any questions or feedback. We'd love to hear from you!")}
    
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

    // Validate required fields
    if (!first_name || !last_name || !email || !country) {
      return new Response(
        JSON.stringify({ error: "First name, last name, email, and country are required" }),
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

    // Check if email already exists
    const { data: existing } = await supabaseClient
      .from("waitlist_leads")
      .select("id, position, status")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      // If already on waitlist, return their position
      if (existing.status === "pending" || existing.status === "invited") {
        return new Response(
          JSON.stringify({ 
            success: true, 
            position: existing.position,
            message: "You're already on the waitlist!"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // If converted or rejected, allow re-registration
    }

    // Insert new waitlist lead
    const { data: newLead, error: insertError } = await supabaseClient
      .from("waitlist_leads")
      .insert({
        name: `${first_name.trim()} ${last_name.trim()}`,
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        country,
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
        const emailHtml = buildWaitlistConfirmationEmail(first_name.trim(), newLead.position);
        
        await resend.emails.send({
          from: `Salon Magik <${fromEmail}>`,
          to: [email.toLowerCase().trim()],
          subject: `You're #${newLead.position} on the Salon Magik waitlist!`,
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
