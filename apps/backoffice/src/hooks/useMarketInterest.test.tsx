import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMarketInterest } from "./useMarketInterest";

const orderMock = vi.fn();
const selectMock = vi.fn(() => ({ order: orderMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMarketInterest", () => {
  it("fetches market interest leads", async () => {
    orderMock.mockResolvedValue({
      data: [
        {
          id: "1",
          first_name: "Ada",
          last_name: "N.",
          email: "ada@example.com",
          phone_e164: "+233000000000",
          country: "KE",
          city: "Nairobi",
          salon_name: "Ada Beauty",
          team_size: 4,
          notes: null,
          source: "launch_section",
          status: "new",
          created_at: "2026-02-20T00:00:00Z",
          updated_at: "2026-02-20T00:00:00Z",
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMarketInterest({ status: "all" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].country).toBe("KE");
  });
});
