import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { InviteStaffDialog } from "./InviteStaffDialog";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    currentTenant: { id: "tenant-1", plan: "studio" },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { can_add: true, used: 1, allowed: 3 },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@ui/ui/use-toast", () => ({ toast: vi.fn() }));

describe("InviteStaffDialog", () => {
  it("renders the redesigned invitation form with seat availability and role guidance", () => {
    render(
      <MemoryRouter>
        <InviteStaffDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Invite staff member" })).toBeInTheDocument();
    expect(screen.getByText("Seats used: 1/3")).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeRequired();
    expect(screen.getByLabelText(/last name/i)).toBeRequired();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("type", "email");
    expect(screen.getByText("View assigned appointments only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeEnabled();
  });
});
