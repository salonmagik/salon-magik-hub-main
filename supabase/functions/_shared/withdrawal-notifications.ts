import { createTenantNotification, getSalonRecipients, getTenantNotificationSettings, sendResendEmail } from "./salon-notifications.ts";

interface WithdrawalNotificationOptions {
  resendApiKey?: string | null;
  resendFromEmail?: string | null;
}

interface WithdrawalRow {
  tenant_id: string;
  amount: number;
  currency: string;
  tenants: { name: string | null; logo_url: string | null } | null;
  salon_payout_destinations: {
    destination_type: "bank" | "mobile_money";
    bank_name: string | null;
    account_number: string | null;
    momo_provider: string | null;
    momo_number: string | null;
  } | null;
}

function maskTail(value: string | null | undefined): string {
  if (!value) return "";
  return value.length > 4 ? `••••${value.slice(-4)}` : value;
}

function describeDestination(dest: WithdrawalRow["salon_payout_destinations"]): string {
  if (!dest) return "your payout account";
  if (dest.destination_type === "mobile_money") {
    return `${dest.momo_provider ? `${dest.momo_provider} ` : ""}${maskTail(dest.momo_number)}`.trim() || "your mobile money account";
  }
  return `${dest.bank_name || "your bank account"} ${maskTail(dest.account_number)}`.trim();
}

// Both notifyWithdrawalRequested and notifyWithdrawalOutcome do their own
// fetch of the withdrawal (joined with tenant + destination) rather than
// taking that data from a caller — they're invoked from several different
// places (creation, webhook reconciliation, active-poll reconciliation),
// and keeping the fetch here means every call site stays a one-liner.
async function fetchWithdrawalForEmail(supabase: any, withdrawalId: string): Promise<WithdrawalRow | null> {
  const { data, error } = await supabase
    .from("salon_withdrawals")
    .select("tenant_id, amount, currency, tenants(name, logo_url), salon_payout_destinations(destination_type, bank_name, account_number, momo_provider, momo_number)")
    .eq("id", withdrawalId)
    .single();
  if (error || !data) {
    console.error(`withdrawal-notifications: failed to load withdrawal ${withdrawalId} for email:`, error);
    return null;
  }
  return data as WithdrawalRow;
}

/**
 * Fires the moment a withdrawal request is accepted and reserved (status
 * 'pending'/'awaiting_otp') — before Paystack's outcome is known. Gated on
 * the same email_transaction_alerts setting as other payment emails; the
 * in-app notification always fires regardless of that setting, matching
 * the low-balance and transaction-alert precedents.
 */
export async function notifyWithdrawalRequested(
  supabase: any,
  withdrawalId: string,
  options: WithdrawalNotificationOptions = {},
): Promise<void> {
  const withdrawal = await fetchWithdrawalForEmail(supabase, withdrawalId);
  if (!withdrawal) return;

  const destinationLabel = describeDestination(withdrawal.salon_payout_destinations);
  const amountLabel = `${withdrawal.currency} ${Number(withdrawal.amount).toFixed(2)}`;

  await createTenantNotification(supabase, {
    tenantId: withdrawal.tenant_id,
    type: "payment",
    title: "Withdrawal requested",
    description: `A withdrawal of ${amountLabel} to ${destinationLabel} has been submitted and is pending.`,
    entityType: "withdrawal",
    entityId: withdrawalId,
  });

  if (!options.resendApiKey) return;
  const settings = await getTenantNotificationSettings(supabase, withdrawal.tenant_id);
  if (!settings.email_transaction_alerts) return;

  const recipients = await getSalonRecipients(supabase, withdrawal.tenant_id, ["owner", "manager"]);
  if (recipients.length === 0) return;

  const result = await sendResendEmail({
    resendApiKey: options.resendApiKey,
    fromEmail: options.resendFromEmail || "noreply@salonmagik.com",
    to: recipients.map((r) => r.email),
    subject: `Withdrawal request received — ${amountLabel}`,
    salonName: withdrawal.tenants?.name || undefined,
    salonLogoUrl: withdrawal.tenants?.logo_url,
    htmlContent: `
      <h2 style="color: #2E1F4E; margin-bottom: 16px;">Withdrawal request received</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        A withdrawal of <strong>${amountLabel}</strong> to <strong>${destinationLabel}</strong> has been submitted and is now pending.
      </p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        We'll email you again as soon as it's confirmed.
      </p>
    `,
    log: { supabase, tenantId: withdrawal.tenant_id, templateType: "withdrawal_requested" },
  });
  if (!result.sent) {
    console.warn(`Failed to send withdrawal-requested email for withdrawal ${withdrawalId}:`, result.error);
  }
}

