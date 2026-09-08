import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, chargeAuthorization, getNextBillingAt } from "../_shared/paystack-helpers.ts";
import { sendReceiptEmail, sendPaymentFailedEmail } from "../_shared/receipts.ts";
import { getSalonAppUrl } from "../_shared/salon-app-url.ts";

const MAX_RETRY_ATTEMPTS = 3;

function getBillingGracePeriodDays(): number {
  const raw = Deno.env.get("BILLING_GRACE_PERIOD_DAYS");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

/**
 * The pre-existing per-tenant charge loop, run as PASS 2 of the daily job
 * (after the lifecycle pass — see index.ts). Two `where` clauses were added
 * to the due-tenants query as belt-and-braces: the lifecycle pass has
 * already moved every due cancellation out of `active` and every
 * grace-expired tenant out of `past_due` by the time this runs, so these
 * clauses only matter if pass 1 partially failed.
 */
export async function runChargePass(req: Request, supabase: SupabaseClient) {
  const { data: dueTenants, error: dueError } = await supabase
    .from("tenants")
    .select("id, name, logo_url, currency, billing_cycle, paystack_authorization_code, paystack_authorization_email, next_billing_at, billing_retry_count")
    .not("paystack_authorization_code", "is", null)
    .lte("next_billing_at", new Date().toISOString())
    .eq("subscription_status", "active")
    .is("subscription_cancel_at", null);

  if (dueError) {
    throw new Error(dueError.message);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const tenant of dueTenants || []) {
    try {
      const { data: totalRows, error: totalError } = await supabase.rpc("compute_tenant_recurring_total", {
        p_tenant_id: tenant.id,
      });

      if (totalError) {
        console.error(`compute_tenant_recurring_total failed for tenant ${tenant.id}:`, totalError);
        // A platform misconfiguration (e.g. CHAIN_ANNUAL_PRICING_NOT_CONFIGURED)
        // must never dun a customer — record as an error and move on without
        // touching retry_count or subscription_status.
        results.push({ tenantId: tenant.id, status: "error", error: totalError.message });
        continue;
      }

      const totalRow = totalRows?.[0];
      const addonTotal = totalRow?.total_amount || 0;
      const currency = totalRow?.currency || (tenant.currency || "NGN").toUpperCase();

      if (addonTotal <= 0) {
        await supabase
          .from("tenants")
          .update({ next_billing_at: getNextBillingAt(tenant.billing_cycle), billing_retry_count: 0 })
          .eq("id", tenant.id);
        results.push({ tenantId: tenant.id, status: "skipped_zero_total" });
        continue;
      }

      const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
      if (!paystackKey) {
        results.push({ tenantId: tenant.id, status: "error", error: keyError });
        continue;
      }

      // Stamp the anchor being charged for *before* attempting the charge —
      // by the time settlement runs (possibly days later, via the retry
      // flow), next_billing_at itself has been overwritten and then nulled,
      // so this is the only remaining record of what the original cycle
      // anchor was (see advance_billing_anchor / AD-5).
      await supabase
        .from("tenants")
        .update({ billing_period_due_at: tenant.next_billing_at })
        .eq("id", tenant.id);

      const chargeResult = await chargeAuthorization(paystackKey, {
        authorizationCode: tenant.paystack_authorization_code,
        email: tenant.paystack_authorization_email || "",
        amountInMajorUnits: addonTotal,
        currency,
        metadata: { intent: "recurring_addon_billing", tenant_id: tenant.id },
      });

      if (!chargeResult.success) {
        const retryCount = (tenant.billing_retry_count || 0) + 1;
        const update: Record<string, unknown> = { billing_retry_count: retryCount };
        const stoppedRetrying = retryCount >= MAX_RETRY_ATTEMPTS;
        let graceEndsAt: string | null = null;
        if (stoppedRetrying) {
          // Freeze next_billing_at (excluded by the due-tenants query above)
          // instead of leaving it in the past, and open a time-bounded grace
          // window rather than resting past_due indefinitely.
          graceEndsAt = new Date(Date.now() + getBillingGracePeriodDays() * 24 * 60 * 60 * 1000).toISOString();
          update.subscription_status = "past_due";
          update.next_billing_at = null;
          update.billing_grace_ends_at = graceEndsAt;
          update.billing_grace_started_at = new Date().toISOString();
        } else {
          // Retry on the next daily run rather than waiting a full cycle.
          update.next_billing_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        }
        await supabase.from("tenants").update(update).eq("id", tenant.id);

        await supabase.from("audit_logs").insert({
          tenant_id: tenant.id,
          action: "recurring_addon_billing_failed",
          entity_type: "tenant",
          entity_id: tenant.id,
          metadata: { error: chargeResult.error, addon_total: addonTotal, currency, retry_count: retryCount, stopped_retrying: stoppedRetrying },
        });

        if (stoppedRetrying) {
          await supabase.from("audit_logs").insert({
            tenant_id: tenant.id,
            action: "subscription_past_due",
            entity_type: "tenant",
            entity_id: tenant.id,
            metadata: { trigger: "cron", billing_grace_ends_at: graceEndsAt, amount: addonTotal, currency },
          });

          if (tenant.paystack_authorization_email) {
            const emailResult = await sendPaymentFailedEmail({
              recipientEmail: tenant.paystack_authorization_email,
              salonName: tenant.name,
              salonLogoUrl: tenant.logo_url,
              amount: addonTotal,
              currency,
              updatePaymentMethodUrl: `${getSalonAppUrl(req)}/salon/subscription?billing=update_payment_method`,
            });
            if (!emailResult.sent) {
              console.error(`Failed to send payment-failed email for tenant ${tenant.id}:`, emailResult.error);
            }
          }
        }

        results.push({ tenantId: tenant.id, status: "charge_failed", error: chargeResult.error, retryCount, stoppedRetrying });
        continue;
      }

      const { data: nextBillingAt, error: anchorError } = await supabase.rpc("advance_billing_anchor", {
        p_due_at: tenant.next_billing_at,
        p_billing_cycle: tenant.billing_cycle || "monthly",
      });

      await supabase
        .from("tenants")
        .update({
          next_billing_at: anchorError ? getNextBillingAt(tenant.billing_cycle) : nextBillingAt,
          billing_retry_count: 0,
          billing_period_due_at: null,
        })
        .eq("id", tenant.id);

      const discountApplied = Number(totalRow?.breakdown?.discount || 0);
      if (discountApplied > 0) {
        await supabase.rpc("consume_tenant_sales_promo_use", {
          p_tenant_id: tenant.id,
          p_surface: "subscription",
          p_usage_reference: `recurring:${chargeResult.reference}`,
          p_amount: discountApplied,
        });
      }

      await supabase.from("audit_logs").insert({
        tenant_id: tenant.id,
        action: "recurring_addon_billing_charged",
        entity_type: "tenant",
        entity_id: tenant.id,
        metadata: { reference: chargeResult.reference, total: addonTotal, currency, breakdown: totalRow?.breakdown },
      });

      if (tenant.paystack_authorization_email) {
        await sendReceiptEmail({
          recipientEmail: tenant.paystack_authorization_email,
          salonName: tenant.name,
          salonLogoUrl: tenant.logo_url,
          title: "Your Salon Magik subscription was billed",
          lineItems: [{ label: "Salon Magik subscription (this billing cycle)", amount: addonTotal }],
          total: addonTotal,
          currency,
          reference: chargeResult.reference,
        });
      }

      results.push({ tenantId: tenant.id, status: "charged", amount: addonTotal, currency });
    } catch (tenantError) {
      console.error(`Error processing tenant ${tenant.id}:`, tenantError);
      results.push({ tenantId: tenant.id, status: "error", error: tenantError instanceof Error ? tenantError.message : "Unknown error" });
    }
  }

  return results;
}
