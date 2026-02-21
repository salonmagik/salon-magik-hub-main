import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMarketCountries } from "./useMarketCountries";

const inMock = vi.fn();
const eqMock = vi.fn(() => ({ in: inMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMarketCountries", () => {
  it("returns live countries from selectable list", async () => {
    inMock.mockResolvedValue({
      data: [{ country_code: "GH" }, { country_code: "NG" }],
      error: null,
    });
    const { result } = renderHook(() => useMarketCountries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((country) => country.code)).toContain("GH");
    expect(result.current.data?.map((country) => country.code)).toContain("NG");
  });
});