const OUTCOME_COPY: Record<"success" | "failed" | "reversed", { subjectVerb: string; heading: string; body: (amountLabel: string, destinationLabel: string) => string }> = {
  success: {
    subjectVerb: "completed",
    heading: "Withdrawal completed",
    body: (amountLabel, destinationLabel) =>
      `Your withdrawal of <strong>${amountLabel}</strong> to <strong>${destinationLabel}</strong> was successful.`,
  },
  failed: {
    subjectVerb: "failed",
    heading: "Withdrawal failed",
    body: (amountLabel, destinationLabel) =>
      `Your withdrawal of <strong>${amountLabel}</strong> to <strong>${destinationLabel}</strong> could not be completed. The amount has been returned to your salon balance.`,
  },
  reversed: {
    subjectVerb: "reversed",
    heading: "Withdrawal reversed",
    body: (amountLabel, destinationLabel) =>
      `Your withdrawal of <strong>${amountLabel}</strong> to <strong>${destinationLabel}</strong> was reversed by your payout provider. The amount has been returned to your salon balance.`,
  },
};

/**
 * Fires once a withdrawal reaches a final outcome — called after
 * reconcileWithdrawalOutcome (or the rare synchronous creation-time outcome
 * in process-salon-withdrawal) has actually committed the financial state,
 * never before, so the email always matches what the balance shows.
 */
export async function notifyWithdrawalOutcome(
  supabase: any,
  withdrawalId: string,
  outcome: "success" | "failed" | "reversed",
  options: WithdrawalNotificationOptions = {},
): Promise<void> {
  const withdrawal = await fetchWithdrawalForEmail(supabase, withdrawalId);
  if (!withdrawal) return;

  const destinationLabel = describeDestination(withdrawal.salon_payout_destinations);
  const amountLabel = `${withdrawal.currency} ${Number(withdrawal.amount).toFixed(2)}`;
  const copy = OUTCOME_COPY[outcome];

  await createTenantNotification(supabase, {
    tenantId: withdrawal.tenant_id,
    type: "payment",
    title: copy.heading,
    description: `Withdrawal of ${amountLabel} to ${destinationLabel} ${copy.subjectVerb}.`,
    entityType: "withdrawal",
    entityId: withdrawalId,
    urgent: outcome !== "success",
  });

  if (!options.resendApiKey) return;
  const settings = await getTenantNotificationSettings(supabase, withdrawal.tenant_id);
  if (!settings.email_transaction_alerts) return;

  const recipients = await getSalonRecipients(supabase, withdrawal.tenant_id, ["owner", "manager"]);
  if (recipients.length === 0) return;

  const result = await sendResendEmail({
    resendApiKey: options.resendApiKey,
    fromEmail: options.resendFromEmail || "noreply@salonmagik.com",
    to: recipients.map((r) => r.email),
    subject: `${copy.heading} — ${amountLabel}`,
    salonName: withdrawal.tenants?.name || undefined,
    salonLogoUrl: withdrawal.tenants?.logo_url,
    htmlContent: `
      <h2 style="color: #2E1F4E; margin-bottom: 16px;">${copy.heading}</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">${copy.body(amountLabel, destinationLabel)}</p>
    `,
    log: { supabase, tenantId: withdrawal.tenant_id, templateType: "withdrawal_outcome" },
  });
  if (!result.sent) {
    console.warn(`Failed to send withdrawal-outcome email for withdrawal ${withdrawalId}:`, result.error);
  }
}
