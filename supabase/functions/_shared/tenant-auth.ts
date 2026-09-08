// Shared caller-role resolution for edge functions that gate an action on
// tenant membership. Replaces the `.from("user_roles")...single()` pattern
// that broke as soon as a caller held two active role rows for the same
// tenant (see the co-owner-role design's F-2) — `.single()` errors on more
// than one match, so a legitimate co-owner-and-manager row silently turned
// into a 403.

interface SupabaseLike {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
}

interface TenantRoleRow {
  role: string;
  is_active: boolean | null;
}

/** Active (`is_active` true or null) roles a user holds on a tenant. */
export async function resolveTenantRoles(
  client: SupabaseLike,
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("user_roles")
    .select("role, is_active")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);

  if (error || !data) return [];

  return (data as TenantRoleRow[])
    .filter((row) => row.is_active ?? true)
    .map((row) => row.role);
}

export interface RequireTenantRoleResult {
  ok: boolean;
  role?: string;
  /** Set only when `ok` is false; the caller's ready-to-return 403 Response. */
  response?: Response;
}

/**
 * Resolves the caller's active roles on a tenant and checks membership in
 * `allowed`. On failure returns a ready `Response` built from
 * `unauthorizedBody`/`corsHeaders` so each call site can keep its own exact
 * 403 wording without duplicating the Response construction.
 */
export async function requireTenantRole(
  client: SupabaseLike,
  userId: string,
  tenantId: string,
  allowed: string[],
  unauthorizedBody: Record<string, unknown>,
  corsHeaders: Record<string, string>,
): Promise<RequireTenantRoleResult> {
  const roles = await resolveTenantRoles(client, userId, tenantId);
  const matched = roles.find((role) => allowed.includes(role));

  if (!matched) {
    return {
      ok: false,
      response: new Response(JSON.stringify(unauthorizedBody), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, role: matched };
}
