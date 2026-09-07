import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, getPaystackSubscription, disablePaystackSubscription } from "../_shared/paystack-helpers.ts";

// One-shot, dry-runnable, idempotent migration of existing Chain-annual
// tenants off Paystack's native Subscription object and onto the same
// self-managed saved-card cron every other plan/cycle uses (AD-9).
//
// Sequencing is a hard prerequisite, not a nice-to-have: Chain-annual
// tenants are *already* in the daily due-tenants query today, already
// charged for add-ons only (compute_tenant_recurring_total excludes their
// base price while the Chain-annual carve-out exists). The moment the
// carve-out is removed (migration
// 20260906180700_recurring_total_chain_annual.sql), compute_tenant_recurring_total
// starts including the base price too — and unless each tenant's Paystack
// Subscription has already been disabled, that tenant is charged the base
// price twice on their next cron cycle. This function must be run for
// every live Chain-annual tenant, for real, BEFORE that migration is
// applied to any environment with such tenants.
//
// Order per tenant is disable-then-realign: if disabling the Paystack
// Subscription fails, the tenant's row is left untouched and they keep
// billing natively — the safe direction. If realigning the row fails after
// a successful disable, an audit row is written immediately after the
// disable so a re-run can detect the half-migrated tenant (no active
// Paystack subscription found, but next_billing_at not yet aligned) and
// complete it rather than leaving the tenant with no billing mechanism at
// all.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MigrationReportRow {
  tenantId: string;
  tenantName: string;
  currency: string;
  paystackSubscriptionCode: string | null;
  paystackNextPaymentDate: string | null;
  currentNextBillingAt: string | null;
  hasReusableAuthorization: boolean;
  action:
    | "would_disable_and_realign"
    | "disabled_and_realigned"
    | "skip_already_migrated"
    | "blocked_no_annual_pricing"
    | "blocked_no_authorization"
    | "error";
  error?: string;
  pastDueRealignment?: boolean;
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

/**
 * The actual migration logic, factored out from the serve() handler below
 * so it can be driven directly by a test with an injected Supabase client,
 * a fake authenticated (super-admin) caller, and a stubbed global fetch
 * (Paystack list/get/disable calls are not injected) — the handler's own
 * job is just CORS, bearer-token extraction, and the super-admin check
 * before calling this.
 */
