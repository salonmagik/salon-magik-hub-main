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
    expect(screen.getByRole("heading", { name: /marketing master toggles/i })).toBeInTheDocument();
    expect(screen.getByText(/deterministic master toggles only/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /rollout rules \(overrides\)/i })).not.toBeInTheDocument();
  });

  it("renders the master toggle table and security notice", () => {
    render(<FeatureFlagsPage />);
    expect(screen.getByText(/2fa required for writes/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /feature/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /key/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /last updated/i })).toBeInTheDocument();
  });
});
