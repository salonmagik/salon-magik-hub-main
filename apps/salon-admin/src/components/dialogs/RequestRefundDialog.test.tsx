import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { RequestRefundDialog } from "./RequestRefundDialog";

function httpError(code: string, message: string) {
  return new FunctionsHttpError({
    json: async () => ({ error: message, code }),
  });
}

const inMock = vi.fn();
const rpcMock = vi.fn();
const invokeMock = vi.fn();

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
    functions: {
      invoke: (name: string, opts: unknown) => invokeMock(name, opts),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    currentTenant: { id: "tenant-1", currency: "GHS" },
  }),
}));

const paystackTransaction = {
  id: "transaction-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  appointment_id: "appointment-1",
  amount: 150,
  method: "card",
  status: "completed",
  type: "payment",
  currency: "GHS",
  provider: "paystack",
  provider_reference: "ref-123",
  customer: { id: "customer-1", full_name: "Ama Mensah" },
};

function mockRecoverability(walletBalance: number, requiresWalletDebit = true) {
  rpcMock.mockImplementation((name: string) => {
    if (name === "check_refund_recoverability") {
      return Promise.resolve({
        data: { requires_wallet_debit: requiresWalletDebit, wallet_balance: walletBalance, currency: "GHS" },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

describe("RequestRefundDialog", () => {
  beforeEach(() => {
    inMock.mockReset();
    rpcMock.mockReset();
    invokeMock.mockReset();
    inMock.mockResolvedValue({
      data: [{ id: "existing-refund", amount: 50, status: "completed" }],
      error: null,
    });
    invokeMock.mockResolvedValue({ data: { success: true, refundId: "refund-1" }, error: null });
    mockRecoverability(1000);
  });

  it("caps the amount, fills the remaining balance with All, and confirms before refunding via the edge function", async () => {
    render(
      <RequestRefundDialog
        open
        onOpenChange={vi.fn()}
        transaction={paystackTransaction}
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
    expect(invokeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "refund-via-paystack",
        expect.objectContaining({
          body: expect.objectContaining({
            transactionId: "transaction-1",
            amount: 100,
            refundType: "store_credit",
            idempotencyKey: expect.any(String),
          }),
        }),
      );
    });
    expect(await screen.findByText("Refund recorded")).toBeInTheDocument();
  });

  it("disables the card and salon-balance tiles with the withdrawn-funds copy when the wallet can't cover the amount", async () => {
    mockRecoverability(20);
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    await waitFor(() => {
      expect(screen.getAllByText(/already been paid out to your salon/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/store credit is funded from your salon balance/i)).toBeInTheDocument();
    });

    const paystackTile = screen.getByRole("button", { name: /Refund via Paystack/i });
    const storeCreditTile = screen.getByRole("button", { name: (n) => n.startsWith("Salon balance") });
    expect(paystackTile).toBeDisabled();
    expect(storeCreditTile).toBeDisabled();
  });

  it("keeps both destinations selectable when the wallet balance covers the amount", async () => {
    mockRecoverability(1000);
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    await waitFor(() => {
      const paystackTile = screen.getByRole("button", { name: /Refund via Paystack/i });
      const storeCreditTile = screen.getByRole("button", { name: (n) => n.startsWith("Salon balance") });
      expect(paystackTile).not.toBeDisabled();
      expect(storeCreditTile).not.toBeDisabled();
    });
  });

  it("keeps the cash/transfer tile enabled even when the wallet is empty", async () => {
    mockRecoverability(0);
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: (n) => n.startsWith("Cash / transfer") })).not.toBeDisabled();
    });
  });

  it("auto-switches off paystack when the amount is raised past the wallet balance", async () => {
    mockRecoverability(50);
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Refund via Paystack/i }));
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "40" } });

    // Still within the wallet's balance — paystack stays selected.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Refund via Paystack/i })).not.toBeDisabled();
    });

    fireEvent.change(amountInput, { target: { value: "60" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: (n) => n.startsWith("Cash / transfer") })).toHaveClass("border-primary");
    });
  });

  it("leaves the tiles selectable when check_refund_recoverability errors", async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === "check_refund_recoverability") {
        return Promise.resolve({ data: null, error: new Error("boom") });
      }
      return Promise.resolve({ data: null, error: null });
    });
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Refund via Paystack/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: (n) => n.startsWith("Salon balance") })).not.toBeDisabled();
    });
  });

  it("renders the withdrawn-funds message for a 409, distinct from a Paystack decline", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: httpError("INSUFFICIENT_RECOVERABLE_FUNDS", "This salon has already withdrawn the funds for this payment."),
    });
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));

    expect(await screen.findByText(/can't move the money for you/i)).toBeInTheDocument();
  });

  it("renders Paystack's own decline message, distinct from the withdrawn-funds message", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: httpError("PAYSTACK_DECLINED", "Paystack declined this refund"),
    });
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));

    expect(await screen.findByText("Paystack declined this refund")).toBeInTheDocument();
    expect(screen.queryByText(/can't move the money for you/i)).not.toBeInTheDocument();
  });

  it("generates a fresh idempotency key after returning to the form and resubmitting", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: httpError("PAYSTACK_DECLINED", "Paystack declined this refund") });
    render(
      <RequestRefundDialog open onOpenChange={vi.fn()} transaction={paystackTransaction} mode="complete" />,
    );

    await waitFor(() => expect(screen.getByText("₵100.00")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));

    await screen.findByText("Refund wasn’t completed");
    const firstKey = invokeMock.mock.calls[0][1].body.idempotencyKey;

    invokeMock.mockResolvedValueOnce({ data: { success: true, refundId: "refund-2" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const secondKey = invokeMock.mock.calls[1][1].body.idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});
