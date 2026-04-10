import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function splitName(fullName?: string | null) {
  const trimmed = fullName?.trim() || "";
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

type DeliveryAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  deliveryNotes?: string;
};

function isDeliveryAddress(value: unknown): value is DeliveryAddress {
  if (!value || typeof value !== "object") return false;
  const address = value as Record<string, unknown>;
  return typeof address.line1 === "string" && typeof address.city === "string" && typeof address.country === "string";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken);

    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenantId } = await req.json();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id, full_name, email, phone, notes, user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (customerError) {
      return new Response(JSON.stringify({ error: customerError.message || "Failed to fetch customer profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customer) {
      return new Response(JSON.stringify({ found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { firstName, lastName } = splitName(customer.full_name);
    let deliveryAddress: DeliveryAddress | null = null;

    const { data: recentAppointments, error: appointmentsError } = await admin
      .from("appointments")
      .select("booking_metadata, created_at")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (appointmentsError) {
      return new Response(JSON.stringify({ error: appointmentsError.message || "Failed to fetch booking history" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const appointment of recentAppointments || []) {
      const metadata = appointment.booking_metadata as Record<string, unknown> | null;
      const candidate = metadata?.delivery_address;
      if (isDeliveryAddress(candidate)) {
        deliveryAddress = {
          line1: candidate.line1 || "",
          line2: candidate.line2 || "",
          city: candidate.city || "",
          state: candidate.state || "",
          postalCode: candidate.postalCode || "",
          country: candidate.country || "",
          deliveryNotes: candidate.deliveryNotes || "",
        };
        break;
      }
    }

    return new Response(
      JSON.stringify({
        found: true,
        profile: {
          firstName,
          lastName,
          email: customer.email || user.email,
          phone: customer.phone || "",
          notes: customer.notes || "",
          deliveryAddress,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("public-booking-prefill error", error);
    return new Response(JSON.stringify({ error: "Failed to prefill booking details" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
