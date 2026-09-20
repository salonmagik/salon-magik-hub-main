import { buildFromAddress, wrapEmailTemplate } from "./email-template.ts";

interface SupabaseLike {
  from: (table: string) => any;
}

export interface SalonRecipient {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
}

export interface TenantNotificationSettings {
  email_new_bookings: boolean;
  email_cancellations: boolean;
  email_transaction_alerts: boolean;
  in_app_transaction_alerts: boolean;
}

export async function getSalonRecipients(
  supabase: SupabaseLike,
  tenantId: string,
  roles: string[] = ["owner", "manager"],
): Promise<SalonRecipient[]> {
  const { data: allRoleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id, role, is_active")
    .eq("tenant_id", tenantId)
    .in("role", roles);

  if (roleError || !allRoleRows?.length) {
    if (roleError) console.error("Failed to fetch salon recipients:", roleError);
    return [];
  }

  // A deactivated owner (support's only undo for a mistaken co-owner grant)
  // must stop receiving the salon's mail, same as it stops holding RLS
  // ownership (AD-10).
  const roleRows = allRoleRows.filter((row: { is_active: boolean | null }) => row.is_active ?? true);
  if (roleRows.length === 0) return [];

  const userIds: string[] = [
    ...new Set(roleRows.map((row: { user_id: string }) => row.user_id).filter(Boolean)),
  ] as string[];
  if (userIds.length === 0) return [];

  // Get profiles for full_name
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", userIds);

  const profileByUserId = new Map(
    (profiles || []).map((p: { user_id: string; full_name: string }) => [p.user_id, p.full_name]),
  );

  const roleByUserId = new Map(
    roleRows.map((row: { user_id: string; role: string }) => [row.user_id, row.role]),
  );

  // Fetch emails from auth.users using the Supabase Admin API
  const recipients: SalonRecipient[] = [];

  for (const userId of userIds) {
    try {
      // @ts-expect-error - admin property exists on service role client
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

      if (authError) {
        console.error(`Failed to fetch auth user ${userId}:`, authError);
        continue;
      }

      if (authUser?.user?.email) {
        const fullName = profileByUserId.get(userId) as string | undefined;
        // Parse first/last name from full_name
        const nameParts = fullName?.split(" ") || [];
        const firstName = nameParts[0] || null;
        const lastName = nameParts.slice(1).join(" ") || null;

        recipients.push({
          userId,
          email: authUser.user.email,
          firstName,
          lastName,
          role: roleByUserId.get(userId) as string | undefined,
        });
      }
    } catch (err) {
      console.error(`Exception fetching user ${userId}:`, err);
    }
  }

  return recipients;
}

export async function getTenantNotificationSettings(
  supabase: SupabaseLike,
  tenantId: string,
): Promise<TenantNotificationSettings> {
  const { data } = await supabase
    .from("notification_settings")
    .select("email_new_bookings, email_cancellations, email_transaction_alerts, in_app_transaction_alerts")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    email_new_bookings: data?.email_new_bookings ?? true,
    email_cancellations: data?.email_cancellations ?? true,
    email_transaction_alerts: data?.email_transaction_alerts ?? true,
    in_app_transaction_alerts: data?.in_app_transaction_alerts ?? true,
  };
}

export async function createTenantNotification(
  supabase: SupabaseLike,
  input: {
    tenantId: string;
    type?: string;
    title: string;
    description: string;
    entityType?: string | null;
    entityId?: string | null;
    urgent?: boolean;
    isGifted?: boolean;
  },
) {
  const { error } = await supabase.from("notifications").insert({
    tenant_id: input.tenantId,
    type: input.type ?? "appointment",
    title: input.title,
    description: input.description,
    entity_type: input.entityType ?? "appointment",
    entity_id: input.entityId ?? null,
    urgent: input.urgent ?? false,
    is_gifted: input.isGifted ?? false,
  });

  if (error) {
    console.error("Failed to create tenant notification:", error);
  }
}

/** Machine-readable class of a failed send, for grouping (AD-3). */
export type EmailFailureKind =
  | "config"     // RESEND_API_KEY absent/empty
  | "auth"       // Resend 401/403
  | "recipient"  // Resend 422 / invalid address
  | "provider"   // any other non-2xx from Resend
  | "network";   // fetch threw