export async function handleMigrateChainAnnualBilling(
  req: Request,
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any, any, any>,
  caller: Pick<User, "id">,
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // defaults to true; must be explicitly false to mutate
  const tenantIds: string[] | null = Array.isArray(body.tenantIds) ? body.tenantIds : null;

  let query = admin
    .from("tenants")
    .select("id, name, currency, billing_cycle, plan, subscription_status, next_billing_at, paystack_customer_code, paystack_authorization_code")
    .eq("plan", "chain")
    .eq("billing_cycle", "annual");

  if (tenantIds && tenantIds.length > 0) {
    query = query.in("id", tenantIds);
  }

  const { data: tenants, error: tenantsError } = await query;
  if (tenantsError) return json({ error: tenantsError.message }, 500);

  const report: MigrationReportRow[] = [];

  for (const tenant of tenants || []) {
    const currency = (tenant.currency || "NGN").toUpperCase();
    const hasReusableAuthorization = Boolean(tenant.paystack_authorization_code);

    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: null,
        paystackNextPaymentDate: null,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "error",
        error: keyError || "Paystack not configured for this currency",
      });
      continue;
    }

    if (!tenant.paystack_customer_code) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: null,
        paystackNextPaymentDate: null,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: hasReusableAuthorization ? "skip_already_migrated" : "blocked_no_authorization",
      });
      continue;
    }

    const listRes = await fetch(
      `https://api.paystack.co/subscription?customer=${encodeURIComponent(tenant.paystack_customer_code)}`,
      { headers: { Authorization: `Bearer ${paystackKey}` } },
    );
    const listData = await listRes.json();
    const activeSubs: Array<{ subscription_code: string; status: string }> = listRes.ok && listData.status
      ? (listData.data || []).filter((sub: { status: string }) => sub.status === "active")
      : [];

    if (activeSubs.length === 0) {
      // No active native subscription — either never had one, or already
      // migrated by a previous run of this function.
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: null,
        paystackNextPaymentDate: null,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "skip_already_migrated",
      });
      continue;
    }

    const subscriptionCode = activeSubs[0].subscription_code;
    const { subscription, error: subError } = await getPaystackSubscription(paystackKey, subscriptionCode);
    if (subError || !subscription) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: subscriptionCode,
        paystackNextPaymentDate: null,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "error",
        error: subError || "Could not fetch subscription detail",
      });
      continue;
    }

    if (!hasReusableAuthorization) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: subscriptionCode,
        paystackNextPaymentDate: subscription.next_payment_date,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "blocked_no_authorization",
      });
      continue;
    }

    // Confirm annual Chain pricing is actually configured before touching
    // anything — this migration is what unblocks the base-price-inclusion
    // migration, not the other way around, but it should never disable a
    // tenant's only working billing mechanism if the replacement can't
    // yet price them.
    const { data: planRow } = await admin.from("plans").select("id").eq("slug", "chain").maybeSingle();
    const { data: chainQuote } = planRow?.id
      ? await admin.rpc("compute_chain_price", {
          p_plan_id: planRow.id,
          p_currency: currency,
          p_total_locations: 1,
          p_billing_cycle: "annual",
        })
      : { data: null };
    const annualPriced = chainQuote?.[0]?.total_price !== null && chainQuote?.[0]?.total_price !== undefined;

    if (!annualPriced) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: subscriptionCode,
        paystackNextPaymentDate: subscription.next_payment_date,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "blocked_no_annual_pricing",
      });
      continue;
    }

    const nextPaymentDate = subscription.next_payment_date;
    const pastDueRealignment = Boolean(nextPaymentDate && new Date(nextPaymentDate).getTime() <= Date.now());

    if (dryRun) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: subscriptionCode,
        paystackNextPaymentDate: nextPaymentDate,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "would_disable_and_realign",
        pastDueRealignment,
      });
      continue;
    }

    const disableResult = await disablePaystackSubscription(paystackKey, {
      subscriptionCode,
      emailToken: subscription.email_token,
    });

    if (!disableResult.success) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: subscriptionCode,
        paystackNextPaymentDate: nextPaymentDate,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "error",
        error: disableResult.error || "Failed to disable Paystack subscription",
      });
      continue;
    }

    // Audit the disable immediately — this is the half-state marker a
    // re-run relies on if the realign write below fails.
    await admin.from("audit_logs").insert({
      tenant_id: tenant.id,
      actor_user_id: caller.id,
      action: "chain_annual_paystack_subscription_disabled",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { subscription_code: subscriptionCode, next_payment_date: nextPaymentDate },
    });

    const realignedNextBillingAt = nextPaymentDate || new Date().toISOString();
    const { error: updateError } = await admin
      .from("tenants")
      .update({ next_billing_at: realignedNextBillingAt, billing_retry_count: 0 })
      .eq("id", tenant.id);

    if (updateError) {
      report.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        currency,
        paystackSubscriptionCode: subscriptionCode,
        paystackNextPaymentDate: nextPaymentDate,
        currentNextBillingAt: tenant.next_billing_at,
        hasReusableAuthorization,
        action: "error",
        error: `Disabled Paystack subscription but failed to realign billing: ${updateError.message}`,
      });
      continue;
    }

    await admin.from("audit_logs").insert({
      tenant_id: tenant.id,
      actor_user_id: caller.id,
      action: "chain_annual_migrated_to_self_managed_billing",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { subscription_code: subscriptionCode, next_billing_at: realignedNextBillingAt, past_due_realignment: pastDueRealignment },
    });

    report.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      currency,
      paystackSubscriptionCode: subscriptionCode,
      paystackNextPaymentDate: nextPaymentDate,
      currentNextBillingAt: realignedNextBillingAt,
      hasReusableAuthorization,
      action: "disabled_and_realigned",
      pastDueRealignment,
    });
  }

  return json({ dryRun, tenants: report });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: isSuperAdmin } = await admin.rpc("has_backoffice_role", {
      _user_id: caller.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) return json({ error: "Super admin access required" }, 403);

    return await handleMigrateChainAnnualBilling(req, admin, caller);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
