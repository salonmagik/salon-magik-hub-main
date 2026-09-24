import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  createTenantNotification,
  getSalonRecipients,
  getTenantNotificationSettings,
  sendResendEmail,
} from "./salon-notifications.ts";
import { buildFromAddress, wrapEmailTemplate } from "./email-template.ts";
import { mapPaystackChannelToPaymentMethod, getNextBillingAt } from "./paystack-helpers.ts";
import { notifyWithdrawalOutcome } from "./withdrawal-notifications.ts";

function currencyForCountry(country: string | null | undefined, fallback: string): string {
  const normalized = (country || "").trim().toUpperCase();
  if (normalized === "GH" || normalized === "GHANA") return "GHS";
  if (normalized === "NG" || normalized === "NIGERIA") return "NGN";
  return fallback;
}

export interface WebhookEvent {
  type: string;
  gateway: "paystack";
  data: {
    paymentIntentId?: string;
    appointmentId?: string;
    appointmentIds?: string[];
    tenantId?: string;
    customerId?: string;
    invoiceId?: string;
    credits?: number;
    amount?: number;
    currency?: string;
    serviceAmount?: number;
    processingFeeAmount?: number;
    salonNetAmount?: number;
    channel?: string;
    status?: string;
    reference?: string;
    isDeposit?: boolean;
    splitPurseAmount?: number;
    splitCustomerId?: string;
    intent?: string;
    billingCycle?: string;
    authorizationCode?: string;
    authorizationReusable?: boolean;
    customerCode?: string;
    customerEmail?: string;
    /** Which branch a salon-initiated payment (currently: wallet top-ups) should credit. Omitted/null keeps the existing central-wallet behavior. */
    locationId?: string;
  };
}

async function recordGatewayPayment(supabase: SupabaseClient, record: Record<string, unknown>) {
  const result = await supabase.rpc("record_gateway_payment", { p_record: record });
  if (result.error) throw result.error;
  return result;
}

function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function parseAppointmentIds(raw: string | string[] | undefined, fallback?: string): string[] {
  let values: string[] = [];

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [raw];
    } catch {
      values = [raw];
    }
  } else if (Array.isArray(raw)) {
    values = raw;
  } else if (fallback) {
    values = [fallback];
  }

  return values.filter((value): value is string => typeof value === "string" && isValidUUID(value));
}

function isPaymentSuccessEvent(eventType: string): boolean {
  return eventType === "checkout.session.completed"
    || eventType === "payment_intent.succeeded"
    || eventType === "charge.success";
}

function isPaymentFailureEvent(eventType: string): boolean {
  return eventType === "payment_intent.payment_failed"
    || eventType === "charge.failed";
}

function isTransferEvent(eventType: string): boolean {
  return eventType === "transfer.success"
    || eventType === "transfer.failed"
    || eventType === "transfer.reversed";
}

