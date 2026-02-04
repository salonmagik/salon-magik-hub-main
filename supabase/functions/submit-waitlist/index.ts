import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { name, email, phone, country, plan_interest, team_size, notes } = body;

    // Validate required fields
    if (!name || !email || !country) {
      return new Response(
        JSON.stringify({ error: "Name, email, and country are required" }),
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
        name: name.trim(),
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
