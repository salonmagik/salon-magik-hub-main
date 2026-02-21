import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketingMarketCountries } from "./useMarketConfig";

const inMock = vi.fn();
const eqMock = vi.fn(() => ({ in: inMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@supabase-client/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
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

describe("useMarketingMarketCountries", () => {
  beforeEach(() => {
    inMock.mockReset();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
  });

  it("returns live countries from selectable markets", async () => {
    inMock.mockResolvedValue({
      data: [{ country_code: "GH" }, { country_code: "NG" }],
      error: null,
    });
    const { result } = renderHook(() => useMarketingMarketCountries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.liveCountries.map((country) => country.code)).toEqual(["GH", "NG"]);
    expect(result.current.data?.expansionCountries.some((country) => country.code === "GH")).toBe(false);
  });
});