async function debitWalletWithRetry(
  supabase: SupabaseClient,
  tenantId: string,
  withdrawalId: string,
  amount: number,
  currency: string,
  maxRetries = 3
): Promise<{ success: boolean; ledgerEntryId?: string; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Use unique idempotency key per withdrawal (not per attempt)
    // This ensures that if first attempt succeeds but we don't get response, 
    // subsequent attempts will return the same ledger entry ID
    const idempotencyKey = `webhook_debit_${withdrawalId}`;
    console.log(`[Wallet Debit] Attempt ${attempt}/${maxRetries} for withdrawal ${withdrawalId}`);
    const { data: ledgerEntryId, error } = await supabase.rpc(
      "debit_salon_purse_for_withdrawal",
      {
        p_tenant_id: tenantId,
        p_withdrawal_id: withdrawalId,
        p_amount: amount,
        p_currency: currency,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (!error) {
      console.log(`[Wallet Debit] Success on attempt ${attempt}. Ledger entry: ${ledgerEntryId}`);
      return { success: true, ledgerEntryId };
    }

    console.error(`[Wallet Debit] Attempt ${attempt} failed:`, error);

    // If this is not the last attempt, wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.log(`[Wallet Debit] Waiting ${delayMs}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    success: false,
    error: `Failed to debit wallet after ${maxRetries} attempts`
  };
}

/**
 * Resolves a withdrawal to a final outcome — the one place that knows how to
 * do that correctly for both fee-bearing withdrawals (atomic accounting via
 * finalize_fee_bearing_withdrawal) and legacy ones (debit-then-mark-complete,
 * or just mark-failed since a legacy withdrawal was never pre-debited).
 * Used by the transfer.success/failed/reversed webhook below, and reused by
 * process-salon-withdrawal for active reconciliation against Paystack's own
 * transfer-status API when a stuck pending withdrawal is blocking a new one
 * — reusing this instead of duplicating the fee-bearing/legacy branching.
 *
 * `verifyAgainst`, when given, cross-checks an externally-claimed reference/
 * amount/currency against the stored withdrawal before applying the outcome
 * (the webhook's own anti-spoofing check). Omit it when the caller already
 * looked the withdrawal up itself (nothing external to cross-check).
 */
export async function reconcileWithdrawalOutcome(
  supabase: SupabaseClient,
  withdrawalId: string,
  outcome: "success" | "failed" | "reversed",
  options: {
    verifyAgainst?: { reference: string; amount: number; currency: string };
    failureReason?: string;
  } = {},
): Promise<{ ok: boolean; error?: string }> {
  const { data: feeWithdrawal, error: feeLookupError } = await supabase
    .from("salon_withdrawals").select("fee_version, paystack_reference, amount, currency, status")
    .eq("id", withdrawalId).single();
  if (feeLookupError) return { ok: false, error: feeLookupError.message };

  if (feeWithdrawal?.fee_version) {
    if (options.verifyAgainst && (
      feeWithdrawal.paystack_reference !== options.verifyAgainst.reference
      || Number(feeWithdrawal.amount) !== options.verifyAgainst.amount
      || feeWithdrawal.currency !== options.verifyAgainst.currency
    )) {
      return { ok: false, error: "Transfer reference, amount or currency mismatch" };
    }
    const { error } = await supabase.rpc("finalize_fee_bearing_withdrawal", {
      p_withdrawal_id: withdrawalId,
      p_outcome: outcome,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // Legacy (pre fee-tracking) withdrawal.
  if (outcome === "success") {
    if (feeWithdrawal.status === "completed") return { ok: true };

    const { data: withdrawal, error: fetchError } = await supabase
      .from("salon_withdrawals")
      .select("tenant_id, amount, currency")
      .eq("id", withdrawalId)
      .single();
    if (fetchError || !withdrawal) return { ok: false, error: fetchError?.message || "Withdrawal not found" };

    const debitResult = await debitWalletWithRetry(
      supabase, withdrawal.tenant_id, withdrawalId, withdrawal.amount, withdrawal.currency,
    );
    if (!debitResult.success) {
      await supabase.from("salon_withdrawals").update({
        status: "failed",
        failure_reason: `CRITICAL: Transfer successful but wallet debit failed after retries. Error: ${debitResult.error}. Requires manual reconciliation.`,
      }).eq("id", withdrawalId);
      return { ok: false, error: debitResult.error };
    }

    const { error: updateError } = await supabase
      .from("salon_withdrawals").update({ status: "completed" }).eq("id", withdrawalId);
    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true };
  }

  // failed / reversed — no wallet reversal needed, a legacy withdrawal was
  // never pre-debited.
  const { error: updateError } = await supabase
    .from("salon_withdrawals")
    .update({ status: "failed", failure_reason: options.failureReason || `Transfer ${outcome}` })
    .eq("id", withdrawalId);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

function calculateProportionalAmount(
  appointmentAmount: number,
  totalAmount: number,
  paymentAmount: number,
  appointmentCount: number
): number {
  if (totalAmount > 0) {
    return Number(((appointmentAmount / totalAmount) * paymentAmount).toFixed(2));
  }
  return Number((paymentAmount / appointmentCount).toFixed(2));
}

async function validateTenant(
  supabase: SupabaseClient,
  tenantId: string,
  context: string
): Promise<{ name: string | null; currency: string; platform_percentage_charge?: number | null; logo_url?: string | null; payout_mode?: string | null }> {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("name, currency, platform_percentage_charge, logo_url, payout_mode")
    .eq("id", tenantId)
    .single();

  if (tenantError) {
    console.error(`Error fetching tenant for ${context}:`, tenantError);
    throw new Error(`Failed to fetch tenant data: ${tenantError.message}`);
  }

  if (!tenant) {
    console.error(`Tenant not found for ${context}:`, tenantId);
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  if (!tenant.currency) {
    console.error(`Tenant currency is not set for ${context}:`, tenantId);
    throw new Error(`Tenant currency is not configured for tenant: ${tenantId}`);
  }

  return tenant;
}

async function validateWalletCurrency(
  supabase: SupabaseClient,
  tenantId: string,
  expectedCurrency: string,
  locationId: string | null = null,
): Promise<void> {
  let walletQuery = supabase
    .from("salon_wallets")
    .select("currency")
    .eq("tenant_id", tenantId);
  walletQuery = locationId
    ? walletQuery.eq("location_id", locationId)
    : walletQuery.is("location_id", null);
  const { data: walletCheck, error: walletError } = await walletQuery.maybeSingle();

  if (walletError) {
    console.error("Error fetching salon wallet for validation:", walletError);
    throw new Error(`Failed to validate salon wallet: ${walletError.message}`);
  }

  if (walletCheck && walletCheck.currency !== expectedCurrency) {
    console.error(`Currency mismatch: tenant ${tenantId} currency is ${expectedCurrency} but wallet currency is ${walletCheck.currency}`);
    throw new Error(`Currency configuration error for tenant ${tenantId}: wallet currency ${walletCheck.currency} does not match tenant currency ${expectedCurrency}`);
  }
}

// Verify Paystack webhook signature using HMAC SHA512
export async function verifyPaystackSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === signature;
  } catch (error) {
    console.error("Paystack signature verification error:", error);
    return false;
  }
}

const sendTransactionAlerts = async (input: {
  tenantId: string;
  tenantName?: string | null;
  currency?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  amount: number;
  gateway: "paystack";
  title: string;
  description: string;
  entityId?: string | null;
  htmlContent: string;
  supabase: SupabaseClient;
  resendApiKey?: string | null;
  resendFromEmail?: string | null;
}) => {
  const settings = await getTenantNotificationSettings(input.supabase, input.tenantId);

  if (settings.in_app_transaction_alerts) {
    await createTenantNotification(input.supabase, {
      tenantId: input.tenantId,
      type: "payment",
      title: input.title,
      description: input.description,
      entityType: input.entityId ? "appointment" : "payment",
      entityId: input.entityId ?? null,
      urgent: true,
    });
  }

  if (!settings.email_transaction_alerts) return;

  const recipients = await getSalonRecipients(input.supabase, input.tenantId, ["owner", "manager"]);
  if (recipients.length === 0) return;

  const result = await sendResendEmail({
    resendApiKey: input.resendApiKey,
    fromEmail: input.resendFromEmail!,
    to: recipients.map((recipient) => recipient.email),
    subject: input.title,
    salonName: input.tenantName || undefined,
    htmlContent: input.htmlContent,
    log: {
      supabase: input.supabase,
      tenantId: input.tenantId,
      templateType: "payment_alert",
      customerId: input.customerId,
    },
  });
  if (!result.sent) {
    console.warn(`Failed to send transaction alert email for tenant ${input.tenantId}:`, result.error);
  }
};

// Process webhook asynchronously to avoid timeouts
export async function processWebhook(
  event: WebhookEvent,
  supabaseUrl: string,
  supabaseServiceKey: string,
  resendApiKey?: string,
  resendFromEmail?: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Handle payment success
    if (isPaymentSuccessEvent(event.type)) {
      const { appointmentId, appointmentIds, paymentIntentId, amount, serviceAmount, processingFeeAmount, salonNetAmount, channel, reference, tenantId, customerId, invoiceId, credits, isDeposit, splitPurseAmount, splitCustomerId, intent, billingCycle, authorizationCode, authorizationReusable, customerCode, customerEmail, locationId } = event.data;

      const actualServiceAmount = serviceAmount ?? amount;
      const paymentMethod = mapPaystackChannelToPaymentMethod(channel);

      // Subscription activation: payment was initiated from the upgrade/trial flow.
      //
      // This webhook is the ONLY reliable path here — the alternative,
      // verify-subscription-payment, only runs if the customer's browser
      // successfully redirects back from Paystack, which silently never
      // happens for some real fraction of checkouts (closed tab, flaky
      // connection, etc.). Before this fix, only that client-side path ever
      // captured the reusable card token and scheduled next_billing_at — a
      // tenant whose browser didn't return was left permanently active with
      // no card on file and no scheduled charge, invisible to the recurring
      // billing cron forever (it explicitly skips rows with no stored
      // authorization). This mirrors verify-subscription-payment's capture
      // logic so the webhook can't be second-best to the browser redirect.
      //
      // Guarded on next_billing_at being unset so a webhook arriving after
      // verify-subscription-payment already ran doesn't need to do anything
      // (both paths converge on the same tenant state either way).
      if (intent === "subscription_activation" && tenantId && isValidUUID(tenantId)) {
        const tenantUpdate: Record<string, unknown> = { subscription_status: "active" };

        const { data: tenantRow } = await supabase
          .from("tenants")
          .select("next_billing_at")
          .eq("id", tenantId)
          .maybeSingle();

        if (!tenantRow?.next_billing_at) {
          if (authorizationReusable && authorizationCode) {
            tenantUpdate.paystack_authorization_code = authorizationCode;
            tenantUpdate.paystack_customer_code = customerCode || null;
            tenantUpdate.paystack_authorization_email = customerEmail || null;
          }
          if (billingCycle === "annual" || billingCycle === "monthly") {
            tenantUpdate.billing_cycle = billingCycle;
          }
          tenantUpdate.next_billing_at = getNextBillingAt(billingCycle);
          tenantUpdate.billing_retry_count = 0;
        }

        const { error: activationError } = await supabase
          .from("tenants")
          .update(tenantUpdate)
          .eq("id", tenantId);
        if (activationError) {
          console.error("Failed to activate tenant subscription:", activationError);
        } else {
          console.log(`Tenant ${tenantId} subscription activated via webhook.`);
        }
        return;
      }

      let intentType = "appointment_payment";
      if (paymentIntentId && isValidUUID(paymentIntentId)) {
        const { data } = await supabase
          .from("payment_intents")
          .select("intent_type")
          .eq("id", paymentIntentId)
          .single();

        if (data?.intent_type) {
          intentType = data.intent_type;
        }
      }

      switch (intentType) {
        case "appointment_payment": {
          const targetAppointmentIds = parseAppointmentIds(appointmentIds, appointmentId);
          if (targetAppointmentIds.length === 0) {
            console.error("No valid appointment ids found on payment webhook");
            return;
          }

          if (actualServiceAmount) {
              const { data: appointments, error: appointmentsError } = await supabase
                .from("appointments")
                .select("id, tenant_id, customer_id, location_id, total_amount, booking_reference, purse_amount_used")
                .in("id", targetAppointmentIds);

            if (appointmentsError) {
              console.error("Error loading appointments from payment webhook:", appointmentsError);
            }

            if (appointments && appointments.length > 0) {
              const totalAppointmentAmount = appointments.reduce(
                (sum, entry) => sum + Number(entry.total_amount || 0),
                0,
              );
              const allocatedAmounts = appointments.map((entry, index) => {
                if (index === appointments.length - 1) {
                  const previousTotal = appointments
                    .slice(0, -1)
                    .reduce((sum, prior) => {
                      const priorAmount = calculateProportionalAmount(
                        Number(prior.total_amount || 0),
                        totalAppointmentAmount,
                        actualServiceAmount,
                        appointments.length
                      );
                      return sum + priorAmount;
                    }, 0);
                  return Number((actualServiceAmount - previousTotal).toFixed(2));
                }

                return calculateProportionalAmount(
                  Number(entry.total_amount || 0),
                  totalAppointmentAmount,
                  actualServiceAmount,
                  appointments.length
                );
              });

              for (const [index, entry] of appointments.entries()) {
                const combinedPaid = allocatedAmounts[index] + Number(entry.purse_amount_used || 0);
                const { error: appointmentError } = await supabase
                  .from("appointments")
                  .update({
                    payment_status: isDeposit
                      ? "deposit_paid"
                      : combinedPaid >= Number(entry.total_amount || 0) ? "fully_paid" : "deposit_paid",
                    amount_paid: combinedPaid,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", entry.id);

                if (appointmentError) {
                  throw appointmentError;
                }
              }

              const primaryAppointment = appointments[0];
              const appointmentLocationIds = [...new Set(appointments.map((entry) => entry.location_id).filter(Boolean))];
              const { data: appointmentLocations } = appointmentLocationIds.length > 0
                ? await supabase.from("locations").select("id, country").in("id", appointmentLocationIds)
                : { data: [] as Array<{ id: string; country: string | null }> };
              const locationCurrencies = new Set(
                appointments.map((entry) => {
                  const location = appointmentLocations?.find((candidate) => candidate.id === entry.location_id);
                  return currencyForCountry(location?.country, "USD");
                }),
              );
              const { data: customer } = await supabase
                .from("customers")
                .select("full_name, email")
                .eq("id", primaryAppointment.customer_id)
                .single();

              const tenant = await validateTenant(supabase, primaryAppointment.tenant_id, "appointment payment");
              const settlementCurrency = currencyForCountry(
                appointmentLocations?.find((location) => location.id === primaryAppointment.location_id)?.country,
                tenant.currency,
              );
              if (locationCurrencies.size > 1) {
                throw new Error("A payment cannot cover appointments in multiple settlement currencies");
              }

              console.log("Split payment metadata check:", {
                splitPurseAmount,
                splitCustomerId,
                hasMetadata: !!(splitPurseAmount && splitPurseAmount > 0 && splitCustomerId)
              });

              // Generate payment group ID for split payments
              const paymentGroupId = splitPurseAmount && splitPurseAmount > 0 && splitCustomerId
                ? crypto.randomUUID()
                : null;

              // The balance portion was reserved when the booking was created.
              if (splitPurseAmount && splitPurseAmount > 0 && splitCustomerId && paymentGroupId) {
                console.log(`Recording reserved balance portion: ${splitPurseAmount} for customer ${splitCustomerId}`);
                try {
                  await recordGatewayPayment(supabase, {
                    tenant_id: primaryAppointment.tenant_id,
                    customer_id: splitCustomerId,
                    appointment_id: primaryAppointment.id,
                    type: "payment",
                    amount: splitPurseAmount,
                    currency: settlementCurrency,
                    method: "purse",
                    provider: "internal",
                    provider_reference: `split_purse_${reference}`,
                    status: "completed",
                    ...(paymentGroupId ? { payment_group_id: paymentGroupId } : {}),
                  });

                  console.log(`Created balance transaction record for ${splitPurseAmount} with payment_group_id: ${paymentGroupId}`);
                } catch (purseError) {
                  console.error("Exception while recording customer balance:", purseError);
                }
              }

              // Create transaction record (grouped with purse if split payment).
              // amount here is the true service price, not what Paystack
              // actually charged the customer's card (which includes
              // Paystack's own processing fee and Salon Magik's fees) — see
              // actualServiceAmount above.
              await recordGatewayPayment(supabase, {
                tenant_id: primaryAppointment.tenant_id,
                customer_id: primaryAppointment.customer_id,
                appointment_id: primaryAppointment.id,
                type: isDeposit ? "deposit" : "payment",
                amount: actualServiceAmount,
                currency: settlementCurrency,
                method: paymentMethod,
                provider: event.gateway,
                provider_reference: reference,
                status: "completed",
                ...(event.gateway === "paystack" && reference ? { paystack_reference: reference } : {}),
                ...(paymentGroupId ? { payment_group_id: paymentGroupId } : {}),
              });

              // Calculate total payment including purse for notifications
              const totalPaymentAmount = splitPurseAmount && splitPurseAmount > 0
                ? actualServiceAmount + splitPurseAmount
                : actualServiceAmount;
              const paymentDescription = splitPurseAmount && splitPurseAmount > 0
                ? `${settlementCurrency} ${actualServiceAmount} (${paymentMethod}) + ${settlementCurrency} ${splitPurseAmount} (purse)`
                : `${settlementCurrency} ${actualServiceAmount}`;

              await sendTransactionAlerts({
                tenantId: primaryAppointment.tenant_id,
                tenantName: tenant?.name,
                currency: settlementCurrency,
                customerName: customer?.full_name,
                customerId: primaryAppointment.customer_id,
                amount: totalPaymentAmount,
                gateway: event.gateway,
                title: `${isDeposit ? "Deposit received" : "Payment received"} at ${tenant?.name || "your salon"}`,
                description: `${customer?.full_name || "A customer"} completed ${isDeposit ? "a deposit" : "payment"} of ${paymentDescription} for their booking.`,
                entityId: primaryAppointment.id,
                htmlContent: `
                  <h2 style="color: #2563EB; margin-bottom: 16px;">${isDeposit ? "Deposit received" : "Payment received"}</h2>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Customer:</strong> ${customer?.full_name || "Unknown"}</p>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Total Amount:</strong> ${settlementCurrency} ${totalPaymentAmount}</p>
                  ${splitPurseAmount && splitPurseAmount > 0 ? `
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Payment Breakdown:</strong></p>
                    <ul style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                      <li>${paymentMethod} payment: ${settlementCurrency} ${actualServiceAmount}</li>
                      <li>Store credit: ${settlementCurrency} ${splitPurseAmount}</li>
                    </ul>
                  ` : `<p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Amount:</strong> ${settlementCurrency} ${actualServiceAmount}</p>`}
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Gateway:</strong> ${event.gateway}</p>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Appointments covered:</strong> ${appointments.length}</p>
                `,
                supabase,
                resendApiKey,
                resendFromEmail,
              });

              try {
                await fetch(`${supabaseUrl}/functions/v1/send-appointment-notification`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    appointmentId: primaryAppointment.id,
                    action: "scheduled",
                  }),
                });
              } catch (emailError) {
                console.error("Error sending customer notification:", emailError);
              }

              if (resendApiKey && tenant) {
                const { data: owners } = await supabase
                  .from("user_roles")
                  .select("user_id")
                  .eq("tenant_id", primaryAppointment.tenant_id)
                  .in("role", ["owner", "manager"]);

                if (owners && owners.length > 0) {
                  for (const owner of owners) {
                    try {
                      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(owner.user_id);

                      if (authError) {
                        console.error("Error fetching auth user:", authError);
                        continue;
                      }

                      if (authUser?.user?.email) {
                        try {
                          await fetch("https://api.resend.com/emails", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${resendApiKey}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              from: buildFromAddress({ mode: "salon", salonName: tenant.name ?? undefined, fromEmail: resendFromEmail! }),
                              to: authUser.user.email,
                              subject: `${isDeposit ? "Deposit Received" : "New Paid Booking"} at ${tenant.name}`,
                              html: wrapEmailTemplate(
                                `
                            <h2 style="margin:0 0 16px;">${isDeposit ? "Deposit Received" : "New Paid Booking"}</h2>
                            <p>A customer has just completed ${isDeposit ? "a deposit" : "payment"} for a booking.</p>
                            <ul>
                              <li><strong>Customer:</strong> ${customer?.full_name || "Unknown"}</li>
                              <li><strong>Amount Paid:</strong> ${settlementCurrency} ${actualServiceAmount}</li>
                              <li><strong>Gateway:</strong> ${event.gateway}</li>
                              <li><strong>Appointments:</strong> ${appointments.length}</li>
                            </ul>
                            <p>Please review the booking in your dashboard.</p>
                          `,
                                { mode: "salon", salonName: tenant.name ?? undefined, salonLogoUrl: tenant.logo_url ?? undefined },
                              ),
                            }),
                          });
                        } catch (ownerEmailError) {
                          console.error("Error sending owner notification:", ownerEmailError);
                        }
                      }
                    } catch (err) {
                      console.error("Error processing owner notification:", err);
                    }
                  }
                }
              }

              try {
                const { data: invoiceCount } = await supabase
                  .from("invoices")
                  .select("id", { count: "exact", head: true })
                  .eq("tenant_id", primaryAppointment.tenant_id);

                const count = (invoiceCount as unknown as number) || 0;
                const prefix = tenant.name?.substring(0, 3).toUpperCase() || "INV";
                const invoiceNumber = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(count + 1).padStart(4, "0")}`;

                const { data: invoice } = await supabase
                  .from("invoices")
                  .insert({
                    tenant_id: primaryAppointment.tenant_id,
                    customer_id: primaryAppointment.customer_id,
                    appointment_id: primaryAppointment.id,
                    invoice_number: invoiceNumber,
                    currency: settlementCurrency,
                    subtotal: totalPaymentAmount,
                    total: totalPaymentAmount,
                    status: isDeposit ? "sent" : "paid",
                    paid_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single();

                if (invoice?.id) {
                  await fetch(`${supabaseUrl}/functions/v1/send-invoice`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${supabaseServiceKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ invoiceId: invoice.id }),
                  });
                }
              } catch (invoiceError) {
                console.error("Error generating invoice:", invoiceError);
              }

              try {
                // Every tenant is on-demand now (no more "automatic" mode
                // relying on a Paystack subaccount settling straight to the
                // bank) — every booking payment credits the internal wallet
                // unconditionally, paid out via withdrawal request instead.
                // Validate salon wallet currency matches tenant currency
                await validateWalletCurrency(supabase, primaryAppointment.tenant_id, settlementCurrency, primaryAppointment.location_id);

                // Only gateway funds become immediately withdrawable. Paid
                // customer-balance grants settle when the appointment completes;
                // salon-issued store credit never increases payout balance.
                const totalAmountForSalon = actualServiceAmount;

                // The checkout freezes the salon share in signed Paystack
                // metadata. Recomputing with the salon's current settings can
                // change the economics after the customer has already paid.
                const finalCreditAmount = salonNetAmount ?? totalAmountForSalon;

                console.log(`Crediting payout balance from gateway funds: card=${actualServiceAmount}, net=${finalCreditAmount}`);

                // Deliberately not passing p_location_id here: credit_salon_purse's
                // own resolve_salon_wallet_location already infers the right wallet
                // from this same appointment (branch wallet for a chain, central
                // wallet when the tenant has only one location). Passing the
                // appointment's location_id explicitly bypassed that single-location
                // safeguard, silently starting a second, invisible wallet for every
                // single-location tenant's bookings going forward.
                const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                  p_tenant_id: primaryAppointment.tenant_id,
                  p_entry_type: "salon_purse_credit_booking",
                  p_reference_type: "appointment",
                  p_reference_id: primaryAppointment.id,
                  p_amount: finalCreditAmount,
                  p_currency: settlementCurrency,
                  p_idempotency_key: `booking_${reference}`,
                  p_gateway_reference: reference,
                });

                if (creditError) {
                  throw creditError;
                } else {
                  console.log(`Salon purse credited: ${totalAmountForSalon} ${settlementCurrency} for appointment ${primaryAppointment.id}`);
                }
              } catch (purseError) {
                throw purseError;
              }
            }
          }
          break;
        }

        case "customer_purse_topup": {
          if (customerId && tenantId && amount) {
            const tenant = await validateTenant(supabase, tenantId, "customer purse topup");
            const { data: customer } = await supabase
              .from("customers")
              .select("full_name")
              .eq("id", customerId)
              .eq("tenant_id", tenantId)
              .maybeSingle();

            try {
              const { error: creditError } = await supabase.rpc("credit_customer_purse", {
                p_tenant_id: tenantId,
                p_customer_id: customerId,
                p_amount: amount,
                p_currency: tenant.currency,
                p_idempotency_key: `topup_${reference}`,
                p_gateway_reference: reference,
              });

              if (creditError) {
                throw creditError;
              } else {
                const { error: transactionError } = await recordGatewayPayment(supabase, {
                  tenant_id: tenantId,
                  customer_id: customerId,
                  appointment_id: null,
                  type: "purse_topup",
                  amount,
                  currency: tenant?.currency || "USD",
                  method: "card",
                  provider: event.gateway,
                  provider_reference: reference,
                  status: "completed",
                  ...(event.gateway === "paystack" && reference ? { paystack_reference: reference } : {}),
                });

                if (transactionError) {
                  throw transactionError;
                }

                await sendTransactionAlerts({
                  tenantId,
                  tenantName: tenant?.name,
                  currency: tenant?.currency,
                  customerName: customer?.full_name,
                  customerId,
                  amount,
                  gateway: event.gateway,
                  title: `Purse top-up received at ${tenant?.name || "your salon"}`,
                  description: `${customer?.full_name || "A customer"} added ${tenant?.currency || ""} ${amount} to their purse.`,
                  htmlContent: `
                    <h2 style="color: #2563EB; margin-bottom: 16px;">Purse top-up received</h2>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Customer:</strong> ${customer?.full_name || "Unknown"}</p>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Amount:</strong> ${tenant?.currency || "USD"} ${amount}</p>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Gateway:</strong> ${event.gateway}</p>
                  `,
                  supabase,
                  resendApiKey,
                  resendFromEmail,
                });

                console.log(`Customer purse credited: ${amount} ${tenant.currency} for customer ${customerId}`);
              }
            } catch (purseError) {
              throw purseError;
            }
          } else {
            console.error("Missing required fields for customer_purse_topup:", { customerId, tenantId, amount });
          }
          break;
        }

        case "salon_purse_topup": {
          const salonTenantId = tenantId;
          if (salonTenantId && amount && paymentIntentId) {
            const salonTenant = await validateTenant(supabase, salonTenantId, "salon purse topup");

            try {
              // Validate salon wallet currency matches tenant currency
              await validateWalletCurrency(supabase, salonTenantId, salonTenant.currency, locationId ?? null);

              // A chosen branch is honored as-is (credit_salon_purse trusts an
              // explicit p_location_id over inference); omitted, it falls back
              // to the central wallet, same as before this was branch-aware.
              const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                p_tenant_id: salonTenantId,
                p_entry_type: "salon_purse_topup",
                p_reference_type: "topup",
                p_reference_id: paymentIntentId,
                p_amount: amount,
                p_currency: salonTenant.currency,
                p_idempotency_key: `salon_topup_${reference}`,
                p_gateway_reference: reference,
                p_location_id: locationId ?? undefined,
              });

              if (creditError) {
                throw creditError;
              } else {
                console.log(`Salon purse credited: ${amount} ${salonTenant.currency} for tenant ${salonTenantId}`);
              }
            } catch (purseError) {
              throw purseError;
            }
          } else {
            console.error("Missing required fields for salon_purse_topup:", { salonTenantId, amount, paymentIntentId });
          }
          break;
        }

        case "invoice_payment": {
          if (invoiceId && isValidUUID(invoiceId) && amount && tenantId) {
            const invoiceTenant = await validateTenant(supabase, tenantId, "invoice payment");

            try {
              const { error: invoiceUpdateError } = await supabase
                .from("invoices")
                .update({
                  status: "paid",
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", invoiceId);

              if (invoiceUpdateError) {
                throw invoiceUpdateError;
              }

              // Validate salon wallet currency matches tenant currency
              await validateWalletCurrency(supabase, tenantId, invoiceTenant.currency);

              if (actualServiceAmount == null) throw new Error("Invoice payment is missing its service amount");
              const finalCreditAmount = salonNetAmount ?? actualServiceAmount;

              const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                p_tenant_id: tenantId,
                p_entry_type: "salon_purse_credit_invoice",
                p_reference_type: "invoice",
                p_reference_id: invoiceId,
                p_amount: finalCreditAmount,
                p_currency: invoiceTenant.currency,
                p_idempotency_key: `invoice_${reference}`,
                p_gateway_reference: reference,
              });

              if (creditError) {
                throw creditError;
              }
            } catch (invoiceError) {
              throw invoiceError;
            }
          } else {
            console.error("Missing required fields for invoice_payment:", { invoiceId, amount, tenantId });
          }
          break;
        }

        case "messaging_credit_purchase": {
          const messagingTenantId = tenantId;
          const messagingAmount = amount;
          const messagingPaymentIntentId = paymentIntentId;

          if (credits && messagingTenantId && messagingAmount && messagingPaymentIntentId && isValidUUID(messagingPaymentIntentId)) {
            const messagingTenant = await validateTenant(supabase, messagingTenantId, "messaging credit purchase");

            try {
              const { data: purchase, error: purchaseError } = await supabase.rpc("complete_messaging_credit_purchase", {
                p_tenant_id: messagingTenantId, p_payment_intent_id: messagingPaymentIntentId,
                p_reference: reference, p_credits: credits, p_amount: messagingAmount, p_currency: messagingTenant.currency,
              });
              if (purchaseError) throw purchaseError;
              if (purchase?.duplicate) break;

              // Send confirmation email to tenant owner
              if (resendApiKey) {
                const { data: tenantDetails } = await supabase
                  .from("tenants")
                  .select("name, logo_url")
                  .eq("id", messagingTenantId)
                  .single();

                // Get salon owner email
                const { data: owners } = await supabase
                  .from("user_roles")
                  .select("user_id")
                  .eq("tenant_id", messagingTenantId)
                  .eq("role", "owner");

                if (owners && owners.length > 0 && tenantDetails) {
                  for (const owner of owners) {
                    try {
                      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(owner.user_id);

                      if (authError) {
                        console.error("Error fetching auth user:", authError);
                        continue;
                      }

                      if (authUser?.user?.email) {
                        try {
                          await fetch("https://api.resend.com/emails", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${resendApiKey}`,
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              from: buildFromAddress({ mode: "salon", salonName: tenantDetails.name ?? undefined, fromEmail: resendFromEmail! }),
                              to: authUser.user.email,
                              subject: `Messaging Credits Purchased - ${tenantDetails.name}`,
                              html: wrapEmailTemplate(
                                `
                            <h2 style="margin:0 0 16px;">Messaging Credits Purchase Confirmation</h2>
                            <p>Your messaging credits purchase was successful!</p>
                            <ul>
                              <li><strong>Credits Purchased:</strong> ${credits} credits</li>
                              <li><strong>Amount Paid:</strong> ${messagingTenant.currency} ${messagingAmount}</li>
                              <li><strong>Payment Method:</strong> Paystack</li>
                              <li><strong>Transaction Reference:</strong> ${reference}</li>
                            </ul>
                            <p>Your new credits have been added to your account and are ready to use for sending messages to your customers.</p>
                            <p>Thank you for using SalonMagik!</p>
                          `,
                                { mode: "salon", salonName: tenantDetails.name, salonLogoUrl: tenantDetails.logo_url ?? undefined },
                              ),
                            }),
                          });
                        } catch (emailError) {
                          console.error("Error sending credit purchase confirmation email:", emailError);
                        }
                      }
                    } catch (err) {
                      console.error("Error processing owner email notification:", err);
                    }
                  }
                }
              }
            } catch (creditPurchaseError) {
              console.error("Exception processing messaging credit purchase:", creditPurchaseError);
              throw creditPurchaseError;
            }
          } else {
            console.error("Missing required fields for messaging_credit_purchase:", {
              credits,
              messagingTenantId,
              messagingAmount,
              messagingPaymentIntentId,
            });
          }
          break;
        }

        default:
          console.log(`Unhandled intent_type: ${intentType}`);
          break;
      }

      if (paymentIntentId && isValidUUID(paymentIntentId)) {
        await supabase
          .from("payment_intents")
          .update({
            status: "completed",
            gateway_reference: reference,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentIntentId);
      }

      if (tenantId && reference) {
        await supabase.rpc("finalize_sales_conversion_from_webhook", {
          p_payment_ref: reference,
          p_tenant_id: tenantId,
          p_status: "paid",
          p_amount: actualServiceAmount ?? null,
          p_currency: "USD",
          p_paid_at: new Date().toISOString(),
        });
      }
    }

    // Handle payment failure
    if (isPaymentFailureEvent(event.type)) {
      const { paymentIntentId, tenantId, reference, amount, serviceAmount } = event.data;
      const actualServiceAmount = serviceAmount ?? amount;

      if (paymentIntentId && isValidUUID(paymentIntentId)) {
        await supabase
          .from("payment_intents")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentIntentId);
      }

      if (tenantId) {
        await supabase.rpc("finalize_sales_conversion_from_webhook", {
          p_payment_ref: reference ?? null,
          p_tenant_id: tenantId,
          p_status: "failed",
          p_amount: actualServiceAmount ?? null,
          p_currency: "USD",
          p_paid_at: new Date().toISOString(),
        });
      }
    }

    // Handle transfer events (for salon withdrawals)
    if (isTransferEvent(event.type)) {
      const { reference } = event.data;

      if (!reference) {
        console.error("Transfer event missing reference:", event.type);
        return;
      }

      // Extract withdrawal ID from reference format: withdrawal_<uuid>_<timestamp>
      const withdrawalIdMatch = reference.match(/^withdrawal_([a-f0-9-]+)_/);
      if (!withdrawalIdMatch) {
        console.log("Transfer event not for withdrawal (invalid reference format):", reference);
        return;
      }

      const withdrawalId = withdrawalIdMatch[1];
      console.log(`Processing ${event.type} for withdrawal ${withdrawalId}`);

      const outcome = event.type === "transfer.success" ? "success" : event.type === "transfer.reversed" ? "reversed" : "failed";
      const result = await reconcileWithdrawalOutcome(supabase, withdrawalId, outcome, {
        verifyAgainst: event.data.reference
          ? { reference: event.data.reference, amount: event.data.amount ?? 0, currency: event.data.currency ?? "" }
          : undefined,
        failureReason: event.data.status || undefined,
      });
      if (!result.ok) {
        console.error(`Failed to reconcile withdrawal ${withdrawalId} to ${outcome}:`, result.error);
        throw new Error(result.error);
      }
      console.log(`Withdrawal ${withdrawalId} reconciled to ${outcome}`);
      await notifyWithdrawalOutcome(supabase, withdrawalId, outcome, { resendApiKey, resendFromEmail })
        .catch((err) => console.error(`Failed to send withdrawal-outcome notification for ${withdrawalId}:`, err));
    }

    console.log("Webhook processing completed:", event.type, event.gateway);
  } catch (error) {
    console.error("Error in async webhook processing:", error);
    throw error;
  }
}
