import { paragraph, heading, createInfoBox, wrapEmailTemplate, buildFromAddress } from "./email-template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

export interface ReceiptLineItem {
  label: string;
  amount: number;
}

export interface SendReceiptEmailOptions {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
  title: string;
  lineItems: ReceiptLineItem[];
  total: number;
  currency: string;
  reference?: string;
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Sends a branded receipt email for any paid action (plan change, seat/branch
 * add-ons, theme purchase, recurring add-on charge). Every payment success
 * path should call this so receipts stay consistent across the app.
 */
export async function sendReceiptEmail(options: SendReceiptEmailOptions): Promise<{ sent: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error("sendReceiptEmail: RESEND_API_KEY not configured");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const lineItemsHtml = options.lineItems
    .map(
      (item) =>
        `<tr><td style="padding: 6px 0; color: #4b5563;">${item.label}</td><td style="padding: 6px 0; text-align: right; color: #111827;">${formatMoney(item.amount, options.currency)}</td></tr>`
    )
    .join("");

  const content = `
    ${heading(options.title)}
    ${paragraph(`Thanks for your payment. Here's a summary of what was charged${options.salonName ? ` for ${options.salonName}` : ""}.`)}
    ${createInfoBox(`
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        ${lineItemsHtml}
        <tr><td colspan="2" style="border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 10px;"></td></tr>
        <tr>
          <td style="padding: 6px 0; font-weight: 700; color: #111827;">Total charged</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #111827;">${formatMoney(options.total, options.currency)}</td>
        </tr>
      </table>
    `)}
    ${options.reference ? paragraph(`Reference: ${options.reference}`) : ""}
  `;

  const htmlBody = wrapEmailTemplate(content, {
    mode: "salon",
    salonName: options.salonName,
    salonLogoUrl: options.salonLogoUrl || undefined,
  });

  const fromEmail = Deno.env.get("RECEIPTS_FROM_EMAIL") || Deno.env.get("DEFAULT_FROM_EMAIL") || "billing@salonmagik.com";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "salon", salonName: options.salonName, fromEmail }),
        to: [options.recipientEmail],
        subject: options.title,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("sendReceiptEmail: Resend error", errBody);
      return { sent: false, error: errBody };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error sending receipt";
    console.error("sendReceiptEmail: exception", error);
    return { sent: false, error: message };
  }
}
