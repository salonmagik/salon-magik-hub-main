import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage";

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey.includes("kill_switch")) return { data: { enabled: false }, isLoading: false };
    if (queryKey.includes("market-countries-admin")) return { data: [], isLoading: false };
    if (queryKey.includes("market-country-currencies-admin")) return { data: [], isLoading: false };
    if (queryKey.includes("default_trial_days")) return { data: 14, isLoading: false };
    return { data: null, isLoading: false };
  },
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

describe("SettingsPage", () => {
  it("renders settings and market management tab", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /markets/i })).toBeInTheDocument();
  });
});
