import { format } from "date-fns";

// Shared chip/status styling for the Bookings & Orders redesign (dashboard,
// the three full-list pages, and the two detail dialogs). Kept in one place
// so a status's color never drifts between the dashboard preview and its
// full list / detail view.

export interface StatusMeta {
  label: string;
  className: string;
}

// appointment_products.fulfillment_status: pending | ready | fulfilled | cancelled.
// There is no pickup-vs-delivery column anywhere in the schema, so this is
// status-only, exactly as the design shows it.
export const PRODUCT_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: "Pending", className: "text-[#92400E] bg-[#FEF3C7]" },
  ready: { label: "Ready", className: "text-[#1E40AF] bg-[#DBEAFE]" },
  fulfilled: { label: "Fulfilled", className: "text-[#15834B] bg-[#E8F8EE]" },
  cancelled: { label: "Cancelled", className: "text-[#991B1B] bg-[#FEE2E2]" },
};

export function productStatusMeta(status: string): StatusMeta {
  return PRODUCT_STATUS_META[status] || { label: status, className: "text-muted-foreground bg-muted" };
}

// A package entitlement's expiry badge. expires_at is nullable - a package
// can have no expiry at all, and that's shown as "No expiry", never an
// invented date. status can already be the literal 'expired', but a row
// whose expires_at has quietly passed without the backend having flipped
// status yet should still read as expired here.
export function packageExpiryMeta(
  expiresAt: string | null,
  status: string,
): StatusMeta {
  const pastExpiry = expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
  if (status === "expired" || pastExpiry) {
    return { label: "Expired", className: "text-[#991B1B] bg-[#FEE2E2]" };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", className: "text-[#6B6478] bg-[#F0ECE1]" };
  }
  if (status === "refunded") {
    return { label: "Refunded", className: "text-[#6B6478] bg-[#F0ECE1]" };
  }
  if (expiresAt === null) {
    return { label: "No expiry", className: "text-[#6B6478] bg-[#F0ECE1]" };
  }
  return { label: `Expires ${format(new Date(expiresAt), "d MMM yyyy")}`, className: "text-[#92400E] bg-[#FEF3C7]" };
}

export function isPackageExpired(expiresAt: string | null, status: string): boolean {
  const pastExpiry = expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
  return status === "expired" || status === "cancelled" || status === "refunded" || pastExpiry;
}

export function voucherStatusMeta(status: string, isUnused: boolean): StatusMeta {
  if (isUnused && status === "active") {
    return { label: "Unused", className: "text-[#8A6510] bg-[#FFF2CE]" };
  }
  if (status === "expired") {
    return { label: "Expired", className: "text-[#991B1B] bg-[#FEE2E2]" };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", className: "text-[#991B1B] bg-[#FEE2E2]" };
  }
  return { label: "Redeemed", className: "text-[#6B6478] bg-[#F0ECE1]" };
}

// The small two-line month/day chip used on Upcoming cards, e.g. "OCT" / "24".
export function monthDayChip(dateStr: string): { month: string; day: string } {
  const date = new Date(dateStr);
  return { month: format(date, "MMM").toUpperCase(), day: format(date, "d") };
}
