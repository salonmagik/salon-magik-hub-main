import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientRefundRequestDialog } from "./ClientRefundRequestDialog";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));

const transaction = { id: "tx-1", amount: 150, currency: "GHS", tenantName: "Apple Hair Stores" };

describe("ClientRefundRequestDialog", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: "request-1", error: null });
  });

  it("lets a client request all or part of a payment without choosing the refund method", async () => {
    render(<ClientRefundRequestDialog open onOpenChange={vi.fn()} transaction={transaction} />);
    expect(screen.getByRole("heading", { name: "Request a refund" })).toBeInTheDocument();
    expect(screen.getByText(/salon owner or manager must approve/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Amount requested")).toHaveValue(150);
    expect(screen.queryByText(/salon balance|cash \/ transfer/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount requested"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "The service was incomplete" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("request_customer_refund", {
      p_transaction_id: "tx-1", p_amount: 75, p_reason: "The service was incomplete",
    }));
    expect(await screen.findByText("Refund request sent")).toBeInTheDocument();
  });

  it("requires a reason before sending", () => {
    render(<ClientRefundRequestDialog open onOpenChange={vi.fn()} transaction={transaction} />);
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tell the salon why");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
