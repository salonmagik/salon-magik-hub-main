import { paragraph, heading, createInfoBox, createButton, wrapEmailTemplate, buildFromAddress } from "./email-template.ts";
import { buildReceiptPdf } from "./pdf-receipt.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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
  const reference = options.reference || `SUB-${Date.now()}`;

  // Salon Magik's own branding here, not the tenant's — this is Salon Magik
  // billing the salon, not the salon billing a customer, even though the
  // email wrapper around it (wrapEmailTemplate above) intentionally stays
  // "salon" mode so the email itself still feels personalized.
  let attachments: { filename: string; content: string }[] | undefined;
  try {
    const pdfBytes = await buildReceiptPdf({
      brand: "product",
      brandName: "Salon Magik",
      brandSubtitle: "Subscription billing",
      reference,
      billedToName: options.salonName,
      billedToLines: [],
      paymentLines: [reference],
      lineItems: options.lineItems,
      total: options.total,
      currency: options.currency,
      statusLabel: "PAID",
      statusTone: "success",
      footerThanks: "Thanks for growing with Salon Magik.",
      footerLines: ["Salon Magik is a product of The Gray Avenue LTD", "billing@salonmagik.com · salonmagik.com"],
    });
    attachments = [{ filename: `receipt-${reference}.pdf`, content: encodeBase64(pdfBytes) }];
  } catch (pdfError) {
    // A receipt email without its PDF attached is still useful — never let
    // PDF rendering block the email itself from sending.
    console.error("sendReceiptEmail: PDF generation failed", pdfError);
  }

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
        ...(attachments ? { attachments } : {}),
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

export interface SendPaymentFailedEmailOptions {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
  amount: number;
  currency: string;
  updatePaymentMethodUrl: string;
}

/**
 * Sent when recurring subscription/add-on billing has stopped retrying (see
 * MAX_RETRY_ATTEMPTS in process-recurring-addon-billing) — the owner needs to
 * take action, since the cron won't try again on its own past this point.
 */
export async function sendPaymentFailedEmail(options: SendPaymentFailedEmailOptions): Promise<{ sent: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error("sendPaymentFailedEmail: RESEND_API_KEY not configured");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const content = `
    ${heading("We couldn't bill your card")}
    ${paragraph(
      `We tried a few times to charge ${formatMoney(options.amount, options.currency)} for ${options.salonName}'s Salon Magik subscription, but your card didn't go through. We've stopped retrying so you're not charged unexpectedly — update your payment method and we'll pick up billing again right away.`,
    )}
    ${createButton("Update payment method", options.updatePaymentMethodUrl)}
    ${paragraph("If this keeps happening, reply to this email and we'll help sort it out.")}
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
        subject: "Action needed: update your Salon Magik payment method",
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("sendPaymentFailedEmail: Resend error", errBody);
      return { sent: false, error: errBody };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error sending payment-failed email";
    console.error("sendPaymentFailedEmail: exception", error);
    return { sent: false, error: message };
  }
}

