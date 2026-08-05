import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createTenantNotification,
  getSalonRecipients,
  getTenantNotificationSettings,
  sendResendEmail,
} from "./salon-notifications.ts";
import { buildFromAddress, wrapEmailTemplate } from "./email-template.ts";

const STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export interface WebhookEvent {
  type: string;
  gateway: "stripe" | "paystack";
  data: {
    paymentIntentId?: string;
    appointmentId?: string;
    appointmentIds?: string[];
    tenantId?: string;
    customerId?: string;
    invoiceId?: string;
    credits?: number;
    amount?: number;
    serviceAmount?: number;
    processingFeeAmount?: number;
    status?: string;
    reference?: string;
    isDeposit?: boolean;
    splitPurseAmount?: number;
    splitCustomerId?: string;
    intent?: string;
  };
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  context: string
): Promise<{ name: string | null; currency: string; platform_percentage_charge?: number | null; logo_url?: string | null }> {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("name, currency, platform_percentage_charge, logo_url")
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
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  expectedCurrency: string
): Promise<void> {
  const { data: walletCheck, error: walletError } = await supabase
    .from("salon_wallets")
    .select("currency")
    .eq("tenant_id", tenantId)
    .single();

  if (walletError) {
    console.error("Error fetching salon wallet for validation:", walletError);
    throw new Error(`Failed to validate salon wallet: ${walletError.message}`);
  }

  if (walletCheck && walletCheck.currency !== expectedCurrency) {
    console.error(`Currency mismatch: tenant ${tenantId} currency is ${expectedCurrency} but wallet currency is ${walletCheck.currency}`);
    throw new Error(`Currency configuration error for tenant ${tenantId}: wallet currency ${walletCheck.currency} does not match tenant currency ${expectedCurrency}`);
  }
}

