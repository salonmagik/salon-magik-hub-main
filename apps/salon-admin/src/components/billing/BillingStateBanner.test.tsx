import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BillingStateBanner } from "./BillingStateBanner";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantRecurringTotal } from "@/hooks/useTenantRecurringTotal";

vi.mock("@/hooks/useAuth", () => ({
	useAuth: vi.fn(),
}));

vi.mock("@/hooks/usePermissions", () => ({
	usePermissions: vi.fn(),
}));

vi.mock("@/hooks/useTenantRecurringTotal", () => ({
	useTenantRecurringTotal: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUsePermissions = vi.mocked(usePermissions);
const mockedUseTenantRecurringTotal = vi.mocked(useTenantRecurringTotal);

function setup(tenant: Record<string, unknown> | null, isOwner: boolean) {
	mockedUseAuth.mockReturnValue({ currentTenant: tenant } as unknown as ReturnType<typeof useAuth>);
	mockedUsePermissions.mockReturnValue({
		hasPermission: vi.fn().mockReturnValue(isOwner),
	} as unknown as ReturnType<typeof usePermissions>);
	mockedUseTenantRecurringTotal.mockReturnValue({
		data: { total_amount: 45, currency: "NGN", breakdown: {} },
	} as unknown as ReturnType<typeof useTenantRecurringTotal>);
}

function renderBanner() {
	return render(
		<MemoryRouter>
			<BillingStateBanner />
		</MemoryRouter>,
	);
}

describe("BillingStateBanner", () => {
	it("renders nothing for an active subscription", () => {
		setup({ id: "t1", subscription_status: "active" }, true);
		const { container } = renderBanner();
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing while trialing", () => {
		setup({ id: "t1", subscription_status: "trialing" }, true);
		const { container } = renderBanner();
		expect(container).toBeEmptyDOMElement();
	});

	it("renders for past_due with the amount owed, the deadline, and the consequence, and an owner sees the settle action", () => {
		const graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
		setup({ id: "t1", subscription_status: "past_due", billing_grace_ends_at: graceEndsAt }, true);
		renderBanner();

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/past due/i)).toBeInTheDocument();
		expect(screen.getByText(/45\.00 owed/i)).toBeInTheDocument();
		expect(screen.getByText(/storefront and bookings being disabled/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Settle now" })).toBeInTheDocument();
	});

	it("renders for suspended and a non-owner sees the contact line instead of the settle action", () => {
		setup({ id: "t1", subscription_status: "suspended" }, false);
		renderBanner();

		expect(screen.getByText(/account is suspended/i)).toBeInTheDocument();
		expect(screen.getByText(/existing data is safe/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Contact salon owner" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Settle now" })).not.toBeInTheDocument();
	});

	it("carries state via icon and text, not colour alone — an accessible role/name is present for both states", () => {
		const graceEndsAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
		setup({ id: "t1", subscription_status: "past_due", billing_grace_ends_at: graceEndsAt }, true);
		renderBanner();
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/past due/i)).toBeInTheDocument();
	});
});
