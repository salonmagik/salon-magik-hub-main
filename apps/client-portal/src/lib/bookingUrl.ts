// A salon's "website" from a customer's perspective is its public booking
// page, at <slug>.<booking domain>. Mirrors apps/salon-admin/src/lib/bookingUrl.ts
// (kept as a small local copy rather than a shared import since the two apps
// don't currently share a lib path for this).
const DEFAULT_BOOKING_DOMAIN = "salonmagik.com";
const STAGING_BOOKING_DOMAIN = "staging.salonmagik.com";

function inferBookingBaseDomainFromHost(hostname?: string | null): string {
  if ((hostname || "").toLowerCase().includes("staging")) {
    return STAGING_BOOKING_DOMAIN;
  }
  return DEFAULT_BOOKING_DOMAIN;
}

export function buildPublicBookingUrl(slug?: string | null): string | null {
  if (!slug) return null;
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  const configuredDomain = (import.meta.env.VITE_PUBLIC_BOOKING_BASE_DOMAIN as string | undefined)
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  const baseDomain = configuredDomain || inferBookingBaseDomainFromHost(window.location.hostname);

  return `https://${cleanSlug}.${baseDomain}`;
}
