import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@ui/tooltip";
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

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

describe("SettingsPage", () => {
  it("renders the Settings nav with Safety controls as the default section", () => {
    render(
      <TooltipProvider>
        <SettingsPage />
      </TooltipProvider>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /safety controls/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /markets & currency/i })).toBeInTheDocument();
  });

  it("switches sections when a left-nav item is clicked", () => {
    render(
      <TooltipProvider>
        <SettingsPage />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /markets & currency/i }));
    expect(screen.getByRole("heading", { name: /markets & currency/i })).toBeInTheDocument();
  });
});
