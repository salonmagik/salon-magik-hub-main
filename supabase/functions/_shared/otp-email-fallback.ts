import type { createClient } from "npm:@supabase/supabase-js@2";
import { wrapEmailTemplate, paragraph, heading, smallText, buildFromAddress } from "./email-template.ts";

type AdminClient = ReturnType<typeof createClient>;

const PLACEHOLDER_EMAIL_DOMAIN = "@phone.internal.salonmagik.com";

function buildFallbackTemplate(otp: string, ttlMinutes: number) {
  const content = `
    ${heading("Your one-time code")}
    ${paragraph("We tried texting this to your phone too — use whichever arrives first.")}
    <div style="margin: 28px 0; text-align: center;">
      <div style="
        display: inline-block;
        padding: 16px 24px;
        border-radius: 12px;
        background: #f5f7fa;
        border: 1px solid #e5e7eb;
        color: #1f2937;
        font-size: 32px;
        letter-spacing: 8px;
        font-weight: 600;
      ">${otp}</div>
    </div>
    ${paragraph(`Valid for ${ttlMinutes} minutes.`)}
    ${smallText("If you didn't request this, you can ignore this email.")}
  `;
  return wrapEmailTemplate(content, { mode: "product" });
}

/**
 * Best-effort email delivery of an SMS OTP code, alongside the SMS send —
 * not instead of it. SMS providers (Arkesel here) can be slow or briefly
 * unavailable; sending the same code by email in parallel gives the user a
 * second path in without waiting on SMS delivery confirmation, which is
 * unreliable to detect server-side anyway. Never throws — a failure here
 * must not block the SMS send it's backing up.
 */
export async function sendOtpEmailFallback(
  admin: AdminClient,
  userId: string,
  otp: string,
  ttlMinutes: number,
): Promise<void> {
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return;

    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return;

    const email = data.user.email;
    if (email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) return; // not a real, deliverable address

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@salonmagik.com";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: buildFromAddress({ mode: "product", fromEmail }),
        to: [email],
        subject: "Your Salon Magik one-time code",
        html: buildFallbackTemplate(otp, ttlMinutes),
      }),
    });
    if (!response.ok) {
      console.error("[otp-email-fallback] resend error:", await response.text());
    }
  } catch (err) {
    console.error("[otp-email-fallback] unexpected error:", err);
  }
}
