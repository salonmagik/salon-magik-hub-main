import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddSalonDialog } from "./AddSalonDialog";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    currentTenant: { id: "tenant-1", plan: "chain", country: "GH" },
  }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    locations: [{ id: "loc-1" }, { id: "loc-2" }],
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePlans", () => ({
  usePlans: () => ({
    data: [{ slug: "chain", limits: { max_locations: 3 } }],
  }),
}));

vi.mock("@/hooks/useMarketCountries", () => ({
  useMarketCountries: () => ({
    data: [{ code: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" }],
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "tenant-location-gate") {
      return {
        data: { allowed: 2, used: 2, can_add: false, requires_custom: true },
      };
    }
    if (queryKey[0] === "tenant-chain-unlock-request") {
      return {
        data: { requested_locations: 11, allowed_locations: 10, status: "pending" },
      };
    }
    return { data: null };
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@ui/ui/use-toast", () => ({ toast: vi.fn() }));

describe("AddSalonDialog", () => {
  it("shows pending unlock message when chain request exceeds allowed locations", () => {
    render(<AddSalonDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/add a new location \(2 \/ 2 used\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add salon/i })).toBeDisabled();
  });
});