async function sendResendEmail(options: {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
  subject: string;
  html: string;
  logLabel: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error(`${options.logLabel}: RESEND_API_KEY not configured`);
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

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
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`${options.logLabel}: Resend error`, errBody);
      return { sent: false, error: errBody };
    }

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown error in ${options.logLabel}`;
    console.error(`${options.logLabel}: exception`, error);
    return { sent: false, error: message };
  }
}

export interface SendCancellationConfirmationEmailOptions {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
  accessEndDate: string; // ISO date
  manageSubscriptionUrl: string;
}

/** Sent when an owner requests end-of-period cancellation (request_subscription_cancellation). */
export async function sendCancellationConfirmationEmail(
  options: SendCancellationConfirmationEmailOptions,
): Promise<{ sent: boolean; error?: string }> {
  const accessEndLabel = new Date(options.accessEndDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const content = `
    ${heading("Your subscription cancellation is confirmed")}
    ${paragraph(
      `We're sorry to see ${options.salonName} go. You'll keep full access until ${accessEndLabel} — after that, billing stops and your storefront and bookings will be disabled.`,
    )}
    ${paragraph("Changed your mind? You can reverse this at any time before then, with no new payment required.")}
    ${createButton("Manage subscription", options.manageSubscriptionUrl)}
  `;

  const htmlBody = wrapEmailTemplate(content, {
    mode: "salon",
    salonName: options.salonName,
    salonLogoUrl: options.salonLogoUrl || undefined,
  });

  return sendResendEmail({
    recipientEmail: options.recipientEmail,
    salonName: options.salonName,
    subject: `Your Salon Magik subscription is set to cancel on ${accessEndLabel}`,
    html: htmlBody,
    logLabel: "sendCancellationConfirmationEmail",
  });
}

export interface SendDunningReminderEmailOptions {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
  amount: number;
  currency: string;
  graceEndsAt: string; // ISO date
  updatePaymentMethodUrl: string;
}

/**
 * Sent at each configured dunning threshold during the grace window (see
 * BILLING_GRACE_PERIOD_DAYS and billing_dunning_notices) — escalating
 * reminders that a suspension is coming.
 */
export async function sendDunningReminderEmail(
  options: SendDunningReminderEmailOptions,
): Promise<{ sent: boolean; error?: string }> {
  const deadlineLabel = new Date(options.graceEndsAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const content = `
    ${heading("Your Salon Magik subscription is still past due")}
    ${paragraph(
      `${options.salonName} owes ${formatMoney(options.amount, options.currency)} on Salon Magik. Update your payment method by ${deadlineLabel} to keep your storefront and bookings running — after that date your account will be suspended.`,
    )}
    ${createButton("Settle now", options.updatePaymentMethodUrl)}
  `;

  const htmlBody = wrapEmailTemplate(content, {
    mode: "salon",
    salonName: options.salonName,
    salonLogoUrl: options.salonLogoUrl || undefined,
  });

  return sendResendEmail({
    recipientEmail: options.recipientEmail,
    salonName: options.salonName,
    subject: `Action needed: ${formatMoney(options.amount, options.currency)} past due on your Salon Magik account`,
    html: htmlBody,
    logLabel: "sendDunningReminderEmail",
  });
}

export interface SendSuspensionEmailOptions {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
  amount: number;
  currency: string;
  updatePaymentMethodUrl: string;
}

/** Sent when the grace period expires unsettled and the tenant is suspended. */
export async function sendSuspensionEmail(
  options: SendSuspensionEmailOptions,
): Promise<{ sent: boolean; error?: string }> {
  const content = `
    ${heading("Your Salon Magik account has been suspended")}
    ${paragraph(
      `We couldn't collect the ${formatMoney(options.amount, options.currency)} owed on ${options.salonName}'s Salon Magik subscription, so your public storefront and new bookings are now disabled. Your existing data is safe and you can still sign in to read and export it.`,
    )}
    ${paragraph("Pay the outstanding amount at any time to restore full access immediately.")}
    ${createButton("Restore access", options.updatePaymentMethodUrl)}
  `;

  const htmlBody = wrapEmailTemplate(content, {
    mode: "salon",
    salonName: options.salonName,
    salonLogoUrl: options.salonLogoUrl || undefined,
  });

  return sendResendEmail({
    recipientEmail: options.recipientEmail,
    salonName: options.salonName,
    subject: "Your Salon Magik account has been suspended",
    html: htmlBody,
    logLabel: "sendSuspensionEmail",
  });
}

export interface SendReactivationEmailOptions {
  recipientEmail: string;
  salonName: string;
  salonLogoUrl?: string | null;
}

/** Sent when a past_due or suspended tenant settles and returns to active. */
export async function sendReactivationEmail(
  options: SendReactivationEmailOptions,
): Promise<{ sent: boolean; error?: string }> {
  const content = `
    ${heading("You're back in business")}
    ${paragraph(
      `${options.salonName}'s Salon Magik account is active again — your storefront and bookings are fully restored, and billing continues as normal.`,
    )}
  `;

  const htmlBody = wrapEmailTemplate(content, {
    mode: "salon",
    salonName: options.salonName,
    salonLogoUrl: options.salonLogoUrl || undefined,
  });

  return sendResendEmail({
    recipientEmail: options.recipientEmail,
    salonName: options.salonName,
    subject: "Your Salon Magik account is active again",
    html: htmlBody,
    logLabel: "sendReactivationEmail",
  });
}
