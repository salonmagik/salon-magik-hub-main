import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ForcePasswordChangeDialog } from "./ForcePasswordChangeDialog";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { needsGoogleProfileCompletion } from "@/lib/authCompletion";
import { clearGoogleOAuthIntent, readGoogleOAuthIntent } from "@/lib/googleOAuthFlow";
import { BrandLoader } from "@/components/BrandLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

function LoadingScreen() {
  return <BrandLoader fullScreen />;
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const {
    isLoading,
    isAuthenticated,
    hasCompletedOnboarding,
    user,
    profile,
    currentTenant,
    activeContextType,
    isAssignmentPending,
    requiresPasswordChange,
    clearPasswordChangeFlag,
  } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated || !currentTenant?.id || !user?.id) return;
    (async () => {
      await (supabase.rpc as any)("log_audit_event", {
        _tenant_id: currentTenant.id,
        _action: "nav.page_view",
        _entity_type: "route",
        _entity_id: user.id,
        _metadata: {
          context_type: activeContextType,
          route: location.pathname,
        },
      });
    })();
  }, [activeContextType, currentTenant?.id, isAuthenticated, location.pathname, user?.id]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // BackOffice users should not access salon routes - they have no profile
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (needsGoogleProfileCompletion(user) && location.pathname !== "/complete-signup") {
    return <Navigate to="/complete-signup" replace />;
  }

  // If onboarding is required but not completed, redirect to onboarding
  if (requireOnboarding && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  if (isAssignmentPending) {
    const isAllowedPendingPath =
      location.pathname === "/salon/assignment-pending" || location.pathname === "/salon/help";
    if (!isAllowedPendingPath) {
      return <Navigate to="/salon/assignment-pending" replace />;
    }
  } else if (location.pathname === "/salon/assignment-pending") {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {/* Force password change dialog for invited staff */}
      <ForcePasswordChangeDialog
        open={requiresPasswordChange}
        onPasswordChanged={clearPasswordChangeFlag}
      />
      {children}
    </>
  );
}

// For routes that should NOT be accessible after login (login, signup, etc.)
export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, hasCompletedOnboarding, profile, activeContextType, isAssignmentPending, user, resolveFallbackFirstRoute } = useAuth();
  const location = useLocation();
  const googleOAuthIntent = readGoogleOAuthIntent();

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Only redirect if authenticated AND has a profile (not a BackOffice-only user)
  if (isAuthenticated && profile) {
    if (needsGoogleProfileCompletion(user)) {
      return <Navigate to="/complete-signup" replace />;
    }
    const allowGoogleReturnHandling =
      !hasCompletedOnboarding &&
      ((location.pathname === "/login" && googleOAuthIntent?.source === "login") ||
        (location.pathname === "/signup" && googleOAuthIntent?.source === "signup"));
    if (allowGoogleReturnHandling) {
      return <>{children}</>;
    }
    if (googleOAuthIntent) {
      clearGoogleOAuthIntent();
    }
    const defaultRoute = hasCompletedOnboarding
      ? isAssignmentPending
        ? "/salon/assignment-pending"
        : activeContextType === "owner_hub"
          ? "/salon/overview"
          : resolveFallbackFirstRoute(activeContextType)
      : "/onboarding";
    const requestedFrom = (location.state as any)?.from?.pathname as string | undefined;
    const from =
      requestedFrom && requestedFrom !== "/salon/access-denied"
        ? requestedFrom
        : defaultRoute;
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}

// For the onboarding route specifically
export function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, hasCompletedOnboarding, profile, activeContextType, isAssignmentPending, user, resolveFallbackFirstRoute } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // BackOffice users should not access onboarding - they have no profile
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (needsGoogleProfileCompletion(user)) {
    return <Navigate to="/complete-signup" replace />;
  }

  // If onboarding is already completed, go to salon
  if (hasCompletedOnboarding) {
    if (isAssignmentPending) {
      return <Navigate to="/salon/assignment-pending" replace />;
    }
    return <Navigate to={activeContextType === "owner_hub" ? "/salon/overview" : resolveFallbackFirstRoute(activeContextType)} replace />;
  }

  return <>{children}</>;
}