export interface EmailSendResult {
  sent: boolean;
  /** Provider message id, when the send succeeded. */
  messageId?: string;
  /** Classified, human-readable reason. Absent when sent. */
  error?: string;
  /** Machine-readable class, for grouping. Absent when sent. */
  errorKind?: EmailFailureKind;
}

/**
 * Fixed template_type taxonomy for callers of the shared sender (AD-6).
 * `appointment_reminder` is not here — it belongs to
 * send-appointment-notification, which is not a caller of this helper.
 */
export type EmailTemplateType =
  | "daily_digest"
  | "booking_confirmation_customer"
  | "booking_gift_recipient"
  | "booking_notification_salon"
  | "booking_cancelled_salon"
  | "low_balance_alert"
  | "payout_destination_changed"
  | "withdrawal_requested"
  | "payment_alert";

export interface EmailLogContext {
  supabase: SupabaseLike;        // service-role client, bypasses RLS
  tenantId: string;
  templateType: EmailTemplateType;
  customerId?: string | null;    // when the recipient is a customer
  initiatedBy?: "system" | "salon";  // default "system"
}

const MAX_ERROR_MESSAGE_LENGTH = 1000;

function classifyResendFailure(status: number): EmailFailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 422) return "recipient";
  return "provider";
}

async function writeEmailLogRows(
  log: EmailLogContext,
  recipients: string[],
  outcome: { status: "sent" | "failed"; errorMessage?: string },
): Promise<void> {
  // A missing tenant id must not turn into a failed withdrawal/booking —
  // skip the audit row, never throw (§9).
  if (!log.tenantId) {
    console.error("sendResendEmail: missing log.tenantId, skipping message_logs write");
    return;
  }

  const now = new Date().toISOString();
  const rows = recipients.map((recipient) => ({
    tenant_id: log.tenantId,
    customer_id: log.customerId ?? null,
    channel: "email",
    template_type: log.templateType,
    recipient,
    status: outcome.status,
    sent_at: outcome.status === "sent" ? now : null,
    provider: "resend",
    initiated_by: log.initiatedBy ?? "system",
    credits_used: 0,
    error_message: outcome.errorMessage
      ? outcome.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH)
      : null,
  }));

  const { error } = await log.supabase.from("message_logs").insert(rows);
  if (error) {
    // Logging must never mask or invert the actual delivery outcome (§10)
    // — the caller already has its EmailSendResult regardless of this.
    console.error("sendResendEmail: failed to write message_logs row(s):", error);
  }
}

export async function sendResendEmail(input: {
  resendApiKey?: string | null;
  fromEmail: string;
  to: string[];
  subject: string;
  htmlContent: string;
  salonName?: string;
  salonLogoUrl?: string | null;
  log: EmailLogContext;
}): Promise<EmailSendResult> {
  const recipients = input.to.map((address) => address.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { sent: false, error: "recipient: no recipients" };
  }

  if (!input.resendApiKey) {
    const errorMessage = "config: RESEND_API_KEY not configured";
    await writeEmailLogRows(input.log, recipients, { status: "failed", errorMessage });
    return { sent: false, error: errorMessage, errorKind: "config" };
  }

  const html = wrapEmailTemplate(input.htmlContent, {
    mode: "salon",
    salonName: input.salonName,
    salonLogoUrl: input.salonLogoUrl ?? undefined,
  });

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: buildFromAddress({
          fromEmail: input.fromEmail,
          mode: "salon",
          salonName: input.salonName,
        }),
        to: recipients,
        subject: input.subject,
        html,
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const errorMessage = `network: ${detail}`;
    await writeEmailLogRows(input.log, recipients, { status: "failed", errorMessage });
    return { sent: false, error: errorMessage, errorKind: "network" };
  }

  if (!response.ok) {
    const body = await response.text();
    const errorKind = classifyResendFailure(response.status);
    const errorMessage = `${errorKind}: ${body}`;
    await writeEmailLogRows(input.log, recipients, { status: "failed", errorMessage });
    return { sent: false, error: errorMessage, errorKind };
  }

  const data = await response.json().catch(() => ({}));
  const messageId = typeof data?.id === "string" ? data.id : undefined;
  await writeEmailLogRows(input.log, recipients, { status: "sent" });
  return { sent: true, messageId };
}
