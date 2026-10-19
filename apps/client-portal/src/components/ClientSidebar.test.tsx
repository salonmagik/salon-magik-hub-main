import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ClientSidebar } from "./ClientSidebar";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

vi.mock("@/hooks", () => ({
  useClientAuth: () => ({
    signOut: vi.fn(),
    profile: { full_name: "Test User", client_password_initialized: true, details_confirmed_at: "2026-01-01T00:00:00Z" },
    customers: [],
    isLoading: false,
  }),
  useClientNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
  useConfirmDetailsPrompt: () => ({ forceOpen: false, requestOpen: vi.fn(), setForceOpen: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn(), auth: {} },
}));

vi.mock("./ClientInactivityGuard", () => ({
  ClientInactivityGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/MaintenanceBanner", () => ({
  MaintenanceBanner: () => null,
}));

vi.mock("@/components/ConfirmDetailsModal", () => ({
  ConfirmDetailsModal: () => null,
  needsDetailsConfirmation: () => false,
}));

vi.mock("@shared/ProductAnnouncementCard", () => ({
  ProductAnnouncementCard: () => null,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <Routes>
        <Route path="*" element={<ClientSidebar>page content</ClientSidebar>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClientSidebar mobile bottom nav", () => {
  it("shows the bottom nav with Home active on the dashboard", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Primary mobile navigation" });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByText("Home")).toHaveClass("text-white");
  });

  it("hides the bottom nav entirely on a booking's own detail page", () => {
    renderAt("/bookings/booking-1");
    expect(screen.queryByRole("navigation", { name: "Primary mobile navigation" })).not.toBeInTheDocument();
  });

  it("keeps the bottom nav on the bookings list itself", () => {
    renderAt("/bookings");
    expect(screen.getByRole("navigation", { name: "Primary mobile navigation" })).toBeInTheDocument();
  });

  it("highlights More, not any primary tab, while on a route reached through it", () => {
    renderAt("/history");
    const nav = screen.getByRole("navigation", { name: "Primary mobile navigation" });
    expect(within(nav).getByText("More")).toHaveClass("text-white");
    expect(within(nav).getByText("Home")).toHaveClass("text-white/60");
  });
});
