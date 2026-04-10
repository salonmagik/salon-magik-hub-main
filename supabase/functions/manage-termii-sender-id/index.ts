import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");
const TERMII_API_BASE = Deno.env.get("TERMII_API_BASE");

// Default sample message for all Termii sender ID requests
// const DEFAULT_SAMPLE_MESSAGE = "Your appointment is confirmed. We look forward to seeing you!";
const DEFAULT_SAMPLE_MESSAGE = "Hi Ambrose, your appointment at Salon Magik Beauty Spot is confirmed for 9th April at 11:45AM. See you soon!"

// Country code to country name mapping for Termii
const COUNTRY_MAPPING: Record<string, string> = {
  "NG": "Nigeria",
  "NGN": "Nigeria",
  "GH": "Ghana",
  "GHS": "Ghana",
};

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TermiiSenderIdResponse {
  content: Array<{
    sender_id: string;
    status: "active" | "pending" | "blocked";
    country: string;
    company?: string;
    usecase?: string;
    createdAt: string;
  }>;
  pageable: {
    pageNumber: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
  totalElements: number;
}

interface RequestSenderIdBody {
  senderId: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get tenant_id for this user
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: "User not associated with any tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = userRole.tenant_id;

    // Parse URL to determine action
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1]; // Last part of path

    // ========================================================================
    // POST /request - Submit new sender ID to Termii
    // ========================================================================
    if (req.method === "POST" && action === "request") {
      if (!TERMII_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Termii API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json() as RequestSenderIdBody;
      const { senderId } = body;

      // Validate input
      if (!senderId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: senderId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate sender ID format (3-11 alphanumeric characters)
      if (senderId.length < 3 || senderId.length > 11 || !/^[a-zA-Z0-9]+$/.test(senderId)) {
        return new Response(
          JSON.stringify({
            error: "Invalid sender ID format. Must be alphanumeric and between 3-11 characters"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch tenant details (legal_name, currency for country mapping)
      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("termii_sender_id_status, termii_sender_id, legal_name, name, currency")
        .eq("id", tenantId)
        .single();

      if (tenantError) {
        console.error("Error fetching tenant:", tenantError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch tenant information" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prevent resubmission if already pending or approved
      if (tenant.termii_sender_id_status === "pending") {
        return new Response(
          JSON.stringify({
            error: "A sender ID request is already pending approval",
            currentSenderId: tenant.termii_sender_id,
            status: "pending"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (tenant.termii_sender_id_status === "approved") {
        return new Response(
          JSON.stringify({
            error: "Sender ID is already approved and cannot be changed. Contact admin to modify.",
            currentSenderId: tenant.termii_sender_id,
            status: "approved"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get company name (legal_name or fallback to name)
      const companyName = tenant.legal_name || tenant.name;

      // Map currency to country
      const currencyCode = tenant.currency || "NG"; // Default to Nigeria
      const country = COUNTRY_MAPPING[currencyCode] || COUNTRY_MAPPING["NG"];

      // Submit to Termii API
      try {
        const termiiResponse = await fetch(`${TERMII_API_BASE}/api/sender-id/request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: TERMII_API_KEY,
            sender_id: senderId,
            use_case: DEFAULT_SAMPLE_MESSAGE,
            company: companyName,
            country: country,
          }),
        });

        const termiiData = await termiiResponse.json();

        // Check if request was successful
        if (!termiiResponse.ok) {
          console.error("Termii API error:", termiiData);
          return new Response(
            JSON.stringify({
              error: termiiData.message || "Failed to submit sender ID to Termii",
              details: termiiData
            }),
            { status: termiiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update tenant record with pending status
        const { error: updateError } = await supabaseAdmin
          .from("tenants")
          .update({
            termii_sender_id: senderId,
            termii_sender_id_status: "pending",
            termii_sender_id_requested_at: new Date().toISOString(),
            termii_sender_id_company: companyName,
            termii_sender_id_use_case: DEFAULT_SAMPLE_MESSAGE,
          })
          .eq("id", tenantId);

        if (updateError) {
          console.error("Error updating tenant:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update tenant record" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: termiiData.message || "Sender ID submitted successfully. Awaiting approval.",
            senderId: senderId,
            status: "pending",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (error) {
        console.error("Error calling Termii API:", error);
        return new Response(
          JSON.stringify({ error: "Failed to communicate with Termii API" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ========================================================================
    // GET /status - Check sender ID status from Termii
    // ========================================================================
    if (req.method === "GET" && action === "status") {
      if (!TERMII_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Termii API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get tenant's current sender ID
      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select("termii_sender_id, termii_sender_id_status")
        .eq("id", tenantId)
        .single();

      if (tenantError || !tenant.termii_sender_id) {
        return new Response(
          JSON.stringify({
            error: "No sender ID configured for this tenant",
            status: "not_set"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch from Termii API
      try {
        const termiiResponse = await fetch(
          `${TERMII_API_BASE}/api/sender-id?api_key=${TERMII_API_KEY}`,
          { method: "GET" }
        );

        if (!termiiResponse.ok) {
          const errorData = await termiiResponse.json();
          console.error("Termii API error:", errorData);
          return new Response(
            JSON.stringify({ error: "Failed to fetch sender ID status from Termii" }),
            { status: termiiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const termiiData = await termiiResponse.json() as TermiiSenderIdResponse;

        // Find this tenant's sender ID in the response
        const senderIdInfo = termiiData.content.find(
          (item) => item.sender_id === tenant.termii_sender_id
        );

        if (!senderIdInfo) {
          // Sender ID not found in Termii - might still be processing or not yet submitted
          return new Response(
            JSON.stringify({
              senderId: tenant.termii_sender_id,
              status: tenant.termii_sender_id_status,
              message: "Sender ID not found in Termii records. It may still be processing.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Map Termii status to our status
        let dbStatus: string = tenant.termii_sender_id_status;
        if (senderIdInfo.status === "active") {
          dbStatus = "approved";
        } else if (senderIdInfo.status === "pending") {
          dbStatus = "pending";
        } else if (senderIdInfo.status === "blocked") {
          dbStatus = "rejected";
        }

        // Update database if status changed
        if (dbStatus !== tenant.termii_sender_id_status) {
          const updateData: any = {
            termii_sender_id_status: dbStatus,
          };

          // Set approved_at timestamp if newly approved
          if (dbStatus === "approved" && tenant.termii_sender_id_status !== "approved") {
            updateData.termii_sender_id_approved_at = new Date().toISOString();
          }

          await supabaseAdmin
            .from("tenants")
            .update(updateData)
            .eq("id", tenantId);
        }

        return new Response(
          JSON.stringify({
            senderId: tenant.termii_sender_id,
            status: dbStatus,
            termiiStatus: senderIdInfo.status,
            country: senderIdInfo.country,
            createdAt: senderIdInfo.createdAt,
            message: dbStatus === "approved"
              ? "Sender ID is approved and active"
              : dbStatus === "pending"
                ? "Sender ID is pending approval"
                : "Sender ID was rejected",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (error) {
        console.error("Error calling Termii API:", error);
        return new Response(
          JSON.stringify({ error: "Failed to communicate with Termii API" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ========================================================================
    // GET /list - List all sender IDs from Termii
    // ========================================================================
    if (req.method === "GET" && action === "list") {
      if (!TERMII_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Termii API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const termiiResponse = await fetch(
          `${TERMII_API_BASE}/api/sender-id?api_key=${TERMII_API_KEY}`,
          { method: "GET" }
        );

        if (!termiiResponse.ok) {
          const errorData = await termiiResponse.json();
          console.error("Termii API error:", errorData);
          return new Response(
            JSON.stringify({ error: "Failed to fetch sender IDs from Termii" }),
            { status: termiiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const termiiData = await termiiResponse.json() as TermiiSenderIdResponse;

        return new Response(
          JSON.stringify({
            senderIds: termiiData.content,
            totalElements: termiiData.totalElements,
            totalPages: termiiData.totalPages,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (error) {
        console.error("Error calling Termii API:", error);
        return new Response(
          JSON.stringify({ error: "Failed to communicate with Termii API" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If we reach here, unsupported method/action
    return new Response(
      JSON.stringify({ error: "Unsupported endpoint or method" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
