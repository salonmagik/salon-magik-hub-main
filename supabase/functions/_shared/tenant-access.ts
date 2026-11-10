export type BillingAccessTenant = {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
};

/**
 * Operational access is deliberately narrow. A tenant can use the product
 * during an active trial or while paid; unpaid and expired tenants retain
 * billing/data access but cannot send messages or run reminders.
 */
export function hasOperationalAccess(
  tenant: BillingAccessTenant,
  now = new Date(),
): boolean {
  const status = String(tenant.subscription_status || "").toLowerCase();
  if (status === "active") return true;
  if (status !== "trialing" || !tenant.trial_ends_at) return false;
  return new Date(tenant.trial_ends_at).getTime() > now.getTime();
}

export const OPERATIONAL_ACCESS_ERROR =
  "Your salon is offline until billing is completed. Update your payment method to resume messaging.";
