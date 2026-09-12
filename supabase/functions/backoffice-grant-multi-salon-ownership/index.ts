import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireSuperAdminWithFreshTotp } from "../_shared/backoffice-elevated-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * The actual grant-creation logic, factored out from the serve() handler
 * below so it can be driven directly by a test with an injected
 * admin/authClient (see index.test.ts), matching
 * backoffice-add-tenant-co-owner's shape.
 */
export async function handleGrantMultiSalonOwnership(
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
  // deno-lint-ignore no-explicit-any
  authClient: SupabaseClient<any>,
): Promise<Response> {
  try {
    const { userId, tenantId, reason, totpToken } = await req.json();

    // Auth/authorization runs before payload-shape validation (AD-8/AD-11 —
    // the three ownership-granting functions share this precedence).
    const auth = await requireSuperAdminWithFreshTotp(admin, authClient, totpToken, corsHeaders);
    if (!auth.ok) return auth.response!;
    const caller = auth.caller!;

    if (!userId || !totpToken) {
      return json({ error: "Missing required fields" }, 400);
    }
    const trimmedReason = String(reason || "").trim();
    if (trimmedReason.length < 10) {
      return json({ error: "Enter a business reason of at least 10 characters." }, 400);
    }
    const targetTenantId = tenantId ?? null;

    let targetTenantName: string | null = null;
    if (targetTenantId) {
      const { data: targetTenant } = await admin
        .from("tenants")
        .select("id, name")
        .eq("id", targetTenantId)
        .maybeSingle();
      if (!targetTenant) return json({ error: "Salon not found" }, 404);
      targetTenantName = targetTenant.name;
    }

    let grantResult: { grantId: string; bound: boolean; standing: unknown };
    try {
      const { data, error } = await (admin.rpc as any)("create_owner_multi_salon_grant", {
        p_user_id: userId,
        p_tenant_id: targetTenantId,
        p_approved_by: caller.id,
        p_reason: trimmedReason,
      });
      if (error) throw error;
      grantResult = data;
    } catch (grantError: any) {
      console.error("[backoffice-grant-multi-salon-ownership] create_owner_multi_salon_grant error:", grantError);
      const message: string = grantError?.message || "";

      if (message === "MULTI_SALON_NOT_AN_OWNER") {
        return json({ error: "This person does not own a salon yet." }, 409);
      }
      if (message === "MULTI_SALON_GRANT_ALREADY_OPEN") {
        return json({ error: "This owner already has an open authorisation." }, 409);
      }
      if (message === "MULTI_SALON_TARGET_IN_TRIAL") {
        return json({
          error: `${targetTenantName || "This salon"} is still in a trial. An additional salon must be billed from the start.`,
        }, 409);
      }
      if (message === "MULTI_SALON_ALREADY_OWNER_HERE") {
        return json({ error: "This person already owns this salon." }, 409);
      }
      if (message.startsWith("MULTI_SALON_STANDING_FAILED:")) {
        const failingTenantId = message.slice("MULTI_SALON_STANDING_FAILED:".length);
        const { data: failingTenant } = await admin
          .from("tenants")
          .select("name, subscription_status")
          .eq("id", failingTenantId)
          .maybeSingle();
        const name = failingTenant?.name || "One of this owner's salons";
        const status = failingTenant?.subscription_status || "not active";
        return json({
          error: `${name} is ${status}. Every salon this owner already holds must be on an active paid subscription before an additional salon can be granted.`,
        }, 409);
      }
      if (message === "MULTI_SALON_TARGET_NOT_FOUND") {
        return json({ error: "Salon not found" }, 404);
      }
      if (message === "MULTI_SALON_REASON_TOO_SHORT") {
        return json({ error: "Enter a business reason of at least 10 characters." }, 400);
      }
      return json({ error: "Failed to grant additional-salon ownership. Please try again." }, 500);
    }

    await admin.from("audit_logs").insert({
      tenant_id: targetTenantId,
      actor_user_id: caller.id,
      action: "backoffice.multi_salon_ownership_granted",
      entity_type: "user",
      entity_id: userId,
      metadata: {
        target_user_id: userId,
        target_tenant_id: targetTenantId,
        grant_id: grantResult.grantId,
        bound: grantResult.bound,
        reason: trimmedReason,
      },
    });

    return json({
      success: true,
      grantId: grantResult.grantId,
      bound: grantResult.bound,
      standing: grantResult.standing,
    });
  } catch (error: unknown) {
    console.error("backoffice-grant-multi-salon-ownership error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  return await handleGrantMultiSalonOwnership(req, admin, authClient);
});
