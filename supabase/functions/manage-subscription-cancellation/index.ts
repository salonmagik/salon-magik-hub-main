import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendCancellationConfirmationEmail } from "../_shared/receipts.ts";
import { getSalonAppUrl } from "../_shared/salon-app-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CANCELLATION_REASONS = new Set([
  "too_expensive",
  "missing_features",
  "switching_provider",
  "closing_business",
  "temporary_pause",
  "other",
]);

interface ManageCancellationRequest {
  tenantId: string;
  action: "cancel" | "resume";
  reason?: string;
  note?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenantId, action, reason, note }: ManageCancellationRequest = await req.json();
    if (!tenantId || (action !== "cancel" && action !== "resume")) {
      return new Response(JSON.stringify({ error: "Missing or invalid tenantId/action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel" && (!reason || !CANCELLATION_REASONS.has(reason))) {
      return new Response(JSON.stringify({ error: "A valid cancellation reason is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Returns a clean 403 for the common case; the RPC's own check (below)
    // is the authoritative boundary since it's callable directly as `authenticated`.
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (userRole?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only owners can manage subscription cancellation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, logo_url")
      .eq("id", tenantId)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel") {
      const trimmedNote = (note || "").trim().slice(0, 1000);
      const { data: cancelAt, error: rpcError } = await supabase.rpc("request_subscription_cancellation", {
        p_tenant_id: tenantId,
        p_reason: reason,
        p_note: trimmedNote || null,
      });

      if (rpcError) {
        const status = rpcError.message?.includes("OWNER_ROLE_REQUIRED")
          ? 403
          : rpcError.message?.includes("SUBSCRIPTION_NOT_CANCELLABLE")
            ? 409
            : 400;
        return new Response(JSON.stringify({ error: rpcError.message }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user.email) {
        const emailResult = await sendCancellationConfirmationEmail({
          recipientEmail: user.email,
          salonName: tenant.name,
          salonLogoUrl: tenant.logo_url,
          accessEndDate: cancelAt as string,
          manageSubscriptionUrl: `${getSalonAppUrl(req)}/salon/subscription`,
        });
        if (!emailResult.sent) {
          console.error(`Failed to send cancellation confirmation email for tenant ${tenantId}:`, emailResult.error);
        }
      }

      return new Response(JSON.stringify({ cancelAt }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "resume"
    const { data: nextBillingAt, error: rpcError } = await supabase.rpc("resume_subscription", {
      p_tenant_id: tenantId,
    });

    if (rpcError) {
      const status = rpcError.message?.includes("OWNER_ROLE_REQUIRED")
        ? 403
        : rpcError.message?.includes("NOTHING_TO_RESUME")
          ? 409
          : 400;
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ resumed: true, nextBillingAt }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("manage-subscription-cancellation error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
