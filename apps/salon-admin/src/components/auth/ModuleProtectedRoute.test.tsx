import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ModuleProtectedRoute } from "./ModuleProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { isModuleAllowedInContext } from "@/lib/contextAccess";

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/contextAccess", () => ({
  isModuleAllowedInContext: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const mockedUsePermissions = vi.mocked(usePermissions);
const mockedUseAuth = vi.mocked(useAuth);
const mockedIsModuleAllowedInContext = vi.mocked(isModuleAllowedInContext);

describe("ModuleProtectedRoute", () => {
  it("allows owners through even when context guard would block", () => {
    mockedUsePermissions.mockReturnValue({
      hasPermission: vi.fn().mockReturnValue(false),
      isLoading: false,
      currentRole: "owner",
      permissions: {},
      isOwner: true,
      rolePermissions: [],
      userOverrides: [],
      refetch: vi.fn(),
    } as any);

    mockedUseAuth.mockReturnValue({
      user: { id: "11111111-1111-1111-1111-111111111111" },
      currentTenant: { id: "22222222-2222-2222-2222-222222222222" },
      activeContextType: "owner_hub",
      currentRole: "owner",
      isLoading: false,
      hasCompletedOnboarding: true,
      isAssignmentPending: false,
    } as any);

    mockedIsModuleAllowedInContext.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/salon/audit-log"]}>
        <Routes>
          <Route
            path="/salon/audit-log"
            element={
              <ModuleProtectedRoute module="audit_log">
                <div>owner-visible</div>
              </ModuleProtectedRoute>
            }
          />
          <Route path="/salon/access-denied" element={<div>denied</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("owner-visible")).toBeInTheDocument();
  });
});
