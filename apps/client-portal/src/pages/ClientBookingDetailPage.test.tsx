import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ClientBookingDetailPage from "./ClientBookingDetailPage";

vi.mock("@/hooks", () => ({
  useClientAuth: () => ({
    customers: [],
    isAuthenticated: true,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("@/components/ClientSidebar", () => ({
  ClientSidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ClientBookingDetailPage", () => {
  it("shows booking not found state when no customer context exists", () => {
    render(
      <MemoryRouter initialEntries={["/client/bookings/booking-1"]}>
        <Routes>
          <Route path="/client/bookings/:id" element={<ClientBookingDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/booking not found/i)).toBeInTheDocument();
  });
});
