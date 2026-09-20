import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type RequestActor =
  | { kind: "internal"; userId: null }
  | { kind: "user"; userId: string };

type AuthOptions = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  corsHeaders: Record<string, string>;
};

type AdminClient = SupabaseClient<any, any, any>;

function jsonError(corsHeaders: Record<string, string>, message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Resolve either an internal service-role call or a real signed-in user.
 * Service-role requests are used only by trusted edge-function callers; all
 * browser requests must continue through the user-scoped client below.
 */
export async function resolveRequestActor(
  req: Request,
  options: AuthOptions,
): Promise<{ actor: RequestActor } | { response: Response }> {
  const rawHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = rawHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { response: jsonError(options.corsHeaders, "Authentication is required", 401) };
  }

  if (token === options.serviceRoleKey) {
    return { actor: { kind: "internal", userId: null } };
  }

  const userClient = createClient(options.supabaseUrl, options.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return { response: jsonError(options.corsHeaders, "Invalid or expired session", 401) };
  }

  return { actor: { kind: "user", userId: user.id } };
}

/**
 * Confirm that a browser caller is an active member of every tenant involved
 * in the operation. Internal service-role calls have already been authenticated
 * by the trusted edge-function boundary and bypass this membership lookup.
 */
export async function requireTenantMembership(
  admin: AdminClient,
  actor: RequestActor,
  tenantIds: string[],
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (actor.kind === "internal") return null;

  const uniqueTenantIds = [...new Set(tenantIds.filter(Boolean))];
  if (uniqueTenantIds.length === 0) {
    return jsonError(corsHeaders, "No tenant was provided", 400);
  }

  const { data, error } = await admin
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", actor.userId)
    .eq("is_active", true)
    .in("tenant_id", uniqueTenantIds);

  const memberships = new Set((data || []).map((row: { tenant_id: string }) => row.tenant_id));
  if (error || memberships.size !== uniqueTenantIds.length) {
    return jsonError(corsHeaders, "You are not authorized for this salon", 403);
  }

  return null;
}
