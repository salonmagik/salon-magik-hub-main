import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RejectRefundDialog } from "./RejectRefundDialog";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  },
}));

describe("RejectRefundDialog", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("reports the resolved request immediately after a successful rejection", async () => {
    const onSuccess = vi.fn();

    render(
      <RejectRefundDialog
        open
        onOpenChange={vi.fn()}
        requestId="refund-request-1"
        customerName="Ama Mensah"
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Duplicate refund request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject request" }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("reject_transaction_refund", {
        p_request_id: "refund-request-1",
        p_reason: "Duplicate refund request",
      });
      expect(onSuccess).toHaveBeenCalledWith("refund-request-1");
    });

    expect(screen.getByRole("heading", { name: "Request rejected" })).toBeInTheDocument();
  });
});