// Verify Stripe webhook signature using HMAC SHA256
export async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(",").reduce((acc, part) => {
      const [key, value] = part.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts["t"];
    const expectedSig = parts["v1"];

    if (!timestamp || !expectedSig) {
      console.error("Invalid Stripe signature format");
      return false;
    }

    // Check timestamp is within 5 minutes
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (timestampAge > STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
      console.error("Stripe webhook timestamp too old");
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === expectedSig;
  } catch (error) {
    console.error("Stripe signature verification error:", error);
    return false;
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
  amount: number;
  gateway: "stripe" | "paystack";
  title: string;
  description: string;
  entityId?: string | null;
  htmlContent: string;
  supabase: ReturnType<typeof createClient>;
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

  await sendResendEmail({
    resendApiKey: input.resendApiKey,
    fromEmail: input.resendFromEmail!,
    to: recipients.map((recipient) => recipient.email),
    subject: input.title,
    salonName: input.tenantName || undefined,
    htmlContent: input.htmlContent,
  });
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
      const { appointmentId, appointmentIds, paymentIntentId, amount, serviceAmount, processingFeeAmount, reference, tenantId, customerId, invoiceId, credits, isDeposit, splitPurseAmount, splitCustomerId, intent } = event.data;

      const actualServiceAmount = serviceAmount ?? amount;

      // Subscription activation: payment was initiated from the upgrade/trial flow.
      // Activate the tenant immediately — Paystack handles recurring billing from here.
      if (intent === "subscription_activation" && tenantId && isValidUUID(tenantId)) {
        const { error: activationError } = await supabase
          .from("tenants")
          .update({ subscription_status: "active" })
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
              .select("id, tenant_id, customer_id, total_amount, booking_reference, purse_amount_used")
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
                  console.error("Error updating appointment:", appointmentError);
                }
              }

              const primaryAppointment = appointments[0];
              const { data: customer } = await supabase
                .from("customers")
                .select("full_name, email")
                .eq("id", primaryAppointment.customer_id)
                .single();

              const tenant = await validateTenant(supabase, primaryAppointment.tenant_id, "appointment payment");

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
                  await supabase.from("transactions").insert({
                    tenant_id: primaryAppointment.tenant_id,
                    customer_id: splitCustomerId,
                    appointment_id: primaryAppointment.id,
                    type: "payment",
                    amount: splitPurseAmount,
                    currency: tenant?.currency || "USD",
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

              // Create transaction record for card payment (grouped with purse if split payment)
              await supabase.from("transactions").insert({
                tenant_id: primaryAppointment.tenant_id,
                customer_id: primaryAppointment.customer_id,
                appointment_id: primaryAppointment.id,
                type: isDeposit ? "deposit" : "payment",
                amount,
                currency: tenant?.currency || "USD",
                method: "card",
                provider: event.gateway,
                provider_reference: reference,
                status: "completed",
                ...(event.gateway === "paystack" && reference ? { paystack_reference: reference } : {}),
                ...(paymentGroupId ? { payment_group_id: paymentGroupId } : {}),
              });

              // Calculate total payment including purse for notifications
              const totalPaymentAmount = splitPurseAmount && splitPurseAmount > 0
                ? amount + splitPurseAmount
                : amount;
              const paymentDescription = splitPurseAmount && splitPurseAmount > 0
                ? `${tenant?.currency || ""} ${amount} (card) + ${tenant?.currency || ""} ${splitPurseAmount} (purse)`
                : `${tenant?.currency || ""} ${amount}`;

              await sendTransactionAlerts({
                tenantId: primaryAppointment.tenant_id,
                tenantName: tenant?.name,
                currency: tenant?.currency,
                customerName: customer?.full_name,
                amount: totalPaymentAmount,
                gateway: event.gateway,
                title: `${isDeposit ? "Deposit received" : "Payment received"} at ${tenant?.name || "your salon"}`,
                description: `${customer?.full_name || "A customer"} completed ${isDeposit ? "a deposit" : "payment"} of ${paymentDescription} for their booking.`,
                entityId: primaryAppointment.id,
                htmlContent: `
                  <h2 style="color: #2563EB; margin-bottom: 16px;">${isDeposit ? "Deposit received" : "Payment received"}</h2>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Customer:</strong> ${customer?.full_name || "Unknown"}</p>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Total Amount:</strong> ${tenant?.currency || "USD"} ${totalPaymentAmount}</p>
                  ${splitPurseAmount && splitPurseAmount > 0 ? `
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Payment Breakdown:</strong></p>
                    <ul style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                      <li>Card payment: ${tenant?.currency || "USD"} ${amount}</li>
                      <li>Store credit: ${tenant?.currency || "USD"} ${splitPurseAmount}</li>
                    </ul>
                  ` : `<p style="color: #4b5563; font-size: 16px; line-height: 1.6;"><strong>Amount:</strong> ${tenant?.currency || "USD"} ${amount}</p>`}
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
                              from: buildFromAddress({ mode: "salon", salonName: tenant.name, fromEmail: resendFromEmail! }),
                              to: authUser.user.email,
                              subject: `${isDeposit ? "Deposit Received" : "New Paid Booking"} at ${tenant.name}`,
                              html: wrapEmailTemplate(
                                `
                            <h2 style="margin:0 0 16px;">${isDeposit ? "Deposit Received" : "New Paid Booking"}</h2>
                            <p>A customer has just completed ${isDeposit ? "a deposit" : "payment"} for a booking.</p>
                            <ul>
                              <li><strong>Customer:</strong> ${customer?.full_name || "Unknown"}</li>
                              <li><strong>Amount Paid:</strong> ${tenant.currency} ${amount}</li>
                              <li><strong>Gateway:</strong> ${event.gateway}</li>
                              <li><strong>Appointments:</strong> ${appointments.length}</li>
                            </ul>
                            <p>Please review the booking in your dashboard.</p>
                          `,
                                { mode: "salon", salonName: tenant.name, salonLogoUrl: tenant.logo_url ?? undefined },
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
                    currency: tenant.currency,
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
                // Validate salon wallet currency matches tenant currency
                await validateWalletCurrency(supabase, primaryAppointment.tenant_id, tenant.currency);

                // Only gateway funds become immediately withdrawable. Paid
                // customer-balance grants settle when the appointment completes;
                // salon-issued store credit never increases payout balance.
                const totalAmountForSalon = actualServiceAmount;

                let finalCreditAmount = totalAmountForSalon;
                if (tenant.platform_percentage_charge) {
                   finalCreditAmount = Number((totalAmountForSalon * (1 - (tenant.platform_percentage_charge / 100))).toFixed(2));
                }

                console.log(`Crediting payout balance from gateway funds: card=${actualServiceAmount}, net=${finalCreditAmount}`);

                const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                  p_tenant_id: primaryAppointment.tenant_id,
                  p_entry_type: "salon_purse_credit_booking",
                  p_reference_type: "appointment",
                  p_reference_id: primaryAppointment.id,
                  p_amount: finalCreditAmount,
                  p_currency: tenant.currency,
                  p_idempotency_key: `booking_${reference}`,
                  p_gateway_reference: reference,
                });

                if (creditError) {
                  console.error("Error crediting salon purse:", creditError);
                } else {
                  console.log(`Salon purse credited: ${totalAmountForSalon} ${tenant.currency} for appointment ${primaryAppointment.id}`);
                }
              } catch (purseError) {
                console.error("Exception crediting salon purse:", purseError);
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
                console.error("Error crediting customer purse:", creditError);
              } else {
                const { error: transactionError } = await supabase.from("transactions").insert({
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
                  console.error("Error recording purse topup transaction:", transactionError);
                }

                await sendTransactionAlerts({
                  tenantId,
                  tenantName: tenant?.name,
                  currency: tenant?.currency,
                  customerName: customer?.full_name,
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
              console.error("Exception crediting customer purse:", purseError);
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
              await validateWalletCurrency(supabase, salonTenantId, salonTenant.currency);

              const { error: creditError } = await supabase.rpc("credit_salon_purse", {
                p_tenant_id: salonTenantId,
                p_entry_type: "salon_purse_topup",
                p_reference_type: "topup",
                p_reference_id: paymentIntentId,
                p_amount: amount,
                p_currency: salonTenant.currency,
                p_idempotency_key: `salon_topup_${reference}`,
                p_gateway_reference: reference,
              });

              if (creditError) {
                console.error("Error crediting salon purse:", creditError);
              } else {
                console.log(`Salon purse credited: ${amount} ${salonTenant.currency} for tenant ${salonTenantId}`);
              }
            } catch (purseError) {
              console.error("Exception crediting salon purse:", purseError);
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
                console.error("Error updating invoice:", invoiceUpdateError);
              }

              // Validate salon wallet currency matches tenant currency
              await validateWalletCurrency(supabase, tenantId, invoiceTenant.currency);

              let finalCreditAmount = actualServiceAmount;
              if (invoiceTenant.platform_percentage_charge) {
                 finalCreditAmount = Number((actualServiceAmount * (1 - (invoiceTenant.platform_percentage_charge / 100))).toFixed(2));
              }

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
                console.error("Error crediting salon purse for invoice:", creditError);
              }
            } catch (invoiceError) {
              console.error("Exception processing invoice payment:", invoiceError);
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
              const { data: existingCredits } = await supabase
                .from("communication_credits")
                .select("id, balance")
                .eq("tenant_id", messagingTenantId)
                .single();

              if (existingCredits) {
                const { error: updateError } = await supabase
                  .from("communication_credits")
                  .update({
                    balance: existingCredits.balance + credits,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("tenant_id", messagingTenantId);

                if (updateError) {
                  console.error("Error updating communication_credits balance:", updateError);
                }
              } else {
                const { error: insertError } = await supabase
                  .from("communication_credits")
                  .insert({
                    tenant_id: messagingTenantId,
                    balance: credits,
                    updated_at: new Date().toISOString(),
                  });

                if (insertError) {
                  console.error("Error inserting communication_credits:", insertError);
                }
              }

              const { error: purchaseInsertError } = await supabase
                .from("messaging_credit_purchases")
                .insert({
                  tenant_id: messagingTenantId,
                  credits,
                  currency: messagingTenant.currency,
                  amount: messagingAmount,
                  paid_via: "paystack",
                  payment_intent_id: messagingPaymentIntentId,
                  gateway_reference: reference,
                });

              if (purchaseInsertError) {
                console.error("Error inserting messaging_credit_purchases:", purchaseInsertError);
              }

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
                              from: buildFromAddress({ mode: "salon", salonName: tenantDetails.name, fromEmail: resendFromEmail }),
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

      if (event.type === "transfer.success") {
        // Fetch withdrawal record to get tenant_id, amount, and currency
        const { data: withdrawal, error: fetchError } = await supabase
          .from("salon_withdrawals")
          .select("tenant_id, amount, currency, status")
          .eq("id", withdrawalId)
          .single();

        if (fetchError || !withdrawal) {
          console.error("Failed to fetch withdrawal record:", fetchError);
          return;
        }

        // If already completed, this is a duplicate webhook - skip processing
        if (withdrawal.status === "completed") {
          console.log("Withdrawal already completed, skipping:", withdrawalId);
          return;
        }

        // Debit the wallet with retry logic
        console.log(`[Transfer Success] Debiting wallet for withdrawal ${withdrawalId}`);
        const debitResult = await debitWalletWithRetry(
          supabase,
          withdrawal.tenant_id,
          withdrawalId,
          withdrawal.amount,
          withdrawal.currency
        );

        if (!debitResult.success) {
          // Wallet debit failed after retries - mark as failed
          console.error(`[CRITICAL] Failed to debit wallet for successful transfer ${withdrawalId}`);
          const { error: updateError } = await supabase
            .from("salon_withdrawals")
            .update({
              status: "failed",
              failure_reason: `CRITICAL: Transfer successful but wallet debit failed after retries. Error: ${debitResult.error}. Requires manual reconciliation.`
            })
            .eq("id", withdrawalId);

          if (updateError) {
            console.error("Failed to update withdrawal status after debit failure:", updateError);
          }
          return;
        }

        // Wallet debited successfully - mark withdrawal as completed
        const { error: updateError } = await supabase
          .from("salon_withdrawals")
          .update({ status: "completed" })
          .eq("id", withdrawalId);

        if (updateError) {
          console.error("Failed to update withdrawal status to completed:", updateError);
        } else {
          console.log(`[Transfer Success] Withdrawal ${withdrawalId} completed successfully`);
        }
      } else if (event.type === "transfer.failed" || event.type === "transfer.reversed") {
        // Transfer failed or reversed - no wallet reversal needed since wallet was never debited
        const failureReason = event.data.status || `Transfer ${event.type === "transfer.failed" ? "failed" : "reversed"}`;
        
        console.log(`[Transfer ${event.type}] Marking withdrawal ${withdrawalId} as failed (no wallet reversal needed)`);

        const { error: updateError } = await supabase
          .from("salon_withdrawals")
          .update({ status: "failed", failure_reason: failureReason })
          .eq("id", withdrawalId);

        if (updateError) {
          console.error("Failed to update withdrawal status:", updateError);
        } else {
          console.log(`Withdrawal ${withdrawalId} marked as failed:`, failureReason);
        }
      }
    }

    console.log("Webhook processing completed:", event.type, event.gateway);
  } catch (error) {
    console.error("Error in async webhook processing:", error);
  }
}
