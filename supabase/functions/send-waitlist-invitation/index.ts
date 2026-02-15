import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  wrapEmailTemplate,
  heading,
  paragraph,
  createButton,
  smallText,
  getSenderName,
} from "../_shared/email-template.ts";
 
 const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type",
 };
 
function buildInvitationEmail(name: string, invitationLink: string): string {
  const content = `
    ${heading("You're invited! 🎉")}
    ${paragraph(`Hi ${name},`)}
    ${paragraph("Great news! Your application to join Salon Magik has been approved. You can now create your account and start setting up your salon.")}
    ${createButton("Complete your signup", invitationLink)}
    ${smallText("This invitation link expires in 7 days. If you didn't request access, you can ignore this email.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}
 
 const handler = async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const authHeader = req.headers.get("Authorization");
     if (!authHeader?.startsWith("Bearer ")) {
       return new Response(
         JSON.stringify({ error: "Unauthorized" }),
         { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";
 
     // Use service role to read waitlist data
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
 
     // Verify the caller is a backoffice user
     const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
       global: { headers: { Authorization: authHeader } },
     });
 
     const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
     if (userError || !user) {
       return new Response(
         JSON.stringify({ error: "Unauthorized" }),
         { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     // Check if user is a backoffice user
     const { data: boUser, error: boError } = await supabase
       .from("backoffice_users")
       .select("id, totp_enabled")
       .eq("user_id", user.id)
       .eq("totp_enabled", true)
       .single();
 
     if (boError || !boUser) {
       return new Response(
         JSON.stringify({ error: "BackOffice access required" }),
         { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     const { leadId } = await req.json();
 
     if (!leadId) {
       return new Response(
         JSON.stringify({ error: "Lead ID required" }),
         { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     // Get the lead details
     const { data: lead, error: leadError } = await supabase
       .from("waitlist_leads")
       .select("*")
       .eq("id", leadId)
       .single();
 
     if (leadError || !lead) {
       return new Response(
         JSON.stringify({ error: "Lead not found" }),
         { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     if (lead.status !== "invited" || !lead.invitation_token) {
       return new Response(
         JSON.stringify({ error: "Lead has not been approved or already processed" }),
         { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
       );
     }
 
     // Build invitation link
     const baseUrl =
       req.headers.get("origin") ||
       Deno.env.get("SALON_APP_URL") ||
       Deno.env.get("BASE_URL") ||
       "https://app.salonmagik.com";
     const invitationLink = `${baseUrl.replace(/\/+$/, "")}/signup?invite=${lead.invitation_token}`;
 
     const firstName = lead.name.split(" ")[0];
 
     // Send email via Resend
     const emailResponse = await fetch("https://api.resend.com/emails", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         Authorization: `Bearer ${RESEND_API_KEY}`,
       },
       body: JSON.stringify({
         from: `${getSenderName({ mode: "product" })} <${fromEmail}>`,
         to: [lead.email],
         subject: "🎉 You're invited to Salon Magik!",
         html: buildInvitationEmail(firstName, invitationLink),
       }),
     });
 
     const emailResult = await emailResponse.json();
     console.log("Waitlist invitation email sent:", emailResult);
 
     return new Response(
       JSON.stringify({ success: true, message: `Invitation sent to ${lead.email}` }),
       { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
     );
   } catch (error: any) {
     console.error("Error sending waitlist invitation:", error);
     return new Response(
       JSON.stringify({ error: error.message }),
       { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
     );
   }
 };
 
 serve(handler);
