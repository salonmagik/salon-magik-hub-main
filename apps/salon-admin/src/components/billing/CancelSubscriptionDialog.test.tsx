import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";
import { supabase } from "@/lib/supabase";

// jsdom doesn't implement these, and Radix's Select uses them when opening —
// without these no-op stubs, selecting an option throws.
beforeAll(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(window as any).HTMLElement.prototype.scrollIntoView = vi.fn();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(window as any).HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(window as any).HTMLElement.prototype.releasePointerCapture = vi.fn();
});

const refreshTenants = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/useAuth", () => ({
	useAuth: () => ({
		currentTenant: { id: "tenant-1" },
		refreshTenants,
	}),
}));

const toast = vi.fn();
vi.mock("@ui/ui/use-toast", () => ({
	useToast: () => ({ toast }),
}));

vi.mock("@/lib/supabase", () => ({
	supabase: {
		functions: {
			invoke: vi.fn().mockResolvedValue({ data: { cancelAt: "2026-10-05T00:00:00.000Z" }, error: null }),
		},
	},
}));

describe("CancelSubscriptionDialog", () => {
	it("keeps Confirm disabled until a reason is chosen", () => {
		render(
			<CancelSubscriptionDialog
				open
				onOpenChange={vi.fn()}
				accessEndDate={new Date("2026-10-05T00:00:00.000Z")}
				onCancelled={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: /confirm cancellation/i })).toBeDisabled();
	});

	it("shows the access-end date in the confirmation copy", () => {
		render(
			<CancelSubscriptionDialog
				open
				onOpenChange={vi.fn()}
				accessEndDate={new Date("2026-10-05T00:00:00.000Z")}
				onCancelled={vi.fn()}
			/>,
		);

		expect(screen.getByText(/October 5, 2026/)).toBeInTheDocument();
	});

	it("invokes manage-subscription-cancellation with the selected reason and trimmed note once a reason is picked", async () => {
		const onCancelled = vi.fn();
		render(
			<CancelSubscriptionDialog
				open
				onOpenChange={vi.fn()}
				accessEndDate={new Date("2026-10-05T00:00:00.000Z")}
				onCancelled={onCancelled}
			/>,
		);

		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(await screen.findByText("Too expensive"));

		const confirmButton = screen.getByRole("button", { name: /confirm cancellation/i });
		expect(confirmButton).not.toBeDisabled();

		fireEvent.change(screen.getByLabelText(/anything else/i), { target: { value: "  will miss you  " } });
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(supabase.functions.invoke).toHaveBeenCalledWith("manage-subscription-cancellation", {
				body: {
					tenantId: "tenant-1",
					action: "cancel",
					reason: "too_expensive",
					note: "will miss you",
				},
			});
		});

		await waitFor(() => expect(refreshTenants).toHaveBeenCalled());
		await waitFor(() => expect(onCancelled).toHaveBeenCalled());
	});
});
