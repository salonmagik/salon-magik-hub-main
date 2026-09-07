import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
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

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The actual cancel/resume logic, factored out from the serve() handler
 * below so it can be driven directly by a test with an injected Supabase
 * client and a fake authenticated user — the handler's own job is just
 * CORS, bearer-token extraction, and resolving `user` before calling this.
 */
export async function handleManageSubscriptionCancellation(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  user: Pick<User, "id" | "email">,
): Promise<Response> {
  const { tenantId, action, reason, note }: ManageCancellationRequest = await req.json();
  if (!tenantId || (action !== "cancel" && action !== "resume")) {
    return jsonResponse({ error: "Missing or invalid tenantId/action" }, 400);
  }

  if (action === "cancel" && (!reason || !CANCELLATION_REASONS.has(reason))) {
    return jsonResponse({ error: "A valid cancellation reason is required" }, 400);
  }

  // Returns a clean 403 for the common case; the RPC's own check (below)
  // is the authoritative boundary since it's callable directly as `authenticated`.
  const { data: userRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .single();

  if (userRole?.role !== "owner") {
    return jsonResponse({ error: "Only owners can manage subscription cancellation" }, 403);
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, logo_url")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return jsonResponse({ error: "Tenant not found" }, 404);
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
      return jsonResponse({ error: rpcError.message }, status);
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

    return jsonResponse({ cancelAt }, 200);
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
    return jsonResponse({ error: rpcError.message }, status);
  }

  return jsonResponse({ resumed: true, nextBillingAt }, 200);
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
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Invalid or expired session" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    return await handleManageSubscriptionCancellation(req, supabase, user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("manage-subscription-cancellation error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
