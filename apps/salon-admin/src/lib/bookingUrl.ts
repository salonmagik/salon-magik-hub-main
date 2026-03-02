const DEFAULT_BOOKING_DOMAIN = "salonmagik.com";
const STAGING_BOOKING_DOMAIN = "staging.salonmagik.com";
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function normalizeBookingBaseDomain(raw?: string | null): string | null {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\*\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();

  if (!normalized || !DOMAIN_PATTERN.test(normalized)) return null;
  return normalized;
}

export function inferBookingBaseDomainFromHost(hostname?: string | null): string {
  if ((hostname || "").toLowerCase().includes("staging")) {
    return STAGING_BOOKING_DOMAIN;
  }
  return DEFAULT_BOOKING_DOMAIN;
}

export function resolveBookingBaseDomain(options?: {
  configuredDomain?: string | null;
  hostname?: string | null;
}): string {
  const normalized = normalizeBookingBaseDomain(options?.configuredDomain);
  if (normalized) return normalized;
  return inferBookingBaseDomainFromHost(options?.hostname);
}

export function buildPublicBookingUrl(
  slug?: string | null,
  options?: { configuredDomain?: string | null; hostname?: string | null }
): string | null {
  if (!slug) return null;
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  const baseDomain = resolveBookingBaseDomain(options);
  return `https://${cleanSlug}.${baseDomain}`;
}

