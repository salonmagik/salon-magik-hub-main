import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FeatureFlagsPage from "./FeatureFlagsPage";

const { mockQueryData } = vi.hoisted(() => ({ mockQueryData: { current: [] as unknown[] } }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mockQueryData.current, isLoading: false }),
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

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

describe("FeatureFlagsPage", () => {
  it("renders the page heading and security notice", () => {
    mockQueryData.current = [];
    render(<FeatureFlagsPage />);
    expect(screen.getByRole("heading", { name: /feature flags/i })).toBeInTheDocument();
    expect(screen.getByText(/2fa required for writes/i)).toBeInTheDocument();
  });

  it("shows an empty state when no toggles are configured", () => {
    mockQueryData.current = [];
    render(<FeatureFlagsPage />);
    expect(screen.getByText(/no feature flags configured yet/i)).toBeInTheDocument();
  });

  it("renders a row per configured toggle with its live/off status", () => {
    mockQueryData.current = [
      {
        id: "flag-1",
        feature_key: "waitlist_enabled",
        display_name: "Waitlist signups",
        description: "Public waitlist capture form",
        master_enabled: true,
        updated_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "flag-2",
        feature_key: "other_countries_interest_enabled",
        display_name: "Other countries interest",
        description: null,
        master_enabled: false,
        updated_at: "2026-10-01T00:00:00Z",
      },
    ];
    render(<FeatureFlagsPage />);
    expect(screen.getByText("Waitlist signups")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Other countries interest")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByText(/no feature flags configured yet/i)).not.toBeInTheDocument();
  });
});
