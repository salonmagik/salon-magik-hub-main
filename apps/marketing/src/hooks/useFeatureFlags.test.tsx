import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeatureFlags, useGeoInterestMode, useWaitlistMode } from "./useFeatureFlags";

const platformFeatureMock = vi.fn();
const featureFlagMock = vi.fn();

vi.mock("@supabase-client/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "platform_features") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => platformFeatureMock(),
            }),
          }),
        };
      }

      if (table === "feature_flags") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => featureFlagMock(),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table mock: ${table}`);
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
    platformFeatureMock.mockReset();
    featureFlagMock.mockReset();
  });

  it("resolves waitlist mode from feature evaluation", async () => {
    platformFeatureMock.mockResolvedValueOnce({ data: { id: "feature-1" }, error: null });
    featureFlagMock.mockResolvedValueOnce({ data: { is_enabled: true }, error: null });
    const { result } = renderHook(() => useWaitlistMode(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isWaitlistMode).toBe(true);
  });

  it("resolves geo interest mode from feature evaluation", async () => {
    platformFeatureMock.mockResolvedValueOnce({ data: { id: "feature-2" }, error: null });
    featureFlagMock.mockResolvedValueOnce({ data: { is_enabled: false }, error: null });
    const { result } = renderHook(() => useGeoInterestMode(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnabled).toBe(false);
  });

  it("combines both flags", async () => {
    platformFeatureMock
      .mockResolvedValueOnce({ data: { id: "feature-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "feature-2" }, error: null });
    featureFlagMock
      .mockResolvedValueOnce({ data: { is_enabled: true }, error: null })
      .mockResolvedValueOnce({ data: { is_enabled: true }, error: null });

    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.waitlist).toBe(true);
    expect(result.current.geoInterest).toBe(true);
  });
});
