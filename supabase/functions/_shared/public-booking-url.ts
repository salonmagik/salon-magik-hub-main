// Mirrors apps/salon-admin/src/lib/bookingUrl.ts's buildPublicBookingUrl —
// the public-booking app resolves a tenant purely from the request's
// subdomain (see apps/public-booking/src/lib/slugResolution.ts), so any
// link handed to a customer must be https://{slug}.{baseDomain}, never a
// query param (only honored in local dev there, ignored in production).
const DEFAULT_BOOKING_DOMAIN = "salonmagik.com";

export function buildPublicBookingUrl(slug?: string | null): string | null {
  if (!slug) return null;
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  const baseDomain = Deno.env.get("PUBLIC_BOOKING_BASE_DOMAIN") || DEFAULT_BOOKING_DOMAIN;
  return `https://${cleanSlug}.${baseDomain}`;
}
