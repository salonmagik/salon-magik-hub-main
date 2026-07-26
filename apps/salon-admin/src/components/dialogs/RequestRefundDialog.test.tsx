import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestRefundDialog } from "./RequestRefundDialog";

const inMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: (column: string, values: string[]) => inMock(column, values),
        }),
      }),
    }),
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    currentTenant: { id: "tenant-1", currency: "GHS" },
  }),
}));

const transaction = {
  id: "transaction-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  appointment_id: "appointment-1",
  amount: 150,
  method: "card",
  status: "completed",
  type: "payment",
  currency: "GHS",
  customer: { id: "customer-1", full_name: "Ama Mensah" },
};

describe("RequestRefundDialog", () => {
  beforeEach(() => {
    inMock.mockReset();
    rpcMock.mockReset();
    inMock.mockResolvedValue({
      data: [{ id: "existing-refund", amount: 50, status: "completed" }],
      error: null,
    });
    rpcMock.mockResolvedValue({ data: "refund-1", error: null });
  });

  it("caps the amount, fills the remaining balance with All, and confirms before refunding", async () => {
    render(
      <RequestRefundDialog
        open
        onOpenChange={vi.fn()}
        transaction={transaction}
        mode="complete"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("₵100.00")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(amountInput.value).toBe("100.00");
    expect(amountInput.max).toBe("100");

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Customer changed their mind" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Confirm refund" })).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        "complete_transaction_refund",
        expect.objectContaining({
          p_transaction_id: "transaction-1",
          p_amount: 100,
          p_refund_type: "store_credit",
        }),
      );
    });
    expect(await screen.findByText("Refund recorded")).toBeInTheDocument();
  });
});
