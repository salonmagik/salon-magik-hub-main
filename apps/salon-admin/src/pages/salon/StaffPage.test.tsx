import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import StaffPage from "./StaffPage";
import { useStaff } from "@/hooks/useStaff";
import { useStaffInvitations } from "@/hooks/useStaffInvitations";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/components/layout/SalonSidebar", () => ({
  SalonSidebar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dialogs/InviteStaffDialog", () => ({
  InviteStaffDialog: () => null,
}));

vi.mock("@/components/dialogs/ConfirmActionDialog", () => ({
  ConfirmActionDialog: () => null,
}));

vi.mock("@/components/staff/PermissionsTab", () => ({
  PermissionsTab: () => <div>Permissions tab</div>,
}));

vi.mock("@/hooks/useStaff", () => ({
  useStaff: vi.fn(),
}));

vi.mock("@/hooks/useStaffInvitations", () => ({
  useStaffInvitations: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...(actual as object),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "staff-assignment-locations") {
        return { data: [{ id: "loc-1", name: "Main Location" }] };
      }
      if (queryKey[0] === "staff-user-overrides") {
        return { data: [] };
      }
      if (queryKey[0] === "staff-role-permissions") {
        return { data: [] };
      }
      return { data: [] };
    },
  };
});

const mockedUseStaff = vi.mocked(useStaff);
const mockedUseStaffInvitations = vi.mocked(useStaffInvitations);
const mockedUseAuth = vi.mocked(useAuth);

describe("StaffPage team member modal", () => {
  it("renders merged tabs and keeps save disabled until changes are made", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "11111111-1111-1111-1111-111111111111", email: "owner@test.com" },
      currentTenant: { id: "tenant-1", plan: "chain" },
      currentRole: "owner",
    } as any);

    mockedUseStaff.mockReturnValue({
      staff: [
        {
          userId: "22222222-2222-2222-2222-222222222222",
          role: "manager",
          isActive: true,
          roleAssignedAt: "2026-02-28T10:00:00.000Z",
          email: "jane@test.com",
          joinedAt: "2026-02-20T09:00:00.000Z",
          profile: {
            user_id: "22222222-2222-2222-2222-222222222222",
            full_name: "Jane Doe",
            phone: "233000000000",
            avatar_url: null,
          },
          assignedLocationIds: ["loc-1"],
          assignedLocationNames: ["Main Location"],
          assignedLocationCount: 1,
          isUnassigned: false,
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
      updateStaffLocal: vi.fn(),
    } as any);

    mockedUseStaffInvitations.mockReturnValue({
      invitations: [],
      isLoading: false,
      refetch: vi.fn(),
      cancelInvitation: vi.fn(),
      resendInvitation: vi.fn(),
      canResend: vi.fn().mockReturnValue(false),
    } as any);

    render(
      <MemoryRouter initialEntries={["/salon/overview/staff"]}>
        <StaffPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Jane Doe"));

    expect(screen.getByText("Team Member")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Locations" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Role & Permissions" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("jane@test.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Changes" })).toBeDisabled();
  });
});
