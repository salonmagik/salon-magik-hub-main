export type OrderKind = "order" | "package" | "booking";

interface ClassifiableServiceItem {
  package_id?: string | null;
}

interface ClassifiableOrder {
  services?: ClassifiableServiceItem[] | null;
  products?: unknown[] | null;
}

/**
 * What to call a purchase everywhere it's surfaced (list rows, detail pages,
 * notifications, emails) -- a pure product cart is an "order", a pure
 * package cart is a "package purchase", anything with a real (non-package)
 * service in it, including mixed carts, stays a "booking". Mirrors the
 * classification in create-public-booking/index.ts so the client-portal's
 * terminology matches what the salon and customer already saw at checkout.
 */
export function classifyOrderKind({ services, products }: ClassifiableOrder): OrderKind {
  const hasPlainService = (services || []).some((s) => !s.package_id);
  const hasPackageService = (services || []).some((s) => !!s.package_id);
  const hasProducts = (products || []).length > 0;

  if (hasProducts && !hasPlainService && !hasPackageService) return "order";
  if (hasPackageService && !hasPlainService && !hasProducts) return "package";
  return "booking";
}

export function orderKindNoun(kind: OrderKind): string {
  return kind === "order" ? "order" : kind === "package" ? "package purchase" : "booking";
}

export function orderKindNounCap(kind: OrderKind): string {
  return kind === "order" ? "Order" : kind === "package" ? "Package purchase" : "Booking";
}

export function orderKindArticle(kind: OrderKind): "an" | "a" {
  return kind === "order" ? "an" : "a";
}
