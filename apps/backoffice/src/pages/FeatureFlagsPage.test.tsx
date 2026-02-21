import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FeatureFlagsPage from "./FeatureFlagsPage";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks", () => ({
  useBackofficeAuth: () => ({
    backofficeUser: { role: "super_admin" },
    profile: { id: "user-1" },
  }),
}));

vi.mock("@/components/BackofficeLayout", () => ({
  BackofficeLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("FeatureFlagsPage", () => {
  it("renders feature flag management sections", () => {
    render(<FeatureFlagsPage />);
    expect(screen.getByRole("heading", { name: /feature flags/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /master toggles/i })).toBeInTheDocument();
    expect(screen.getByText(/rollout rules \(overrides\)/i)).toBeInTheDocument();
  });
});
