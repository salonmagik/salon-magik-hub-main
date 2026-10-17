// Shared by send-refund-request-notification (customer just asked for a
// refund) and refund-via-paystack (the refund was just recorded/completed)
// -- same two-recipient shape (customer + salon owners/managers) in both
// cases, just different copy. Kept out of each caller so there's one place
// that knows the email layout, not two copies that can drift.
import { buildFromAddress, createButton, createInfoBox, heading, paragraph, wrapEmailTemplate } from "./email-template.ts";
import { getSalonRecipients, getTenantNotificationSettings } from "./salon-notifications.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type RefundEmailMode = "requested" | "completed";

export interface RefundEmailParams {
  mode: RefundEmailMode;
  tenantId: string;
  tenantName: string;
  tenantLogoUrl?: string | null;
  customerEmail: string | null;
  customerName: string;
  amount: number;
  currency: string;
  reason: string;
  /** Only meaningful for mode "completed". */
  refundDestination?: "store_credit" | "offline";
  fromEmail: string;
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

async function sendEmail(to: string, subject: string, html: string, fromAddress: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set, skipping refund email to", to);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress, to: [to], subject, html }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.error("Refund email failed to send:", to, body);
    }
  } catch (error) {
    console.error("Refund email threw while sending:", to, error);
  }
}

/** Fire-and-forget by design -- a failed email must never undo or block a refund request/completion that already succeeded in the database. */
export async function sendRefundEmails(supabase: SupabaseLike, params: RefundEmailParams): Promise<void> {
  const amountText = formatAmount(params.amount, params.currency);
  const fromAddress = buildFromAddress({ mode: "salon", salonName: params.tenantName, fromEmail: params.fromEmail });

  const customerSubject =
    params.mode === "requested"
      ? `We've received your refund request at ${params.tenantName}`
      : `Your refund from ${params.tenantName} has been processed`;
  const customerBody =
    params.mode === "requested"
      ? `${heading("Refund request received")}${paragraph(
          `Hi ${params.customerName}, we've received your request to refund <strong>${amountText}</strong> from <strong>${params.tenantName}</strong>.`,
        )}${createInfoBox(`<p style="margin:0;"><strong>Reason:</strong> ${params.reason}</p>`)}${paragraph(
          "The salon will review this shortly. We'll let you know once it's been processed.",
        )}`
      : `${heading("Refund processed")}${paragraph(
          `Hi ${params.customerName}, <strong>${amountText}</strong> from <strong>${params.tenantName}</strong> has been refunded.`,
        )}${createInfoBox(
          params.refundDestination === "store_credit"
            ? `<p style="margin:0;">This amount is now available as salon credit in your account.</p>`
            : `<p style="margin:0;">This was recorded as a cash or transfer refund, handled directly by the salon.</p>`,
        )}`;

  if (params.customerEmail) {
    const customerHtml = wrapEmailTemplate(customerBody, {
      mode: "salon",
      salonName: params.tenantName,
      salonLogoUrl: params.tenantLogoUrl ?? undefined,
    });
    await sendEmail(params.customerEmail, customerSubject, customerHtml, fromAddress);
  }

  const settings = await getTenantNotificationSettings(supabase, params.tenantId);
  if (!settings.email_transaction_alerts) return;

  const recipients = await getSalonRecipients(supabase, params.tenantId);
  if (recipients.length === 0) return;

  const salonSubject =
    params.mode === "requested"
      ? `Refund request from ${params.customerName}`
      : `Refund processed for ${params.customerName}`;
  const salonBody =
    params.mode === "requested"
      ? `${heading("A customer requested a refund")}${paragraph(
          `${params.customerName} requested a <strong>${amountText}</strong> refund.`,
        )}${createInfoBox(`<p style="margin:0;"><strong>Reason:</strong> ${params.reason}</p>`)}${paragraph(
          "Review and approve or decline it from Cashflow.",
        )}${createButton("Review in Cashflow", "https://app.salonmagik.com/salon/transactions")}`
      : `${heading("Refund processed")}${paragraph(
          `A <strong>${amountText}</strong> refund for ${params.customerName} was recorded as ${
            params.refundDestination === "store_credit" ? "salon credit" : "a cash or transfer refund"
          }.`,
        )}`;

  for (const recipient of recipients) {
    const salonHtml = wrapEmailTemplate(salonBody, {
      mode: "salon",
      salonName: params.tenantName,
      salonLogoUrl: params.tenantLogoUrl ?? undefined,
    });
    await sendEmail(recipient.email, salonSubject, salonHtml, fromAddress);
  }
}
