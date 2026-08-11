import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaystackKeyForCurrency, chargeAuthorization } from "../_shared/paystack-helpers.ts";
import { sendReceiptEmail, sendPaymentFailedEmail } from "../_shared/receipts.ts";
import { getSalonAppUrl } from "../_shared/salon-app-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-recurring-billing-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRY_ATTEMPTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("RECURRING_BILLING_SECRET");
    const providedSecret = req.headers.get("x-recurring-billing-secret");
    if (cronSecret && providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: dueTenants, error: dueError } = await supabase
      .from("tenants")
      .select("id, name, logo_url, currency, paystack_authorization_code, paystack_authorization_email, next_billing_at, billing_retry_count")
      .not("paystack_authorization_code", "is", null)
      .lte("next_billing_at", new Date().toISOString());

    if (dueError) {
      console.error("Failed to load due tenants:", dueError);
      return new Response(JSON.stringify({ error: dueError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const tenant of dueTenants || []) {
      try {
        const { data: totalRows, error: totalError } = await supabase.rpc("compute_tenant_recurring_total", {
          p_tenant_id: tenant.id,
        });

        if (totalError) {
          console.error(`compute_tenant_recurring_total failed for tenant ${tenant.id}:`, totalError);
          results.push({ tenantId: tenant.id, status: "error", error: totalError.message });
          continue;
        }

        const totalRow = totalRows?.[0];
        const addonTotal = totalRow?.total_amount || 0;
        const currency = totalRow?.currency || (tenant.currency || "NGN").toUpperCase();
        const nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        if (addonTotal <= 0) {
          await supabase
            .from("tenants")
            .update({ next_billing_at: nextBillingAt, billing_retry_count: 0 })
            .eq("id", tenant.id);
          results.push({ tenantId: tenant.id, status: "skipped_zero_total" });
          continue;
        }

        const { key: paystackKey, error: keyError } = getPaystackKeyForCurrency(currency);
        if (!paystackKey) {
          results.push({ tenantId: tenant.id, status: "error", error: keyError });
          continue;
        }

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
          if (stoppedRetrying) {
            // Freeze next_billing_at (null is excluded by the .lte() due-tenants
            // query above) instead of leaving it in the past — otherwise this
            // tenant keeps getting picked up and retried forever with the same
            // dead card, silently, with no email ever sent about it.
            update.subscription_status = "past_due";
            update.next_billing_at = null;
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

          if (stoppedRetrying && tenant.paystack_authorization_email) {
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

          results.push({ tenantId: tenant.id, status: "charge_failed", error: chargeResult.error, retryCount, stoppedRetrying });
          continue;
        }

        await supabase
          .from("tenants")
          .update({ next_billing_at: nextBillingAt, billing_retry_count: 0 })
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

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("process-recurring-addon-billing error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
