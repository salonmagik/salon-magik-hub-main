import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  BlockingBannerOverlay: () => null,
  MaintenanceBannerModal: () => null,
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

vi.mock("@/components/session/NewDeviceReviewModal", () => ({
  NewDeviceReviewModal: () => null,
}));

vi.mock("@/components/profile/MyProfileModal", () => ({
  MyProfileModal: () => null,
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

vi.mock("@/hooks/useStaffOperationsAddon", () => ({
  useStaffOperationsAddon: () => ({
    isEnabled: false,
    isPlanEligible: false,
    locationCount: 1,
    monthlyTotal: 0,
    hasValidPrice: false,
    priceLabel: null,
    isUpdating: false,
    toggle: vi.fn(),
  }),
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

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
      tenants: [{ id: "tenant-1", name: "Tenant", slug: "tenant" }],
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

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/salon/appointments"]}>
          <SalonSidebar>
            <div>Child Content</div>
          </SalonSidebar>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Access Updated")).toBeInTheDocument();
    expect(screen.getByText(/Your role has been updated by an admin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("does not navigate when a touch gesture scrolls across a sidebar link", () => {
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
      tenants: [{ id: "tenant-1", name: "Tenant", slug: "tenant" }],
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
      notifications: [],
      unreadCount: 0,
      urgentNotifications: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
    } as any);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/salon/appointments"]}>
          <SalonSidebar>
            <LocationProbe />
          </SalonSidebar>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const reportsLink = screen.getAllByRole("link", { name: "Reports" })[0];
    fireEvent.pointerDown(reportsLink, {
      pointerId: 1,
      isPrimary: true,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(reportsLink, {
      pointerId: 1,
      isPrimary: true,
      clientX: 20,
      clientY: 48,
    });
    fireEvent.pointerCancel(reportsLink, { pointerId: 1 });
    fireEvent.click(reportsLink);

    expect(screen.getByTestId("location")).toHaveTextContent("/salon/appointments");

    fireEvent.pointerDown(reportsLink, {
      pointerId: 2,
      isPrimary: true,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.click(reportsLink);

    expect(screen.getByTestId("location")).toHaveTextContent("/salon/reports");
  });
});
