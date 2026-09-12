import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

let mockLocationGate: { allowed: number; used: number; can_add: boolean; requires_custom: boolean } = {
  allowed: 2,
  used: 2,
  can_add: false,
  requires_custom: true,
};
let mockChainUnlockRequest: { requested_locations: number; allowed_locations: number; status: string } | null = {
  requested_locations: 11,
  allowed_locations: 10,
  status: "pending",
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "tenant-location-gate") {
      return { data: mockLocationGate };
    }
    if (queryKey[0] === "tenant-chain-unlock-request") {
      return { data: mockChainUnlockRequest };
    }
    return { data: null };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@ui/ui/use-toast", () => ({ toast: vi.fn() }));

function expectBranchVsBusinessGuidance() {
  expect(screen.getByTestId("branch-vs-business-guidance")).toBeInTheDocument();
}

describe("AddSalonDialog", () => {
  it("shows pending unlock message when chain request exceeds allowed locations", () => {
    render(
      <MemoryRouter>
        <AddSalonDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText(/unlock request pending/i)).toBeInTheDocument();
    expect(screen.getByText(/still pending approval/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add branch/i })).not.toBeInTheDocument();
  });

  // AC-29: the branch-versus-business guidance text appears above the
  // submit control in every one of the dialog's four render branches.
  it("shows the branch-versus-business guidance in the pending-unlock branch", () => {
    mockLocationGate = { allowed: 2, used: 2, can_add: false, requires_custom: true };
    mockChainUnlockRequest = { requested_locations: 11, allowed_locations: 10, status: "pending" };
    render(
      <MemoryRouter>
        <AddSalonDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expectBranchVsBusinessGuidance();
  });

  it("shows the branch-versus-business guidance in the at-limit branch", () => {
    mockLocationGate = { allowed: 2, used: 2, can_add: false, requires_custom: false };
    mockChainUnlockRequest = null;
    render(
      <MemoryRouter>
        <AddSalonDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/used all your branches/i)).toBeInTheDocument();
    expectBranchVsBusinessGuidance();
  });

  it("shows the branch-versus-business guidance in the custom-unlock branch", () => {
    mockLocationGate = { allowed: 10, used: 10, can_add: false, requires_custom: true };
    mockChainUnlockRequest = null;
    render(
      <MemoryRouter>
        <AddSalonDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/request chain unlock/i)).toBeInTheDocument();
    expectBranchVsBusinessGuidance();
  });

  it("shows the branch-versus-business guidance in the default add-branch form", () => {
    mockLocationGate = { allowed: 5, used: 1, can_add: true, requires_custom: false };
    mockChainUnlockRequest = null;
    render(
      <MemoryRouter>
        <AddSalonDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /add branch/i })).toBeInTheDocument();
    expectBranchVsBusinessGuidance();
  });
});
