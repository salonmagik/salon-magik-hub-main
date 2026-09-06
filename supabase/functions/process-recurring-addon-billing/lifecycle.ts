import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getNextBillingAt } from "../_shared/paystack-helpers.ts";
import { sendDunningReminderEmail, sendSuspensionEmail, sendReactivationEmail } from "../_shared/receipts.ts";
import { getSalonAppUrl } from "../_shared/salon-app-url.ts";

/**
 * Dunning reminder thresholds within a grace episode, expressed as the
 * fraction of the window elapsed (so they scale with a configurable
 * BILLING_GRACE_PERIOD_DAYS rather than assuming a fixed 14-day window),
 * plus a fixed final-day reminder close to the deadline.
 */
const DUNNING_HALFWAY_KEY = "grace_halfway";
const DUNNING_FINAL_DAY_KEY = "grace_final_day";

interface LifecycleTenant {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string | null;
  billing_cycle: string | null;
  paystack_authorization_email: string | null;
  subscription_status: string;
  next_billing_at: string | null;
  billing_grace_ends_at: string | null;
  billing_grace_started_at: string | null;
  suspended_at: string | null;
  billing_retry_count: number | null;
}

/**
 * Runs before the charge pass in the same invocation (see index.ts). Every
 * transition here is a guarded UPDATE that also asserts the *from* state, so
 * a second run in the same day (or a partial failure and retry) updates zero
 * rows and is treated as a no-op, not an error — this is the mechanism
 * behind "a re-run must not double-apply a transition, a charge, or an
 * email" (AC 14).
 */
export async function runLifecyclePass(req: Request, supabase: SupabaseClient) {
  const results: Array<Record<string, unknown>> = [];

  await runCancellationsDue(supabase, results);
  await runDunningReminders(req, supabase, results);
  await runGraceExpiry(req, supabase, results);
  await runZeroTotalRestore(supabase, results);

  return results;
}

async function runCancellationsDue(supabase: SupabaseClient, results: Array<Record<string, unknown>>) {
  const { data: dueCancellations, error } = await supabase
    .from("tenants")
    .select("id")
    .not("subscription_cancel_at", "is", null)
    .lte("subscription_cancel_at", new Date().toISOString())
    .eq("subscription_status", "active");

  if (error) {
    console.error("Failed to load due cancellations:", error);
    results.push({ stage: "cancellations_due", status: "error", error: error.message });
    return;
  }

  for (const tenant of dueCancellations || []) {
    const { data: updated, error: updateError } = await supabase
      .from("tenants")
      .update({ subscription_status: "canceled", next_billing_at: null })
      .eq("id", tenant.id)
      .eq("subscription_status", "active")
      .not("subscription_cancel_at", "is", null)
      .lte("subscription_cancel_at", new Date().toISOString())
      .select("id");

    if (updateError) {
      console.error(`Failed to cancel tenant ${tenant.id}:`, updateError);
      results.push({ tenantId: tenant.id, stage: "cancellations_due", status: "error", error: updateError.message });
      continue;
    }

    if (!updated || updated.length === 0) {
      // Already applied by an earlier run today — skip audit + email.
      continue;
    }

    await supabase.from("audit_logs").insert({
      tenant_id: tenant.id,
      action: "subscription_canceled",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { trigger: "cron" },
    });

    results.push({ tenantId: tenant.id, stage: "cancellations_due", status: "canceled" });
  }
}

async function runDunningReminders(req: Request, supabase: SupabaseClient, results: Array<Record<string, unknown>>) {
  const { data: inGrace, error } = await supabase
    .from("tenants")
    .select("id, name, logo_url, currency, paystack_authorization_email, billing_grace_ends_at, billing_grace_started_at")
    .eq("subscription_status", "past_due")
    .not("billing_grace_ends_at", "is", null)
    .gt("billing_grace_ends_at", new Date().toISOString());

  if (error) {
    console.error("Failed to load tenants in grace:", error);
    results.push({ stage: "dunning_reminders", status: "error", error: error.message });
    return;
  }

  for (const tenant of inGrace || []) {
    if (!tenant.billing_grace_started_at || !tenant.billing_grace_ends_at) continue;

    const startedAt = new Date(tenant.billing_grace_started_at).getTime();
    const endsAt = new Date(tenant.billing_grace_ends_at).getTime();
    const now = Date.now();
    const windowMs = Math.max(endsAt - startedAt, 1);
    const elapsedFraction = (now - startedAt) / windowMs;
    const msUntilDeadline = endsAt - now;

    const dueNoticeKeys: string[] = [];
    if (elapsedFraction >= 0.5) dueNoticeKeys.push(DUNNING_HALFWAY_KEY);
    if (msUntilDeadline <= 24 * 60 * 60 * 1000) dueNoticeKeys.push(DUNNING_FINAL_DAY_KEY);

    for (const noticeKey of dueNoticeKeys) {
      // Insert-then-send, never send-then-insert: a duplicate email is worse
      // than a missed one here, and the unique index is the guard.
      const { data: inserted, error: insertError } = await supabase
        .from("billing_dunning_notices")
        .insert({
          tenant_id: tenant.id,
          grace_started_at: tenant.billing_grace_started_at,
          notice_key: noticeKey,
        })
        .select("id");

      if (insertError) {
        // Unique-violation is the expected "already sent" path.
        if (!insertError.message?.includes("duplicate") && insertError.code !== "23505") {
          console.error(`Failed to record dunning notice for tenant ${tenant.id}:`, insertError);
        }
        continue;
      }

      if (!inserted || inserted.length === 0) continue;

      const { data: totalRows } = await supabase.rpc("compute_tenant_recurring_total", { p_tenant_id: tenant.id });
      const amount = totalRows?.[0]?.total_amount || 0;
      const currency = totalRows?.[0]?.currency || (tenant.currency || "NGN").toUpperCase();

      if (tenant.paystack_authorization_email) {
        const emailResult = await sendDunningReminderEmail({
          recipientEmail: tenant.paystack_authorization_email,
          salonName: tenant.name,
          salonLogoUrl: tenant.logo_url,
          amount,
          currency,
          graceEndsAt: tenant.billing_grace_ends_at,
          updatePaymentMethodUrl: `${getSalonAppUrl(req)}/salon/subscription?billing=update_payment_method`,
        });
        if (!emailResult.sent) {
          console.error(`Failed to send dunning reminder for tenant ${tenant.id}:`, emailResult.error);
        }
      }

      results.push({ tenantId: tenant.id, stage: "dunning_reminders", status: "sent", noticeKey });
    }
  }
}

