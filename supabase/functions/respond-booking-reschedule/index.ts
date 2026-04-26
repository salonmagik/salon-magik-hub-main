import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ResponseAction = "accept" | "decline";

interface RequestBody {
  appointmentId: string;
  response: ResponseAction;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    if (!body.appointmentId || !body.response) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select("id, tenant_id, customer_id, proposed_start, proposed_end, approval_status, booking_reference")
      .eq("id", body.appointmentId)
      .single();

    if (appointmentError || !appointment) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: customer } = await admin
      .from("customers")
      .select("id, user_id")
      .eq("id", appointment.customer_id)
      .maybeSingle();

    if (!customer || customer.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.response === "accept") {
      if (!appointment.proposed_start || !appointment.proposed_end) {
        return new Response(JSON.stringify({ error: "No proposed reschedule found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await admin
        .from("appointments")
        .update({
          scheduled_start: appointment.proposed_start,
          scheduled_end: appointment.proposed_end,
          proposed_start: null,
          proposed_end: null,
          approval_status: "reschedule_accepted",
          customer_response_status: "accepted",
          confirmation_status: "confirmed",
        } as any)
        .eq("id", appointment.id);

      if (updateError) throw updateError;

      await admin.from("notifications").insert({
        tenant_id: appointment.tenant_id,
        type: "appointment",
        title: "Reschedule accepted",
        description: "The customer accepted the proposed reschedule.",
        urgent: true,
        entity_type: "appointment",
        entity_id: appointment.id,
      } as any);
    } else {
      const { error: updateError } = await admin
        .from("appointments")
        .update({
          approval_status: "pending",
          customer_response_status: "declined",
          confirmation_status: "pending",
          proposed_start: null,
          proposed_end: null,
          proposed_message: null,
        } as any)
        .eq("id", appointment.id);

      if (updateError) throw updateError;

      await admin.from("notifications").insert({
        tenant_id: appointment.tenant_id,
        type: "appointment",
        title: "Reschedule declined",
        description: "The customer declined the proposed reschedule and the booking needs review again.",
        urgent: true,
        entity_type: "appointment",
        entity_id: appointment.id,
      } as any);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("respond-booking-reschedule error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
