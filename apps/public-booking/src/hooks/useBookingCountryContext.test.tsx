import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBookingCountryContext } from "./useBookingCountryContext";

const invokeMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useBookingCountryContext", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("resolves detected country and allows manual switch", async () => {
    invokeMock.mockResolvedValue({
      data: {
        detected_country_code: "GH",
        selected_country_code: "GH",
        supported_country_codes: ["GH", "GB"],
        requires_country_selection: false,
        country_context_enabled: true,
      },
      error: null,
    });

    const { result } = renderHook(
      () => useBookingCountryContext({ tenantSlug: "that-star-girl" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.selectedCountryCode).toBe("GH");
    expect(result.current.supportedCountryCodes).toEqual(["GH", "GB"]);

    act(() => {
      result.current.setCountry("GB");
    });

    expect(result.current.selectedCountryCode).toBe("GB");
    expect(window.localStorage.getItem("booking_country:that-star-girl")).toBe("GB");
  });

  it("requires explicit selection when detected country is unsupported", async () => {
    invokeMock.mockResolvedValue({
      data: {
        detected_country_code: "US",
        selected_country_code: null,
        supported_country_codes: ["GH", "GB"],
        requires_country_selection: true,
        country_context_enabled: true,
      },
      error: null,
    });

    const { result } = renderHook(
      () => useBookingCountryContext({ tenantSlug: "that-star-girl" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.requiresCountrySelection).toBe(true);
    expect(result.current.selectedCountryCode).toBeNull();
  });
});
