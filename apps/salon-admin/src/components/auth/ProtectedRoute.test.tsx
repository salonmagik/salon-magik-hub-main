import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute, OnboardingRoute } from "./ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

const mockedUseAuth = vi.mocked(useAuth);

function baseAuthState(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isAuthenticated: true,
    hasCompletedOnboarding: false,
    user: { id: "user-1", user_metadata: {} },
    profile: { id: "profile-1" },
    currentTenant: null,
    activeContextType: "owner_hub",
    isAssignmentPending: false,
    requiresPasswordChange: false,
    clearPasswordChangeFlag: vi.fn(),
    resolveFallbackFirstRoute: () => "/salon/overview",
    ...overrides,
  } as unknown as ReturnType<typeof useAuth>;
}

function renderProtected(initialPath: string, requireOnboarding = true) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={initialPath}
          element={
            <ProtectedRoute requireOnboarding={requireOnboarding}>
              <div>protected-content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/onboarding" element={<div>onboarding-page</div>} />
        <Route path="/accept-co-owner" element={<div>accept-co-owner-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderOnboarding() {
  render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route
          path="/onboarding"
          element={
            <OnboardingRoute>
              <div>onboarding-page</div>
            </OnboardingRoute>
          }
        />
        <Route path="/accept-co-owner" element={<div>accept-co-owner-page</div>} />
        <Route path="/salon/overview" element={<div>salon-overview</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute — AD-5 pending co-owner invite guard", () => {
  it("redirects a pending invitee with zero tenants to /accept-co-owner instead of /onboarding", () => {
    mockedUseAuth.mockReturnValue(
      baseAuthState({
        hasCompletedOnboarding: false,
        user: { id: "user-1", user_metadata: { pending_co_owner_invite: true } },
      }),
    );

    renderProtected("/salon/overview");

    expect(screen.getByText("accept-co-owner-page")).toBeInTheDocument();
    expect(screen.queryByText("onboarding-page")).not.toBeInTheDocument();
  });

  it("does NOT redirect a pending invitee who already has tenants (promote-in-place)", () => {
    mockedUseAuth.mockReturnValue(
      baseAuthState({
        hasCompletedOnboarding: true,
        user: { id: "user-1", user_metadata: { pending_co_owner_invite: true } },
      }),
    );

    renderProtected("/salon/overview");

    expect(screen.getByText("protected-content")).toBeInTheDocument();
  });

  it("leaves a user with no pending invite unaffected", () => {
    mockedUseAuth.mockReturnValue(
      baseAuthState({
        hasCompletedOnboarding: false,
        user: { id: "user-1", user_metadata: {} },
      }),
    );

    renderProtected("/salon/overview");

    expect(screen.getByText("onboarding-page")).toBeInTheDocument();
  });

  it("does not redirect-loop when already on /accept-co-owner", () => {
    mockedUseAuth.mockReturnValue(
      baseAuthState({
        hasCompletedOnboarding: false,
        user: { id: "user-1", user_metadata: { pending_co_owner_invite: true } },
      }),
    );

    renderProtected("/accept-co-owner", false);

    expect(screen.getByText("protected-content")).toBeInTheDocument();
  });
});

describe("OnboardingRoute — AD-5 pending co-owner invite guard", () => {
  it("redirects a pending invitee with zero tenants to /accept-co-owner, not the onboarding form", () => {
    mockedUseAuth.mockReturnValue(
      baseAuthState({
        hasCompletedOnboarding: false,
        user: { id: "user-1", user_metadata: { pending_co_owner_invite: true } },
      }),
    );

    renderOnboarding();

    expect(screen.getByText("accept-co-owner-page")).toBeInTheDocument();
    expect(screen.queryByText("onboarding-page")).not.toBeInTheDocument();
  });

  it("leaves a user with no pending invite on the onboarding form", () => {
    mockedUseAuth.mockReturnValue(
      baseAuthState({
        hasCompletedOnboarding: false,
        user: { id: "user-1", user_metadata: {} },
      }),
    );

    renderOnboarding();

    expect(screen.getByText("onboarding-page")).toBeInTheDocument();
  });
});
