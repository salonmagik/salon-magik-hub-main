import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@ui/tooltip";
import ClientDashboard from "./ClientDashboard";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const upcomingBooking = {
  id: "booking-upcoming",
  status: "scheduled",
  payment_status: "fully_paid",
  scheduled_start: "2026-07-28T10:00:00.000Z",
  total_amount: 200,
  services: [{ id: "service-1", service_name: "Boho Braids" }],
  tenant: { id: "tenant-1", name: "Adjoa's Studio", currency: "GHS" },
};

const completedBooking = {
  ...upcomingBooking,
  id: "booking-completed",
  status: "completed",
  scheduled_start: "2026-07-20T10:00:00.000Z",
};

vi.mock("@/hooks", () => ({
  useClientAuth: () => ({
    customers: [
      {
        id: "customer-1",
        tenant_id: "tenant-1",
        full_name: "Efua Mensah",
        visit_count: 4,
        tenant: {
          id: "tenant-1",
          name: "Adjoa's Studio",
          currency: "GHS",
          country: "Ghana",
        },
      },
    ],
    isLoading: false,
  }),
  useClientBookings: (filter: string) =>
    filter === "completed"
      ? {
          bookings: [completedBooking],
          nextAppointment: undefined,
          isLoading: false,
        }
      : {
          bookings: [upcomingBooking],
          nextAppointment: upcomingBooking,
          isLoading: false,
        },
  useClientBalance: () => ({
    packages: [
      {
        id: "package-1",
        tenant_id: "tenant-1",
        status: "active",
        expires_at: "2026-10-14T00:00:00.000Z",
        package: { id: "catalog-package-1", name: "Starter braid pack" },
        items: [
          {
            id: "item-1",
            total_quantity: 4,
            remaining_quantity: 2,
            reserved_quantity: 0,
          },
        ],
      },
    ],
    isLoading: false,
  }),
  useClientPurse: () => ({
    purses: [{ customer_id: "customer-1", balance: 50 }],
    isLoading: false,
  }),
}));

vi.mock("@/components/ClientSidebar", () => ({
  ClientSidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ClientDashboard", () => {
  it("renders the redesigned dashboard from live-data shapes", () => {
    render(
      <MemoryRouter future={routerFuture}>
        <TooltipProvider>
          <ClientDashboard />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Hi Efua, your next visit/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upcoming bookings" })).toBeInTheDocument();
    expect(screen.getAllByText("Boho Braids")).toHaveLength(2);
    expect(screen.getByText("Starter braid pack")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Salons you visit" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Store credit" })).toBeInTheDocument();
  });
});
