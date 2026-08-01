import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency } from "../_shared/paystack-helpers.ts";

// One-tenant-at-a-time, backoffice-triggered migration off Paystack's native
// Subscription engine and onto the self-managed billing cron. Deliberately
// NOT automatic/bulk and NOT run on a schedule: the whole reason this exists
// is that tier upgrades silently kept billing the OLD price forever because
// nothing ever touched a tenant's live Paystack Subscription — running this
// blind, in bulk, is exactly the kind of thing that could cause a double
// charge if timed wrong. A super admin reviews and triggers each migration.
//
// What it does:
//   1. Finds the tenant's live Paystack subscription(s) via their customer
//      code and disables each one (Paystack requires the subscription's own
//      email_token, fetched per-subscription, to disable it).
//   2. Sets next_billing_at so process-recurring-addon-billing picks the
//      tenant up going forward — compute_tenant_recurring_total already
//      knows to include the base plan price for monthly tenants and exclude
//      it for annual ones (their annual Subscription was just disabled here,
//      so from this point on annual tenants have no billing mechanism for
//      their base price at all until their current paid year runs out --
//      that's a real gap this migration does not solve, flagged in the
//      response so the operator can decide how to handle it manually).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: boUser, error: boError } = await admin
      .from("backoffice_users")
      .select("id, role, is_active")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (boError || !boUser || boUser.role !== "super_admin" || boUser.is_active === false) {
      return json({ error: "Super admin access required" }, 403);
    }

    const { tenantId, dryRun } = await req.json();
    if (!tenantId) return json({ error: "Missing tenantId" }, 400);

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, currency, billing_cycle, subscription_status, paystack_customer_code, paystack_authorization_code, next_billing_at")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant) return json({ error: "Tenant not found" }, 404);

    if (!tenant.paystack_authorization_code) {
      return json({ error: "Tenant has no stored card authorization — nothing to migrate." }, 400);
    }
    if (tenant.next_billing_at) {
      return json({ error: "Tenant already has next_billing_at set — already on self-managed billing." }, 400);
    }
    if (tenant.subscription_status !== "active") {
      return json({ error: `Tenant subscription_status is '${tenant.subscription_status}', expected 'active'.` }, 400);
    }
    if (!tenant.paystack_customer_code) {
      return json({
        error: "Tenant has no paystack_customer_code on file — can't look up their Paystack subscription. " +
          "This tenant may predate customer-code capture; check Paystack's dashboard directly by email before proceeding manually.",
      }, 400);
    }

    const currency = (tenant.currency || "NGN").toUpperCase();
    const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
    if (!paystackKey) return json({ error: keyError || "Paystack not configured" }, 400);

    const listRes = await fetch(
      `https://api.paystack.co/subscription?customer=${encodeURIComponent(tenant.paystack_customer_code)}`,
      { headers: { Authorization: `Bearer ${paystackKey}` } },
    );
    const listData = await listRes.json();
    if (!listRes.ok || !listData.status) {
      return json({ error: listData.message || "Failed to list Paystack subscriptions" }, 502);
    }

    const activeSubs: Array<{ subscription_code: string; status: string; plan: { name?: string } }> =
      (listData.data || []).filter((sub: { status: string }) => sub.status === "active");

    const disabled: string[] = [];
    const failed: Array<{ code: string; error: string }> = [];

    if (!dryRun) {
      for (const sub of activeSubs) {
        try {
          const detailRes = await fetch(
            `https://api.paystack.co/subscription/${encodeURIComponent(sub.subscription_code)}`,
            { headers: { Authorization: `Bearer ${paystackKey}` } },
          );
          const detailData = await detailRes.json();
          const emailToken = detailData?.data?.email_token;
          if (!detailRes.ok || !detailData.status || !emailToken) {
            failed.push({ code: sub.subscription_code, error: "Could not fetch email_token for this subscription" });
            continue;
          }

          const disableRes = await fetch("https://api.paystack.co/subscription/disable", {
            method: "POST",
            headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ code: sub.subscription_code, token: emailToken }),
          });
          const disableData = await disableRes.json();
          if (!disableRes.ok || !disableData.status) {
            failed.push({ code: sub.subscription_code, error: disableData.message || "Disable failed" });
            continue;
          }
          disabled.push(sub.subscription_code);
        } catch (err) {
          failed.push({ code: sub.subscription_code, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      if (failed.length > 0) {
        return json({
          error: "Some subscriptions could not be disabled — aborted before touching next_billing_at to avoid a partial migration.",
          disabled,
          failed,
        }, 502);
      }

      const nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: updateError } = await admin
        .from("tenants")
        .update({ next_billing_at: nextBillingAt, billing_retry_count: 0 })
        .eq("id", tenantId);
      if (updateError) return json({ error: `Disabled Paystack subscription(s) but failed to schedule billing: ${updateError.message}` }, 500);

      await admin.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: caller.id,
        action: "tenant_migrated_to_self_managed_billing",
        entity_type: "tenant",
        entity_id: tenantId,
        metadata: {
          disabled_paystack_subscriptions: disabled,
          billing_cycle: tenant.billing_cycle,
          next_billing_at: nextBillingAt,
          annual_base_price_gap_warning: tenant.billing_cycle === "annual",
        },
      });
    }

    return json({
      dryRun: Boolean(dryRun),
      tenantName: tenant.name,
      billingCycle: tenant.billing_cycle,
      activeSubscriptionsFound: activeSubs.map((s) => ({ code: s.subscription_code, plan: s.plan?.name })),
      disabled: dryRun ? [] : disabled,
      annualBasePriceGapWarning: tenant.billing_cycle === "annual"
        ? "This tenant is on annual billing. Disabling their Paystack Subscription removes the ONLY mechanism that charges their base plan price — the self-managed cron intentionally excludes it for annual tenants. They will not be billed again for the base plan until you build annual renewal billing or manually re-subscribe them."
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
