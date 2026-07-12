export type GoogleOAuthSource = "login" | "signup";

export interface GoogleOAuthIntent {
  source: GoogleOAuthSource;
  inviteToken: string | null;
  promoCode?: string | null;
  pendingAction: "resolve" | "continue_signup";
  createdAt: string;
}

const GOOGLE_OAUTH_INTENT_KEY = "salon-admin:google-oauth-intent";
const PENDING_SALES_PROMO_KEY = "salon-admin:pending-sales-promo";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

export function saveGoogleOAuthIntent(intent: GoogleOAuthIntent) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(GOOGLE_OAUTH_INTENT_KEY, JSON.stringify(intent));
}

export function readGoogleOAuthIntent(): GoogleOAuthIntent | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(GOOGLE_OAUTH_INTENT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GoogleOAuthIntent>;
    if (parsed.source !== "login" && parsed.source !== "signup") return null;
    const pendingAction =
      parsed.pendingAction === "continue_signup" ? "continue_signup" : "resolve";

    return {
      source: parsed.source,
      inviteToken: parsed.inviteToken || null,
      promoCode: parsed.promoCode || null,
      pendingAction,
      createdAt: parsed.createdAt || new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearGoogleOAuthIntent() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(GOOGLE_OAUTH_INTENT_KEY);
}

export function savePendingSalesPromoCode(code?: string | null) {
  if (!canUseStorage()) return;
  const normalized = code?.trim().toUpperCase() || "";
  if (!normalized) {
    window.localStorage.removeItem(PENDING_SALES_PROMO_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_SALES_PROMO_KEY, normalized);
}

export function readPendingSalesPromoCode() {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(PENDING_SALES_PROMO_KEY);
}

export function clearPendingSalesPromoCode() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PENDING_SALES_PROMO_KEY);
}

