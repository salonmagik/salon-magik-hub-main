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

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, email, first_name, last_name")
    .in("user_id", userIds);

  if (profileError || !profiles?.length) {
    if (profileError) console.error("Failed to fetch salon recipient profiles:", profileError);
    return [];
  }

  const roleByUserId = new Map(
    roleRows.map((row: { user_id: string; role: string }) => [row.user_id, row.role]),
  );

  return profiles
    .filter((profile: { email?: string | null }) => Boolean(profile.email))
    .map((profile: { user_id: string; email: string; first_name?: string | null; last_name?: string | null }) => ({
      userId: profile.user_id,
      email: profile.email,
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
      role: roleByUserId.get(profile.user_id),
    }));
}

export async function getTenantNotificationSettings(
  supabase: SupabaseLike,
  tenantId: string,
): Promise<TenantNotificationSettings> {
  const { data } = await supabase
    .from("notification_settings")
    .select("email_new_bookings, email_cancellations")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    email_new_bookings: data?.email_new_bookings ?? true,
    email_cancellations: data?.email_cancellations ?? true,
  };
}

export async function createTenantNotification(
  supabase: SupabaseLike,
  input: {
    tenantId: string;
    title: string;
    description: string;
    entityId?: string | null;
    urgent?: boolean;
  },
) {
  const { error } = await supabase.from("notifications").insert({
    tenant_id: input.tenantId,
    type: "appointment",
    title: input.title,
    description: input.description,
    entity_type: "appointment",
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
