import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeatureFlags, useGeoInterestMode, useWaitlistMode } from "./useFeatureFlags";

const rpcMock = vi.fn();

vi.mock("@supabase-client/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useFeatureFlags", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("resolves waitlist mode from feature evaluation", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ enabled: true }], error: null });
    const { result } = renderHook(() => useWaitlistMode(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isWaitlistMode).toBe(true);
  });

  it("resolves geo interest mode from feature evaluation", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ enabled: false }], error: null });
    const { result } = renderHook(() => useGeoInterestMode(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnabled).toBe(false);
  });

  it("combines both flags", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [{ enabled: true }], error: null })
      .mockResolvedValueOnce({ data: [{ enabled: true }], error: null });

    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.waitlist).toBe(true);
    expect(result.current.geoInterest).toBe(true);
  });
});
