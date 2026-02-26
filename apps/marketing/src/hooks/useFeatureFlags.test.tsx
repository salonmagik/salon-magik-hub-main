import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeatureFlags, useGeoInterestMode, useWaitlistMode } from "./useFeatureFlags";

const getMarketingFeatureTogglesMock = vi.fn();

vi.mock("@supabase-client/supabase/client", () => ({
  supabase: {
    rpc: (fn: string) => {
      if (fn === "get_marketing_feature_toggles") {
        return getMarketingFeatureTogglesMock();
      }
      throw new Error(`Unexpected rpc mock: ${fn}`);
    },
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
    getMarketingFeatureTogglesMock.mockReset();
  });

  it("resolves waitlist mode from master toggles", async () => {
    getMarketingFeatureTogglesMock.mockResolvedValueOnce({
      data: [{ waitlist_enabled: true, other_countries_interest_enabled: false }],
      error: null,
    });

    const { result } = renderHook(() => useWaitlistMode(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isWaitlistMode).toBe(true);
  });

  it("resolves geo interest mode from master toggles", async () => {
    getMarketingFeatureTogglesMock.mockResolvedValueOnce({
      data: [{ waitlist_enabled: false, other_countries_interest_enabled: true }],
      error: null,
    });

    const { result } = renderHook(() => useGeoInterestMode(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnabled).toBe(true);
  });

  it("fails open when RPC fails", async () => {
    getMarketingFeatureTogglesMock.mockRejectedValue(new Error("RPC unavailable"));

    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => expect(result.current.waitlist).toBe(false));
    expect(result.current.waitlist).toBe(false);
    expect(result.current.geoInterest).toBe(false);
  });
});
