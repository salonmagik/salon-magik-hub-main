import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestRefundDialog } from "./RequestRefundDialog";

const { rpcMock, invokeMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), invokeMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }), rpc: rpcMock, functions: { invoke: invokeMock } },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ currentTenant: { id: "tenant-1", currency: "GHS" } }) }));

const transaction = { id: "transaction-1", tenant_id: "tenant-1", customer_id: "customer-1", appointment_id: "appointment-1",
  amount: 150, method: "card", status: "completed", type: "payment", currency: "GHS", provider: "paystack", provider_reference: "ref-123",
  customer: { id: "customer-1", full_name: "Ama Mensah" } };

beforeEach(() => {
  rpcMock.mockImplementation((name: string) => name === "check_refund_recoverability"
    ? Promise.resolve({ data: { requires_wallet_debit: true, wallet_balance: 1000, currency: "GHS" }, error: null })
    : Promise.resolve({ data: null, error: null }));
  invokeMock.mockResolvedValue({ data: { success: true, refundId: "refund-1" }, error: null });
});

describe("RequestRefundDialog", () => {
  it("offers salon credit and direct transfer, never Paystack", async () => {
    render(<RequestRefundDialog open onOpenChange={vi.fn()} transaction={transaction} mode="complete" />);
    await waitFor(() => expect(screen.getByText("₵150.00")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Refund via Paystack/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salon balance/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cash \/ transfer/i })).toBeInTheDocument();
  });

  it("records salon credit through the local refund operation", async () => {
    render(<RequestRefundDialog open onOpenChange={vi.fn()} transaction={transaction} mode="complete" />);
    await waitFor(() => expect(screen.getByText("₵150.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Customer request" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("refund-via-paystack", expect.objectContaining({ body: expect.objectContaining({ refundType: "store_credit" }) })));
    expect(await screen.findByText("Refund recorded")).toBeInTheDocument();
  });

  it("keeps direct transfer available when the salon balance cannot fund store credit", async () => {
    rpcMock.mockImplementation((name: string) => name === "check_refund_recoverability"
      ? Promise.resolve({ data: { requires_wallet_debit: true, wallet_balance: 0, currency: "GHS" }, error: null })
      : Promise.resolve({ data: null, error: null }));
    render(<RequestRefundDialog open onOpenChange={vi.fn()} transaction={transaction} mode="complete" />);
    await waitFor(() => expect(screen.getByText("₵150.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(screen.getByText(/store credit is funded from your salon balance/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Cash \/ transfer/i })).not.toBeDisabled();
  });

  it("lets an elevated approver change the requested amount and destination", async () => {
    render(
      <RequestRefundDialog
        open
        onOpenChange={vi.fn()}
        transaction={transaction}
        mode="complete"
        request={{ id: "request-1", amount: 75, reason: "Partial service", refund_type: "offline" }}
      />,
    );
    await waitFor(() => expect(screen.getByDisplayValue("75")).toBeInTheDocument());
    expect(screen.getByRole("spinbutton")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Salon balance/i })).not.toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /Salon balance/i }));
    expect(screen.getByText(/choose the amount you are approving/i)).toBeInTheDocument();
  });
});
