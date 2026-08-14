import { createTenantNotification, getSalonRecipients, sendResendEmail } from "./salon-notifications.ts";
import { getSmsCreditPricing } from "./sms-credit-pricing.ts";

/**
 * Called after a message-credit debit. Fires an in-app notification (and
 * email, if a Resend key is available) the first time a tenant's balance
 * drops below the configured threshold — low_balance_alerted_at gates it
 * to once per drop, cleared again on the tenant's next credit purchase.
 */
export async function checkAndAlertLowSmsBalance(
  supabase: any,
  tenantId: string,
  newBalance: number,
  options?: { resendApiKey?: string | null; resendFromEmail?: string | null },
) {
  try {
    const pricing = await getSmsCreditPricing(supabase);
    if (newBalance >= pricing.lowBalanceThresholdCredits) return;

    const { data: creditsRow } = await supabase
      .from("communication_credits")
      .select("low_balance_alerted_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (creditsRow?.low_balance_alerted_at) return;

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, logo_url")
      .eq("id", tenantId)
      .maybeSingle();

    await createTenantNotification(supabase, {
      tenantId,
      type: "messaging_credits",
      title: "Messaging credits running low",
      description: `Only ${newBalance} SMS credits left. Top up to keep sending appointment reminders and messages.`,
      urgent: true,
    });

    if (options?.resendApiKey) {
      const recipients = await getSalonRecipients(supabase, tenantId, ["owner", "manager"]);
      if (recipients.length > 0) {
        await sendResendEmail({
          resendApiKey: options.resendApiKey,
          fromEmail: options.resendFromEmail || "noreply@salonmagik.com",
          to: recipients.map((r: { email: string }) => r.email),
          subject: `Messaging credits running low at ${tenant?.name || "your salon"}`,
          salonName: tenant?.name,
          salonLogoUrl: tenant?.logo_url,
          htmlContent: `
            <h2 style="color: #2563EB; margin-bottom: 16px;">Messaging credits running low</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              You have <strong>${newBalance} SMS credits</strong> left. Once they run out, appointment reminders and other
              messages sent by SMS will stop going out until you top up.
            </p>
          `,
        });
      }
    }

    await supabase
      .from("communication_credits")
      .update({ low_balance_alerted_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);
  } catch (error) {
    console.error("checkAndAlertLowSmsBalance error:", error);
  }
}
