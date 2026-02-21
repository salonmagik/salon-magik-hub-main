import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePublicSalon } from "./usePublicSalon";

const fromMock = vi.fn((table: string) => {
  if (table === "public_booking_tenants") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "tenant-1",
              name: "Salon",
              slug: "salon",
              currency: "GHS",
              country: "GH",
            },
            error: null,
          }),
        }),
      }),
    };
  }

  return {
    select: () => ({
      eq: () => ({
        eq: async () => ({
          data: [{ id: "loc-1", name: "Main Branch", city: "Accra", country: "GH", availability: "open" }],
          error: null,
        }),
      }),
    }),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePublicSalon", () => {
  it("loads salon and locations for public booking", async () => {
    const { result } = renderHook(() => usePublicSalon("salon"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.salon?.id).toBe("tenant-1");
    expect(result.current.locations).toHaveLength(1);
  });
});
