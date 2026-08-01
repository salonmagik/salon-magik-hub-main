import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WaitlistForm } from "./WaitlistForm";

vi.mock("@/hooks", () => ({
  useMarketingMarketCountries: () => ({
    data: {
      liveCountries: [{ code: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" }],
      expansionCountries: [{ code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" }],
    },
  }),
}));

vi.mock("@supabase-client/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("WaitlistForm", () => {
  it("renders waitlist mode CTA in compact form", () => {
    const queryClient = new QueryClient();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <WaitlistForm compact mode="waitlist" />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /join waitlist/i })).toBeInTheDocument();
  });

  it("renders interest mode CTA in compact form", () => {
    const queryClient = new QueryClient();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <WaitlistForm compact mode="interest" />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /register interest/i })).toBeInTheDocument();
  });
});
