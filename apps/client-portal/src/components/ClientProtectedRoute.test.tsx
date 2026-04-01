import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ClientProtectedRoute, ClientPublicOnlyRoute } from "./ClientProtectedRoute";

const useClientAuthMock = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

vi.mock("@/hooks", () => ({
  useClientAuth: () => useClientAuthMock(),
}));

describe("ClientProtectedRoute", () => {
  it("redirects unauthenticated users to login", () => {
    useClientAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: false, requiresPasswordSetup: false });
    render(
      <MemoryRouter initialEntries={["/"]} future={routerFuture}>
        <Routes>
          <Route
            path="/"
            element={
              <ClientProtectedRoute>
                <div>Dashboard</div>
              </ClientProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("redirects authenticated users away from login", () => {
    useClientAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true, requiresPasswordSetup: false });
    render(
      <MemoryRouter initialEntries={["/login"]} future={routerFuture}>
        <Routes>
          <Route
            path="/login"
            element={
              <ClientPublicOnlyRoute>
                <div>Login page</div>
              </ClientPublicOnlyRoute>
            }
          />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("redirects users requiring password setup to the completion route", () => {
    useClientAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true, requiresPasswordSetup: true });

    render(
      <MemoryRouter initialEntries={["/bookings"]} future={routerFuture}>
        <Routes>
          <Route
            path="/bookings"
            element={
              <ClientProtectedRoute>
                <div>Bookings</div>
              </ClientProtectedRoute>
            }
          />
          <Route path="/complete-account" element={<div>Complete account</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Complete account")).toBeInTheDocument();
  });
});
