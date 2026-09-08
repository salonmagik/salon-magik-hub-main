import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useRefunds } from "./useRefunds";

const selectMock = vi.fn();
const singleMock = vi.fn();
const rpcMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "refund_requests") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => singleMock(),
              }),
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: selectMock };
    },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    functions: {
      invoke: (name: string, opts: unknown) => invokeMock(name, opts),
    },
  },
}));

vi.mock("./useAuth", () => ({
  useAuth: () => ({
    currentTenant: { id: "tenant-1" },
    user: { id: "owner-1" },
  }),
}));

vi.mock("@ui/ui/use-toast", () => ({
  toast: vi.fn(),
}));

const pendingRefundRequest = {
  id: "refund-request-1",
  tenant_id: "tenant-1",
  transaction_id: "transaction-1",
  amount: 100,
  reason: "Customer complaint",
  refund_type: "store_credit",
  status: "pending",
};

describe("useRefunds.approveRefund", () => {
  beforeEach(() => {
    singleMock.mockReset();
    rpcMock.mockReset();
    invokeMock.mockReset();
    singleMock.mockResolvedValue({ data: pendingRefundRequest, error: null });
  });

  it("invokes refund-via-paystack rather than calling the RPC directly", async () => {
    invokeMock.mockResolvedValue({ data: { success: true, refundId: "refund-1" }, error: null });
    const { result } = renderHook(() => useRefunds());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.approveRefund("refund-request-1");
    });

    expect(success).toBe(true);
    expect(rpcMock).not.toHaveBeenCalledWith("complete_transaction_refund", expect.anything());
    expect(invokeMock).toHaveBeenCalledWith(
      "refund-via-paystack",
      expect.objectContaining({
        body: expect.objectContaining({
          transactionId: "transaction-1",
          amount: 100,
          refundType: "store_credit",
          requestId: "refund-request-1",
        }),
      }),
    );
  });

  it("surfaces a 409 block without marking the request completed", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({
        json: async () => ({
          error: "This salon has already withdrawn the funds for this payment.",
          code: "INSUFFICIENT_RECOVERABLE_FUNDS",
        }),
      }),
    });
    const { result } = renderHook(() => useRefunds());

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.approveRefund("refund-request-1");
    });

    expect(success).toBe(false);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
  });
});
