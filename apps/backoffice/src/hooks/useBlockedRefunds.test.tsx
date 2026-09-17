import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBlockedRefunds, useBlockedRefundsCount } from "./useBlockedRefunds";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const row = {
  id: "block-1",
  created_at: "2026-09-06T00:00:00Z",
  tenant_id: "tenant-1",
  tenant_name: "Test Salon",
  transaction_id: "transaction-1",
  refund_request_id: null,
  attempted_amount: 100,
  currency: "GHS",
  wallet_balance_at_attempt: 40,
  shortfall: 60,
  refund_type: "paystack",
  block_code: "INSUFFICIENT_RECOVERABLE_FUNDS",
  reason: "Card refund",
  attempted_by_id: "owner-1",
  attempted_by_email: "owner@test.local",
  total_count: 3,
};

describe("useBlockedRefunds", () => {
  it("maps rows, paginates by limit/offset, and exposes total_count", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    const { result } = renderHook(() => useBlockedRefunds({ page: 1, pageSize: 25 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith("get_backoffice_blocked_refunds", { p_limit: 25, p_offset: 25 });
    expect(result.current.data?.[0]).toMatchObject({ id: "block-1", tenant_name: "Test Salon", total_count: 3 });
  });
});

describe("useBlockedRefundsCount", () => {
  it("returns total_count from a single-row fetch", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    const { result } = renderHook(() => useBlockedRefundsCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith("get_backoffice_blocked_refunds", { p_limit: 1, p_offset: 0 });
    expect(result.current.data).toBe(3);
  });

  it("returns 0 when there are no blocked refunds", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useBlockedRefundsCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(0);
  });
});
