import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ClientProtectedRoute, ClientPublicOnlyRoute } from "./ClientProtectedRoute";

const useClientAuthMock = vi.fn();

vi.mock("@/hooks", () => ({
  useClientAuth: () => useClientAuthMock(),
}));

describe("ClientProtectedRoute", () => {
  it("redirects unauthenticated users to login", () => {
    useClientAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: false });
    render(
      <MemoryRouter initialEntries={["/client"]}>
        <Routes>
          <Route
            path="/client"
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
    useClientAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true });
    render(
      <MemoryRouter initialEntries={["/login"]}>
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
});
