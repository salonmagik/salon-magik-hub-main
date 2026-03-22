const DEFAULT_BOOKING_DOMAIN = "salonmagik.com";

function normalizeBaseDomain(raw?: string): string {
  return (
    raw
      ?.replace(/^https?:\/\//i, "")
      .replace(/^\*\./, "")
      .replace(/\/+$/, "")
      .toLowerCase() || DEFAULT_BOOKING_DOMAIN
  );
}

export function resolveSlugFromHostname(hostname: string, configuredBaseDomain?: string): string | null {
  const baseDomain = normalizeBaseDomain(configuredBaseDomain);
  const normalizedHost = hostname.toLowerCase();

  if (!normalizedHost || normalizedHost === "localhost") return null;
  if (!normalizedHost.endsWith(`.${baseDomain}`)) return null;

  const prefix = normalizedHost.slice(0, -(baseDomain.length + 1));
  if (!prefix) return null;
  const [slug] = prefix.split(".");
  return slug || null;
}

export function resolveSlugFromQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const slug = params.get("slug")?.trim().toLowerCase();
  return slug || null;
}

export function resolvePublicBookingSlug(options: {
  routeSlug?: string;
  hostname: string;
  search: string;
  configuredBaseDomain?: string;
  isDev: boolean;
}): string | undefined {
  const routeSlug = options.routeSlug?.trim().toLowerCase();
  const subdomainSlug = resolveSlugFromHostname(options.hostname, options.configuredBaseDomain);
  const querySlug =
    options.isDev && !routeSlug && !subdomainSlug ? resolveSlugFromQuery(options.search) : null;

  return routeSlug || subdomainSlug || querySlug || undefined;
}

