import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSubscriptionLedger } from "./useSubscriptionLedger";

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

describe("useSubscriptionLedger", () => {
  it("maps the extended lifecycle row shape through unchanged", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          tenant_id: "t1",
          tenant_name: "Cancel-pending Salon",
          country: "GH",
          plan: "studio",
          subscription_status: "active",
          next_billing_at: "2026-10-05T00:00:00Z",
          currency: "GHS",
          base_mrr: 100,
          addon_mrr: 0,
          addon_breakdown: null,
          comms_balance: 5,
          comms_last_purchase_at: null,
          comms_last_purchase_amount: null,
          comms_last_purchase_currency: null,
          subscription_cancel_at: "2026-10-05T00:00:00Z",
          cancellation_reason: "too_expensive",
          cancellation_reason_note: "will miss you",
          cancellation_requested_by_email: "owner@test.local",
          cancellation_requested_at: "2026-09-01T00:00:00Z",
          billing_grace_ends_at: null,
          suspended_at: null,
          billing_retry_count: 0,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useSubscriptionLedger(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith("get_backoffice_subscription_ledger");
    const row = result.current.data?.[0];
    expect(row?.subscription_cancel_at).toBe("2026-10-05T00:00:00Z");
    expect(row?.cancellation_reason).toBe("too_expensive");
    expect(row?.cancellation_reason_note).toBe("will miss you");
    expect(row?.cancellation_requested_by_email).toBe("owner@test.local");
    expect(row?.cancellation_requested_at).toBe("2026-09-01T00:00:00Z");
    expect(row?.billing_grace_ends_at).toBeNull();
    expect(row?.suspended_at).toBeNull();
    expect(row?.billing_retry_count).toBe(0);
  });
});
