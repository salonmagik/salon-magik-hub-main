import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SalonDashboard from "./SalonDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardStats } from "@/hooks/useDashboardStats";

vi.mock("@/components/layout/SalonSidebar", () => ({
  SalonSidebar: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useDashboardStats", () => ({
  useDashboardStats: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...(actual as object),
    useQuery: vi.fn().mockReturnValue({ data: null }),
  };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDashboardStats = vi.mocked(useDashboardStats);

function renderDashboard() {
  return render(
    <MemoryRouter>
      <SalonDashboard />
    </MemoryRouter>
  );
}

describe("SalonDashboard setup tracker visibility", () => {
  it("shows setup tracker to owners and managers only", () => {
    mockedUseDashboardStats.mockReturnValue({
      stats: {
        todayAppointments: 0,
        confirmedCount: 0,
        outstandingFees: 0,
        purseUsage: 0,
        refundsPendingApproval: 0,
        lowCommunicationCredits: false,
      },
      upcomingAppointments: [],
      checklistItems: [{ id: "services", label: "Add services", href: "/salon/services", completed: false }],
      checklistProgress: 20,
      isChecklistComplete: false,
      insights: [],
      recentActivity: [],
      isLoading: false,
    } as any);

    mockedUseAuth.mockReturnValue({
      currentTenant: { id: "tenant-1", currency: "USD", plan: "chain" },
      profile: { full_name: "Owner One" },
      currentRole: "owner",
    } as any);
    const ownerView = renderDashboard();
    expect(screen.getByText(/Complete your salon setup/i)).toBeInTheDocument();
    ownerView.unmount();

    mockedUseAuth.mockReturnValue({
      currentTenant: { id: "tenant-1", currency: "USD", plan: "chain" },
      profile: { full_name: "Manager One" },
      currentRole: "manager",
    } as any);
    const managerView = renderDashboard();
    expect(screen.getByText(/Complete your salon setup/i)).toBeInTheDocument();
    managerView.unmount();

    mockedUseAuth.mockReturnValue({
      currentTenant: { id: "tenant-1", currency: "USD", plan: "chain" },
      profile: { full_name: "Staff One" },
      currentRole: "staff",
    } as any);
    renderDashboard();
    expect(screen.queryByText(/Complete your salon setup/i)).not.toBeInTheDocument();
  });
});
