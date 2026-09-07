import { useAuth } from "@/hooks/useAuth";

export type SubscriptionLifecycleState =
	| "trialing"
	| "active"
	| "awaiting_payment_method"
	| "cancellation_pending"
	| "canceled"
	| "past_due"
	| "suspended"
	| "unknown";

export type SubscriptionPrimaryAction =
	| "subscribe"
	| "add_payment_method"
	| "update_payment_method"
	| "cancel"
	| "resume"
	| null;

export interface SubscriptionLifecycle {
	state: SubscriptionLifecycleState;
	primaryAction: SubscriptionPrimaryAction;
	accessEndDate: Date | null;
	graceEndsAt: Date | null;
}

/**
 * Derives the current lifecycle state and its single primary action from
 * currentTenant — the one place that decides what the subscription surface
 * shows, per the Implementation Design's AD-2/requirement 22. A tenant is
 * never in more than one of these states at once, and each state has
 * exactly one primary action.
 */
export function useSubscriptionLifecycle(): SubscriptionLifecycle {
	const { currentTenant } = useAuth();

	if (!currentTenant) {
		return { state: "unknown", primaryAction: null, accessEndDate: null, graceEndsAt: null };
	}

	const status = currentTenant.subscription_status;
	const cancelAt = currentTenant.subscription_cancel_at
		? new Date(currentTenant.subscription_cancel_at)
		: null;
	const graceEndsAt = currentTenant.billing_grace_ends_at
		? new Date(currentTenant.billing_grace_ends_at)
		: null;

	if (status === "trialing") {
		return { state: "trialing", primaryAction: "subscribe", accessEndDate: null, graceEndsAt: null };
	}

	if (status === "suspended") {
		return { state: "suspended", primaryAction: "update_payment_method", accessEndDate: null, graceEndsAt };
	}

	if (status === "past_due") {
		return { state: "past_due", primaryAction: "update_payment_method", accessEndDate: null, graceEndsAt };
	}

	if (status === "canceled") {
		return { state: "canceled", primaryAction: "subscribe", accessEndDate: null, graceEndsAt: null };
	}

	if (status === "active") {
		// A cancellation-pending tenant is deliberately still `active` (AD-2) —
		// full paid access, with the pending state expressed only by
		// subscription_cancel_at.
		if (cancelAt && cancelAt.getTime() > Date.now()) {
			return { state: "cancellation_pending", primaryAction: "resume", accessEndDate: cancelAt, graceEndsAt: null };
		}

		if (!currentTenant.next_billing_at) {
			// Activated but no card captured yet — nothing to cancel, nothing
			// due; the only meaningful action is adding a payment method.
			return { state: "awaiting_payment_method", primaryAction: "add_payment_method", accessEndDate: null, graceEndsAt: null };
		}

		return { state: "active", primaryAction: "cancel", accessEndDate: null, graceEndsAt: null };
	}

	return { state: "unknown", primaryAction: null, accessEndDate: null, graceEndsAt: null };
}
