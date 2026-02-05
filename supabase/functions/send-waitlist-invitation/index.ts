 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type",
 };
 
 // Design system
 const STYLES = {
   primaryColor: "#2563EB",
   textColor: "#1f2937",
   textMuted: "#4b5563",
   textLight: "#6b7280",
   textLighter: "#9ca3af",
   surfaceColor: "#f5f7fa",
   borderColor: "#e5e7eb",
   fontFamily: "'Questrial', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
 };
 
 function buildInvitationEmail(
   name: string,
   invitationLink: string
 ): string {
   return `
 <!DOCTYPE html>
 <html lang="en">
 <head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <style>
     @import url('https://fonts.googleapis.com/css2?family=Questrial&display=swap');
   </style>
 </head>
 <body style="margin: 0; padding: 0; background-color: ${STYLES.surfaceColor}; font-family: ${STYLES.fontFamily};">
   <table role="presentation" style="width: 100%; border-collapse: collapse;">
     <tr>
       <td align="center" style="padding: 40px 20px;">
         <div style="max-width: 600px; margin: 0 auto; padding: 40px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
           <div style="text-align: center; margin-bottom: 32px;">
             <h1 style="color: ${STYLES.primaryColor}; font-style: italic; margin: 0; font-size: 32px; font-family: ${STYLES.fontFamily};">Salon Magik</h1>
           </div>
           
           <h2 style="color: ${STYLES.textColor}; margin-bottom: 16px; font-size: 24px; text-align: center; font-family: ${STYLES.fontFamily};">
             You're Invited! 🎉
           </h2>
           
           <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
             Hi ${name},
           </p>
           
           <p style="color: ${STYLES.textMuted}; font-size: 16px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
             Great news! Your application to join Salon Magik has been approved. You can now create your account and start setting up your salon.
           </p>
           
           <div style="text-align: center; margin: 32px 0;">
             <a href="${invitationLink}" 
                style="background-color: ${STYLES.primaryColor}; color: white; padding: 14px 28px; 
                       text-decoration: none; border-radius: 8px; display: inline-block;
                       font-weight: 500; font-size: 16px; font-family: ${STYLES.fontFamily};">
               Complete Your Signup
             </a>
           </div>
           
           <p style="color: ${STYLES.textLight}; font-size: 14px; line-height: 1.6; font-family: ${STYLES.fontFamily};">
             This invitation link expires in <strong>7 days</strong>. If you didn't request access to Salon Magik, you can safely ignore this email.
           </p>
           
           <hr style="border: none; border-top: 1px solid ${STYLES.borderColor}; margin: 32px 0;" />
           
           <p style="color: ${STYLES.textLighter}; font-size: 12px; text-align: center; font-family: ${STYLES.fontFamily};">
             © 2026 Salon Magik. All rights reserved.
           </p>
         </div>
       </td>
     </tr>
   </table>
 </body>
 </html>`;
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
     const baseUrl = req.headers.get("origin") || "https://salonmagik.app";
     const invitationLink = `${baseUrl}/signup?invite=${lead.invitation_token}`;
 
     const firstName = lead.name.split(" ")[0];
 
     // Send email via Resend
     const emailResponse = await fetch("https://api.resend.com/emails", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         Authorization: `Bearer ${RESEND_API_KEY}`,
       },
       body: JSON.stringify({
         from: `Salon Magik <${fromEmail}>`,
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