async function runGraceExpiry(req: Request, supabase: SupabaseClient, results: Array<Record<string, unknown>>) {
  const { data: graceExpired, error } = await supabase
    .from("tenants")
    .select("id, name, logo_url, currency, paystack_authorization_email")
    .eq("subscription_status", "past_due")
    .not("billing_grace_ends_at", "is", null)
    .lte("billing_grace_ends_at", new Date().toISOString());

  if (error) {
    console.error("Failed to load grace-expired tenants:", error);
    results.push({ stage: "grace_expiry", status: "error", error: error.message });
    return;
  }

  for (const tenant of graceExpired || []) {
    const { data: updated, error: updateError } = await supabase
      .from("tenants")
      .update({ subscription_status: "suspended", suspended_at: new Date().toISOString() })
      .eq("id", tenant.id)
      .eq("subscription_status", "past_due")
      .select("id");

    if (updateError) {
      console.error(`Failed to suspend tenant ${tenant.id}:`, updateError);
      results.push({ tenantId: tenant.id, stage: "grace_expiry", status: "error", error: updateError.message });
      continue;
    }

    if (!updated || updated.length === 0) continue;

    await supabase.from("audit_logs").insert({
      tenant_id: tenant.id,
      action: "subscription_suspended",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { trigger: "cron" },
    });

    if (tenant.paystack_authorization_email) {
      const { data: totalRows } = await supabase.rpc("compute_tenant_recurring_total", { p_tenant_id: tenant.id });
      const amount = totalRows?.[0]?.total_amount || 0;
      const currency = totalRows?.[0]?.currency || (tenant.currency || "NGN").toUpperCase();

      const emailResult = await sendSuspensionEmail({
        recipientEmail: tenant.paystack_authorization_email,
        salonName: tenant.name,
        salonLogoUrl: tenant.logo_url,
        amount,
        currency,
        updatePaymentMethodUrl: `${getSalonAppUrl(req)}/salon/subscription?billing=update_payment_method`,
      });
      if (!emailResult.sent) {
        console.error(`Failed to send suspension email for tenant ${tenant.id}:`, emailResult.error);
      }
    }

    results.push({ tenantId: tenant.id, stage: "grace_expiry", status: "suspended" });
  }
}

/**
 * Edge case 9: a past_due/suspended tenant whose current total comes back 0
 * (e.g. a promo now covers the whole balance) has no charge to make and
 * cannot self-restore through the payment flow — restore them the same way
 * the charge pass already does for an active tenant hitting a zero total.
 */
async function runZeroTotalRestore(supabase: SupabaseClient, results: Array<Record<string, unknown>>) {
  const { data: nonPaying, error } = await supabase
    .from("tenants")
    .select("id, billing_cycle, subscription_status, paystack_authorization_email, name, logo_url")
    .in("subscription_status", ["past_due", "suspended"]);

  if (error) {
    console.error("Failed to load past_due/suspended tenants for zero-total restore:", error);
    results.push({ stage: "zero_total_restore", status: "error", error: error.message });
    return;
  }

  for (const tenant of nonPaying || []) {
    const { data: totalRows, error: totalError } = await supabase.rpc("compute_tenant_recurring_total", {
      p_tenant_id: tenant.id,
    });

    if (totalError) continue;

    const total = totalRows?.[0]?.total_amount ?? null;
    if (total === null || total > 0) continue;

    const { data: updated, error: updateError } = await supabase
      .from("tenants")
      .update({
        subscription_status: "active",
        billing_retry_count: 0,
        billing_grace_ends_at: null,
        billing_grace_started_at: null,
        billing_period_due_at: null,
        suspended_at: null,
        next_billing_at: getNextBillingAt(tenant.billing_cycle),
      })
      .eq("id", tenant.id)
      .eq("subscription_status", tenant.subscription_status)
      .select("id");

    if (updateError) {
      console.error(`Failed to restore zero-total tenant ${tenant.id}:`, updateError);
      continue;
    }

    if (!updated || updated.length === 0) continue;

    await supabase.from("audit_logs").insert({
      tenant_id: tenant.id,
      action: "subscription_reactivated",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { trigger: "cron", from_status: tenant.subscription_status, reason: "zero_total" },
    });

    if (tenant.paystack_authorization_email) {
      const emailResult = await sendReactivationEmail({
        recipientEmail: tenant.paystack_authorization_email,
        salonName: tenant.name,
        salonLogoUrl: tenant.logo_url,
      });
      if (!emailResult.sent) {
        console.error(`Failed to send reactivation email for tenant ${tenant.id}:`, emailResult.error);
      }
    }

    results.push({ tenantId: tenant.id, stage: "zero_total_restore", status: "restored", fromStatus: tenant.subscription_status });
  }
}
