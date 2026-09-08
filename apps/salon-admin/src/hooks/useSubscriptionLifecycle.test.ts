import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionLifecycle } from "./useSubscriptionLifecycle";

vi.mock("@/hooks/useAuth", () => ({
	useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function setTenant(tenant: Record<string, unknown> | null) {
	mockedUseAuth.mockReturnValue({ currentTenant: tenant } as unknown as ReturnType<typeof useAuth>);
}

describe("useSubscriptionLifecycle", () => {
	it("returns unknown with no primary action when there is no tenant", () => {
		setTenant(null);
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("unknown");
		expect(result.primaryAction).toBeNull();
	});

	it("maps trialing to subscribe", () => {
		setTenant({ subscription_status: "trialing" });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("trialing");
		expect(result.primaryAction).toBe("subscribe");
	});

	it("maps active with a scheduled charge to cancel", () => {
		setTenant({ subscription_status: "active", next_billing_at: "2026-10-05T00:00:00Z" });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("active");
		expect(result.primaryAction).toBe("cancel");
	});

	it("maps active with no next_billing_at to add_payment_method", () => {
		setTenant({ subscription_status: "active", next_billing_at: null });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("awaiting_payment_method");
		expect(result.primaryAction).toBe("add_payment_method");
	});

	it("maps active with a future subscription_cancel_at to cancellation_pending / resume", () => {
		const cancelAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
		setTenant({ subscription_status: "active", next_billing_at: cancelAt, subscription_cancel_at: cancelAt });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("cancellation_pending");
		expect(result.primaryAction).toBe("resume");
		expect(result.accessEndDate?.toISOString()).toBe(cancelAt);
	});

	it("ignores a subscription_cancel_at that has already passed", () => {
		const pastCancelAt = new Date(Date.now() - 60 * 1000).toISOString();
		setTenant({ subscription_status: "active", next_billing_at: pastCancelAt, subscription_cancel_at: pastCancelAt });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("active");
		expect(result.primaryAction).toBe("cancel");
	});

	it("maps canceled to subscribe", () => {
		setTenant({ subscription_status: "canceled" });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("canceled");
		expect(result.primaryAction).toBe("subscribe");
	});

	it("maps past_due (in grace) to update_payment_method and exposes the deadline", () => {
		const graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
		setTenant({ subscription_status: "past_due", billing_grace_ends_at: graceEndsAt });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("past_due");
		expect(result.primaryAction).toBe("update_payment_method");
		expect(result.graceEndsAt?.toISOString()).toBe(graceEndsAt);
	});

	it("maps suspended to update_payment_method", () => {
		setTenant({ subscription_status: "suspended" });
		const result = useSubscriptionLifecycle();
		expect(result.state).toBe("suspended");
		expect(result.primaryAction).toBe("update_payment_method");
	});
});
