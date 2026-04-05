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
  email_daily_digest: boolean;
}

export async function getSalonRecipients(
  supabase: SupabaseLike,
  tenantId: string,
  roles: string[] = ["owner", "manager"],
): Promise<SalonRecipient[]> {
  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", roles);

  if (roleError || !roleRows?.length) {
    if (roleError) console.error("Failed to fetch salon recipients:", roleError);
    return [];
  }

  const userIds = [...new Set(roleRows.map((row: { user_id: string }) => row.user_id).filter(Boolean))];
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
        const fullName = profileByUserId.get(userId);
        // Parse first/last name from full_name
        const nameParts = fullName?.split(" ") || [];
        const firstName = nameParts[0] || null;
        const lastName = nameParts.slice(1).join(" ") || null;

        recipients.push({
          userId,
          email: authUser.user.email,
          firstName,
          lastName,
          role: roleByUserId.get(userId),
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
    .select("email_new_bookings, email_cancellations, email_transaction_alerts, in_app_transaction_alerts, email_daily_digest")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    email_new_bookings: data?.email_new_bookings ?? true,
    email_cancellations: data?.email_cancellations ?? true,
    email_transaction_alerts: data?.email_transaction_alerts ?? true,
    in_app_transaction_alerts: data?.in_app_transaction_alerts ?? true,
    email_daily_digest: data?.email_daily_digest ?? false,
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
  });

  if (error) {
    console.error("Failed to create tenant notification:", error);
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
}) {
  if (!input.resendApiKey || input.to.length === 0) return;

  const html = wrapEmailTemplate(input.htmlContent, {
    mode: "salon",
    salonName: input.salonName,
    salonLogoUrl: input.salonLogoUrl ?? undefined,
  });

  const response = await fetch("https://api.resend.com/emails", {
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
      to: input.to,
      subject: input.subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Failed to send email:", body);
  }
}
