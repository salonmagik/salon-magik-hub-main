// Shared email template utilities for Salon Magik
// Design System: Primary Blue #2563EB, Font: Questrial

export const EMAIL_STYLES = {
  primaryColor: "#2563EB",
  primaryDark: "#1D4ED8",
  textColor: "#1f2937",
  textMuted: "#4b5563",
  textLight: "#6b7280",
  textLighter: "#9ca3af",
  backgroundColor: "#ffffff",
  surfaceColor: "#f5f7fa",
  borderColor: "#e5e7eb",
  fontFamily: "'Questrial', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

// Salon Magik logo URL (hosted publicly)
export const SALON_MAGIK_LOGO_URL = "https://salonmagik.com/favicon.png";

export type BrandingMode = "product" | "salon";
const DEFAULT_PRODUCT_SENDER = "Salon Magik";

interface EmailWrapperOptions {
  /**
   * product  -> Salon Magik system emails (auth, billing, product news)
   * salon    -> Emails triggered by a tenant for their customers (reminders, credits, receipts)
   */
  mode?: BrandingMode;
  salonName?: string;
  salonLogoUrl?: string;
  /** @deprecated use mode === "salon" */
  showSalonBranding?: boolean;
  privacyUrl?: string;
  helpUrl?: string;
}

/**
 * Returns a sender display name consistent with branding rules.
 * product emails -> "Salon Magik"
 * salon emails   -> "<Salon Name> via Salon Magik" (or "Salon Magik" if name missing)
 */
export function getSenderName(options: {
  mode?: BrandingMode;
  salonName?: string;
}): string {
  const mode = options.mode ?? "product";
  if (mode === "salon" && options.salonName) {
    return `${options.salonName} via ${DEFAULT_PRODUCT_SENDER}`;
  }
  return DEFAULT_PRODUCT_SENDER;
}

/**
 * Sanitizes email display names for From headers while preserving real characters.
 * We only strip control chars and header-breaking characters.
 */
export function sanitizeEmailDisplayName(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Standardized From header builder for all outbound email functions.
 */
export function buildFromAddress(options: {
  fromEmail: string;
  mode?: BrandingMode;
  salonName?: string;
}): string {
  const sender = sanitizeEmailDisplayName(
    getSenderName({ mode: options.mode, salonName: options.salonName }),
  ) || DEFAULT_PRODUCT_SENDER;

  return `${sender} <${options.fromEmail}>`;
}

/**
 * Wraps email content with consistent branding
 * - For Salon Magik system emails: Shows Salon Magik logo
 * - For salon-specific customer emails: Shows salon's logo (or name + "Powered by Salon Magik")
 */
export function wrapEmailTemplate(
  content: string,
  options: EmailWrapperOptions = {}
): string {
  const {
    salonName,
    salonLogoUrl,
    showSalonBranding = false,
    mode: explicitMode,
    privacyUrl = "https://salonmagik.com/privacy",
    helpUrl = "mailto:support@salonmagik.com",
  } = options;

  const mode: BrandingMode = explicitMode ?? (showSalonBranding ? "salon" : "product");

  let headerSection: string;

  // If showing salon branding (emails sent to customers from salons)
  if (mode === "salon" && salonLogoUrl) {
    // Salon has a logo - show it with "Powered by" text
    headerSection = `
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${salonLogoUrl}" alt="${salonName || 'Salon'} Logo" style="max-height: 60px; max-width: 200px; margin-bottom: 16px;" />
        ${salonName ? `<p style="color: ${EMAIL_STYLES.textMuted}; font-size: 14px; margin: 0; font-family: ${EMAIL_STYLES.fontFamily};">Powered by Salon Magik</p>` : ''}
      </div>
    `;
  } else if (mode === "salon" && salonName) {
    // Salon branding without logo - show salon name prominently
    headerSection = `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: ${EMAIL_STYLES.primaryColor}; margin: 0 0 8px 0; font-size: 28px; font-family: ${EMAIL_STYLES.fontFamily};">
          ${salonName}
        </h1>
        <p style="color: ${EMAIL_STYLES.textMuted}; font-size: 12px; margin: 0; font-family: ${EMAIL_STYLES.fontFamily};">Powered by Salon Magik</p>
      </div>
    `;
  } else {
    // Default: Salon Magik branding with logo
    headerSection = `
      <div style="text-align: center; margin-bottom: 32px;">
        <img src="${SALON_MAGIK_LOGO_URL}" alt="Salon Magik" style="width: 60px; height: 60px; margin-bottom: 12px; border-radius: 12px;" />
        <h1 style="color: ${EMAIL_STYLES.primaryColor}; font-style: italic; margin: 0; font-size: 28px; font-family: ${EMAIL_STYLES.fontFamily};">
          Salon Magik
        </h1>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salon Magik</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Questrial&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_STYLES.surfaceColor}; font-family: ${EMAIL_STYLES.fontFamily};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px; background-color: ${EMAIL_STYLES.backgroundColor}; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${headerSection}

          <div style="font-family: ${EMAIL_STYLES.fontFamily}; color: ${EMAIL_STYLES.textColor};">
            ${content}
          </div>

          <hr style="border: none; border-top: 1px solid ${EMAIL_STYLES.borderColor}; margin: 32px 0;" />

          <div style="color: ${EMAIL_STYLES.textLighter}; font-size: 12px; text-align: center; line-height: 1.6; font-family: ${EMAIL_STYLES.fontFamily};">
            <p style="margin: 0 0 6px 0;">© 2026 Salon Magik. All rights reserved.</p>
            <p style="margin: 0 0 6px 0;">You’re receiving this because you requested access or use Salon Magik. We never share your data without consent.</p>
            <p style="margin: 0;">
              <a href="${privacyUrl}" style="color: ${EMAIL_STYLES.primaryColor}; text-decoration: none;">Privacy Policy</a>
              ${helpUrl ? ` · <a href="${helpUrl}" style="color: ${EMAIL_STYLES.primaryColor}; text-decoration: none;">Support</a>` : ""}
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Creates a styled CTA button
 */
export function createButton(text: string, href: string): string {
  return `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${href}"
         style="background-color: ${EMAIL_STYLES.primaryColor};
                color: white;
                padding: 14px 28px;
                text-decoration: none;
                border-radius: 8px;
                display: inline-block;
                font-weight: 500;
                font-size: 16px;
                font-family: ${EMAIL_STYLES.fontFamily};">
        ${text}
      </a>
    </div>
  `;
}

/**
 * Creates an info box/card for appointment details, etc.
 */
export function createInfoBox(content: string): string {
  return `
    <div style="background: ${EMAIL_STYLES.surfaceColor}; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid ${EMAIL_STYLES.primaryColor};">
      ${content}
    </div>
  `;
}

/**
 * Creates a warning/alert box
 */
export function createAlertBox(content: string, type: 'warning' | 'info' | 'success' = 'info'): string {
  const colors = {
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    info: { bg: '#dbeafe', border: '#2563eb', text: '#1e40af' },
    success: { bg: '#dcfce7', border: '#16a34a', text: '#166534' },
  };
  const c = colors[type];

  return `
    <div style="background: ${c.bg}; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid ${c.border};">
      <p style="color: ${c.text}; margin: 0; font-size: 14px; font-family: ${EMAIL_STYLES.fontFamily};">
        ${content}
      </p>
    </div>
  `;
}

/**
 * Styled paragraph
 */
export function paragraph(text: string): string {
  return `<p style="color: ${EMAIL_STYLES.textMuted}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0; font-family: ${EMAIL_STYLES.fontFamily};">${text}</p>`;
}

/**
 * Styled heading
 */
export function heading(text: string, level: 2 | 3 = 2): string {
  const size = level === 2 ? '24px' : '20px';
  return `<h${level} style="color: ${EMAIL_STYLES.textColor}; margin: 0 0 16px 0; font-size: ${size}; font-family: ${EMAIL_STYLES.fontFamily};">${text}</h${level}>`;
}

/**
 * Small muted text
 */
export function smallText(text: string): string {
  return `<p style="color: ${EMAIL_STYLES.textLight}; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0; font-family: ${EMAIL_STYLES.fontFamily};">${text}</p>`;
}
