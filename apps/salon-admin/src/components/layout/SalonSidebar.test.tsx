import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SalonSidebar } from "./SalonSidebar";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useNotifications } from "@/hooks/useNotifications";

vi.mock("@/components/SalonMagikLogo", () => ({
  SalonMagikLogo: () => <div>Logo</div>,
}));

vi.mock("@/components/dialogs/QuickCreateDialog", () => ({
  QuickCreateDialog: () => null,
}));

vi.mock("@/components/notifications/NotificationsPanel", () => ({
  NotificationsPanel: () => null,
}));

vi.mock("@/components/session/InactivityGuard", () => ({
  InactivityGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/banners", () => ({
  BannerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  GlobalBanner: () => null,
}));

vi.mock("@/components/billing/TrialBanner", () => ({
  TrialBanner: () => null,
}));

vi.mock("@/components/layout/PlanChangeBanner", () => ({
  PlanChangeBanner: () => null,
}));

vi.mock("@/components/layout/AnnualLockinBanner", () => ({
  AnnualLockinBanner: () => null,
}));

vi.mock("@/hooks/useStaffSessions", () => ({
  useStaffSessions: () => ({ startSession: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: vi.fn(),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: vi.fn() },
    rpc: vi.fn().mockResolvedValue({ data: ["/salon/appointments"], error: null }),
  },
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUsePermissions = vi.mocked(usePermissions);
const mockedUseNotifications = vi.mocked(useNotifications);

describe("SalonSidebar access refresh modal", () => {
  it("shows role/location refresh modal for unread access update notifications", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "11111111-1111-1111-1111-111111111111", email: "staff@test.com" },
      profile: { full_name: "Team User" },
      currentTenant: {
        id: "tenant-1",
        name: "Tenant",
        slug: "tenant",
        plan: "chain",
        subscription_status: "active",
      },
      activeContextType: "location",
      activeLocationId: "loc-1",
      availableContexts: [{ type: "location", locationId: "loc-1", label: "Main Location" }],
      isAssignmentPending: false,
      setActiveContext: vi.fn(),
      getFirstAllowedRoute: vi.fn().mockResolvedValue("/salon/appointments"),
      refreshTenants: vi.fn(),
    } as any);

    mockedUsePermissions.mockReturnValue({
      hasPermission: vi.fn().mockReturnValue(true),
      isLoading: false,
    } as any);

    mockedUseNotifications.mockReturnValue({
      notifications: [
        {
          id: "notif-1",
          tenant_id: "tenant-1",
          user_id: "11111111-1111-1111-1111-111111111111",
          type: "staff",
          title: "Role updated",
          description: "Your role changed",
          read: false,
          urgent: true,
          entity_type: "user_role",
          entity_id: "11111111-1111-1111-1111-111111111111",
          created_at: "2026-03-01T10:00:00.000Z",
        },
      ],
      unreadCount: 1,
      urgentNotifications: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={["/salon/appointments"]}>
        <SalonSidebar>
          <div>Child Content</div>
        </SalonSidebar>
      </MemoryRouter>
    );

    expect(screen.getByText("Access Updated")).toBeInTheDocument();
    expect(screen.getByText(/Your role has been updated by an admin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
